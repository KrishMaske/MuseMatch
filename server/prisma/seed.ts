import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_EXPLORATION_SCORE, type Artwork, type QuizAnswers } from '@musematch/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../src/config/prisma.js';
import { artworkRepository } from '../src/repositories/artworkRepository.js';
import { embeddingRepository } from '../src/repositories/embeddingRepository.js';
import { embeddingService } from '../src/services/embeddings/embeddingService.js';
import { museumService } from '../src/services/museums/museumService.js';
import { reclassifyArtwork } from '../src/services/museums/normalize.js';
import { transformQuizAnswers } from '../src/services/profile/preferenceService.js';
import { createEmptyWeights } from '../src/utils/weights.js';

/**
 * Development seed.
 *
 * Artwork records come from the real museum APIs the first time this runs and
 * are cached into `prisma/fixtures/artworks.json`. Every later seed reads that
 * file, so the dataset is deterministic and the whole frontend can be built
 * offline -- without anyone hand-writing museum metadata, which would mean
 * inventing facts about real objects.
 *
 * Delete the fixture file to refresh it from the live APIs.
 */

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(moduleDir, 'fixtures/artworks.json');

const DEV_SUPABASE_USER_ID = 'dev-user-0000-0000-0000-000000000001';
const TARGET_ARTWORK_COUNT = 60;

/** A worked example profile: landscapes, calm, mostly 19th-century painting. */
const SEED_QUIZ_ANSWERS: QuizAnswers = {
  medium: ['painting', 'photography'],
  era: ['19th-century', 'modern'],
  theme: ['nature', 'everyday-life', 'cities'],
  experience: ['relaxing', 'educational'],
  style: ['colorful', 'peaceful'],
  doorway: ['light-room'],
  pace: ['reader'],
  exploration: ['balanced'],
};

async function loadArtworks(): Promise<Artwork[]> {
  if (existsSync(FIXTURE_PATH)) {
    const raw = await readFile(FIXTURE_PATH, 'utf8');
    const artworks = JSON.parse(raw) as Artwork[];
    console.log(`Loaded ${artworks.length} artworks from the fixture file.`);
    return artworks;
  }

  console.log('No fixture found. Fetching a sample from the museum APIs...');
  const artworks = await museumService.sample(TARGET_ARTWORK_COUNT);

  if (artworks.length === 0) {
    throw new Error(
      'Could not reach any museum API and no fixture file exists. ' +
        'Connect to the internet once so the seed can capture a dataset.',
    );
  }

  await mkdir(path.dirname(FIXTURE_PATH), { recursive: true });
  await writeFile(FIXTURE_PATH, `${JSON.stringify(artworks, null, 2)}\n`, 'utf8');
  console.log(
    `Captured ${artworks.length} artworks into ${path.relative(process.cwd(), FIXTURE_PATH)}.`,
  );

  return artworks;
}

async function seedArtworks(): Promise<Artwork[]> {
  const artworks = await loadArtworks();
  // Facets are re-derived rather than trusted from the fixture, so a change to
  // the classifier shows up on the next seed without refetching the museums.
  const persisted = await artworkRepository.upsertMany(artworks.map(reclassifyArtwork));
  console.log(`Cached ${persisted.length} artworks.`);
  return persisted;
}

async function seedEmbeddings(artworks: Artwork[]): Promise<void> {
  const missing = await embeddingRepository.listMissing(artworks.length);
  if (missing.length === 0) {
    console.log('All seeded artworks already have embeddings.');
    return;
  }

  const byId = new Map(artworks.map((artwork) => [artwork.id, artwork]));
  const pending = missing
    .map((id) => byId.get(id))
    .filter((artwork): artwork is Artwork => Boolean(artwork));

  if (pending.length === 0) return;

  const vectors = await embeddingService.embedArtworks(pending);
  await embeddingRepository.saveMany(
    pending.map((artwork, index) => ({
      artworkId: artwork.id,
      vector: vectors[index] as number[],
    })),
  );

  console.log(`Embedded ${pending.length} artworks with ${embeddingService.providerName}.`);
}

async function seedUser(artworks: Artwork[]): Promise<void> {
  const { weights, explorationScore } = transformQuizAnswers(SEED_QUIZ_ANSWERS);

  const user = await prisma.user.upsert({
    where: { supabaseUserId: DEV_SUPABASE_USER_ID },
    create: {
      supabaseUserId: DEV_SUPABASE_USER_ID,
      email: 'dev@musematch.local',
      displayName: 'Dev Visitor',
      onboardingCompleted: true,
    },
    update: { onboardingCompleted: true },
  });

  await prisma.preferenceProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      explicitPreferences: weights as unknown as Prisma.InputJsonValue,
      behavioralPreferences: createEmptyWeights() as unknown as Prisma.InputJsonValue,
      explorationScore,
    },
    update: {
      explicitPreferences: weights as unknown as Prisma.InputJsonValue,
      explorationScore: explorationScore ?? DEFAULT_EXPLORATION_SCORE,
    },
  });

  const withImages = artworks.filter((artwork) => artwork.imageUrl);

  // Two collections: one populated so the collection detail page has content,
  // one empty so the empty state is reachable without deleting anything.
  const favourites = await prisma.collection.upsert({
    where: { id: `seed-collection-${user.id}` },
    create: {
      id: `seed-collection-${user.id}`,
      userId: user.id,
      name: 'Favourites',
      description: 'Pieces worth going back for.',
    },
    update: {},
  });

  for (const artwork of withImages.slice(0, 6)) {
    await prisma.collectionItem.upsert({
      where: { collectionId_artworkId: { collectionId: favourites.id, artworkId: artwork.id } },
      create: { collectionId: favourites.id, artworkId: artwork.id },
      update: {},
    });
  }

  await prisma.collection.upsert({
    where: { id: `seed-collection-empty-${user.id}` },
    create: {
      id: `seed-collection-empty-${user.id}`,
      userId: user.id,
      name: 'Photography inspiration',
      description: null,
    },
    update: {},
  });

  await prisma.visit.upsert({
    where: { id: `seed-visit-${user.id}` },
    create: {
      id: `seed-visit-${user.id}`,
      userId: user.id,
      name: 'Saturday at the Met',
      museum: 'MET',
      availableMinutes: 120,
    },
    update: {},
  });

  // A little history, so the dashboard and behavioral learning have something
  // to show on a fresh database.
  for (const artwork of withImages.slice(0, 8)) {
    const existing = await prisma.interaction.findFirst({
      where: { userId: user.id, artworkId: artwork.id, type: 'VIEW' },
    });
    if (!existing) {
      await prisma.interaction.create({
        data: {
          userId: user.id,
          artworkId: artwork.id,
          type: 'VIEW',
          weight: 0.1,
          sourcePage: 'seed',
        },
      });
    }
  }

  console.log(`Seeded development user ${user.email} (supabaseUserId=${DEV_SUPABASE_USER_ID}).`);
}

async function main(): Promise<void> {
  const artworks = await seedArtworks();
  await seedEmbeddings(artworks);
  await seedUser(artworks);
  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
