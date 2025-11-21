import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { prisma } from '../config/prisma.js';
import { artworkRepository } from '../repositories/artworkRepository.js';
import { normalizeArtwork } from '../services/museums/normalize.js';

/**
 * API integration tests.
 *
 * These run against the real database and the real middleware stack, because
 * the things most worth protecting here -- that a token is required, and that
 * one user cannot reach another's collections -- are properties of the wiring,
 * not of any single function.
 *
 * Each test file uses its own dev identities and removes them afterwards, so a
 * run does not disturb seeded development data.
 */

const ALICE = 'test-alice-0000-0000-0000-000000000001';
const BOB = 'test-bob-0000-0000-0000-000000000002';

let app: Express;
let artworkId: string;
let aicArtworkId: string;

const asAlice = () => ({ 'x-dev-user': ALICE });
const asBob = () => ({ 'x-dev-user': BOB });

beforeAll(async () => {
  app = createApp();

  const artwork = await artworkRepository.upsert(
    normalizeArtwork({
      source: 'MET',
      externalId: 'api-test-artwork',
      title: 'Test Landscape',
      artist: 'Test Painter',
      medium: 'Oil on canvas',
      classification: 'Paintings',
      department: 'European Paintings',
      imageUrl: 'https://example.invalid/image.jpg',
      dateStart: 1870,
      dateEnd: 1870,
    }),
  );

  artworkId = artwork.id;
  const aicArtwork = await artworkRepository.upsert(
    normalizeArtwork({
      source: 'AIC',
      externalId: 'api-test-aic-artwork',
      title: 'Test Chicago Sculpture',
      medium: 'Bronze',
      classification: 'Sculpture',
      imageUrl: 'https://example.invalid/aic-image.jpg',
    }),
  );
  aicArtworkId = aicArtwork.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { supabaseUserId: { in: [ALICE, BOB] } } });
  await prisma.artwork.deleteMany({
    where: { externalId: { in: ['api-test-artwork', 'api-test-aic-artwork'] } },
  });
  await prisma.$disconnect();
});

describe('authentication', () => {
  it('rejects a request carrying an invalid bearer token', async () => {
    const response = await request(app)
      .get('/api/profile')
      .set('authorization', 'Bearer not-a-real-token');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('does not leak a stack trace in the error body', async () => {
    const response = await request(app)
      .get('/api/profile')
      .set('authorization', 'Bearer not-a-real-token');

    expect(JSON.stringify(response.body)).not.toMatch(/at .*\.ts:\d+|node_modules/);
  });

  it('serves the quiz definition without authentication', async () => {
    const response = await request(app).get('/api/onboarding/quiz');

    expect(response.status).toBe(200);
    expect(response.body.data.questions.length).toBeGreaterThan(0);
  });

  it('provisions a local profile on first authenticated request', async () => {
    const response = await request(app).get('/api/profile').set(asAlice());

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBeTruthy();
    expect(response.body.data.onboardingCompleted).toBe(false);
  });

  it('returns the standard envelope for an unknown route', async () => {
    const response = await request(app).get('/api/does-not-exist').set(asAlice());

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});

describe('onboarding', () => {
  it('rejects answers that are not in the quiz', async () => {
    const response = await request(app)
      .post('/api/profile/onboarding')
      .set(asAlice())
      .send({ answers: { medium: ['hologram'] } });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toBeTruthy();
  });

  it('stores weights and marks onboarding complete', async () => {
    const response = await request(app)
      .post('/api/profile/onboarding')
      .set(asAlice())
      .send({
        answers: {
          medium: ['painting'],
          era: ['19th-century'],
          theme: ['nature'],
          experience: ['relaxing'],
          style: ['peaceful'],
          doorway: ['light-room'],
          pace: ['slow'],
          exploration: ['balanced'],
        },
      });

    expect(response.status).toBe(201);
    expect(response.body.data.explicit.medium.painting).toBeCloseTo(1);
    expect(response.body.data.onboardingCompleted).toBe(true);

    const profile = await request(app).get('/api/profile').set(asAlice());
    expect(profile.body.data.onboardingCompleted).toBe(true);
  });
});

describe('collections', () => {
  let collectionId: string;

  it('creates a collection', async () => {
    const response = await request(app)
      .post('/api/collections')
      .set(asAlice())
      .send({ name: 'Test Collection', description: 'For the API tests' });

    expect(response.status).toBe(201);
    expect(response.body.data.name).toBe('Test Collection');
    collectionId = response.body.data.id;
  });

  it('rejects a collection with no name', async () => {
    const response = await request(app)
      .post('/api/collections')
      .set(asAlice())
      .send({ name: '  ' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('adds an artwork', async () => {
    const response = await request(app)
      .post(`/api/collections/${collectionId}/items`)
      .set(asAlice())
      .send({ artworkId });

    expect(response.status).toBe(201);
    expect(response.body.data.items).toHaveLength(1);
  });

  it('refuses to add the same artwork twice', async () => {
    const response = await request(app)
      .post(`/api/collections/${collectionId}/items`)
      .set(asAlice())
      .send({ artworkId });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it("hides another user's collection", async () => {
    // Reported as not found rather than forbidden, so the API does not confirm
    // which collection ids exist.
    const response = await request(app).get(`/api/collections/${collectionId}`).set(asBob());

    expect(response.status).toBe(404);
  });

  it('refuses to let another user modify it', async () => {
    const patch = await request(app)
      .patch(`/api/collections/${collectionId}`)
      .set(asBob())
      .send({ name: 'Hijacked' });
    expect(patch.status).toBe(404);

    const remove = await request(app).delete(`/api/collections/${collectionId}`).set(asBob());
    expect(remove.status).toBe(404);

    const addItem = await request(app)
      .post(`/api/collections/${collectionId}/items`)
      .set(asBob())
      .send({ artworkId });
    expect(addItem.status).toBe(404);

    const still = await request(app).get(`/api/collections/${collectionId}`).set(asAlice());
    expect(still.body.data.name).toBe('Test Collection');
  });

  it("lists only the caller's own collections", async () => {
    const alice = await request(app).get('/api/collections').set(asAlice());
    const bob = await request(app).get('/api/collections').set(asBob());

    expect(alice.body.data.length).toBeGreaterThan(0);
    expect(bob.body.data).toHaveLength(0);
  });

  it('removes an artwork and then the collection', async () => {
    const removed = await request(app)
      .delete(`/api/collections/${collectionId}/items/${artworkId}`)
      .set(asAlice());
    expect(removed.status).toBe(200);
    expect(removed.body.data.items).toHaveLength(0);

    const deleted = await request(app).delete(`/api/collections/${collectionId}`).set(asAlice());
    expect(deleted.status).toBe(204);

    const gone = await request(app).get(`/api/collections/${collectionId}`).set(asAlice());
    expect(gone.status).toBe(404);
  });
});

describe('interactions', () => {
  it('records an interaction against the authenticated user, not a body field', async () => {
    const response = await request(app)
      .post('/api/interactions')
      .set(asAlice())
      .send({ artworkId, type: 'SAVE', userId: 'someone-else' });

    expect(response.status).toBe(201);

    const alice = await prisma.user.findUnique({ where: { supabaseUserId: ALICE } });
    const interaction = await prisma.interaction.findFirst({
      where: { id: response.body.data.id },
      select: { userId: true },
    });

    expect(interaction?.userId).toBe(alice?.id);
  });

  it('rejects an unknown interaction type', async () => {
    const response = await request(app)
      .post('/api/interactions')
      .set(asAlice())
      .send({ artworkId, type: 'ADMIRE' });

    expect(response.status).toBe(422);
  });

  it('moves the behavioral profile', async () => {
    const before = await request(app).get('/api/profile/preferences').set(asAlice());

    await request(app)
      .post('/api/interactions')
      .set(asAlice())
      .send({ artworkId, type: 'ADD_TO_VISIT' });

    const after = await request(app).get('/api/profile/preferences').set(asAlice());

    expect(after.body.data.behavioral.medium.painting ?? 0).toBeGreaterThan(
      before.body.data.behavioral.medium.painting ?? 0,
    );
  });
});

describe('visits', () => {
  let visitId: string;

  it('creates a visit', async () => {
    const response = await request(app)
      .post('/api/visits')
      .set(asAlice())
      .send({ name: 'Test Visit', museum: 'MET', availableMinutes: 120 });

    expect(response.status).toBe(201);
    visitId = response.body.data.id;
  });

  it('accepts the calendar date the planner form submits', async () => {
    // `<input type="date">` yields "2026-09-15", not a full ISO timestamp.
    const response = await request(app)
      .post('/api/visits')
      .set(asAlice())
      .send({ name: 'Dated Visit', museum: 'MET', availableMinutes: 120, visitDate: '2026-09-15' });

    expect(response.status).toBe(201);
    expect(response.body.data.visitDate).toContain('2026-09-15');

    await request(app).delete(`/api/visits/${response.body.data.id}`).set(asAlice());
  });

  it('rejects a malformed date', async () => {
    const response = await request(app)
      .post('/api/visits')
      .set(asAlice())
      .send({ name: 'Bad date', museum: 'MET', availableMinutes: 120, visitDate: 'next tuesday' });

    expect(response.status).toBe(422);
  });

  it('rejects a duration outside the allowed range', async () => {
    const response = await request(app)
      .post('/api/visits')
      .set(asAlice())
      .send({ name: 'Impossible', museum: 'MET', availableMinutes: 5000 });

    expect(response.status).toBe(422);
  });

  it('rejects an unknown museum', async () => {
    const response = await request(app)
      .post('/api/visits')
      .set(asAlice())
      .send({ name: 'Nowhere', museum: 'LOUVRE', availableMinutes: 120 });

    expect(response.status).toBe(422);
  });

  it('adds an artwork and rejects a reorder that changes the members', async () => {
    const added = await request(app)
      .post(`/api/visits/${visitId}/items`)
      .set(asAlice())
      .send({ artworkId });
    expect(added.status).toBe(201);

    const bad = await request(app)
      .put(`/api/visits/${visitId}/reorder`)
      .set(asAlice())
      .send({ artworkIds: ['not-in-this-visit'] });

    expect(bad.status).toBe(400);
  });

  it('rejects an artwork from a different museum', async () => {
    const response = await request(app)
      .post(`/api/visits/${visitId}/items`)
      .set(asAlice())
      .send({ artworkId: aicArtworkId });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/visit is for/i);
  });

  it('rejects changing the museum while the visit has items', async () => {
    const response = await request(app)
      .patch(`/api/visits/${visitId}`)
      .set(asAlice())
      .send({ museum: 'AIC' });

    expect(response.status).toBe(400);
  });

  it("hides another user's visit", async () => {
    expect((await request(app).get(`/api/visits/${visitId}`).set(asBob())).status).toBe(404);
    expect((await request(app).post(`/api/visits/${visitId}/generate`).set(asBob())).status).toBe(
      404,
    );
  });

  it('deletes a visit', async () => {
    expect((await request(app).delete(`/api/visits/${visitId}`).set(asAlice())).status).toBe(204);
  });
});

describe('recommendations and artworks', () => {
  it('returns explained recommendations', async () => {
    const response = await request(app).get('/api/recommendations?limit=5').set(asAlice());

    expect(response.status).toBe(200);
    for (const recommendation of response.body.data.recommendations) {
      expect(recommendation.artwork.id).toBeTruthy();
      expect(recommendation.reasons.length).toBeGreaterThan(0);
      expect(recommendation.matchPercent).toBeGreaterThan(0);
    }
  });

  it('rejects an out-of-range limit', async () => {
    const response = await request(app).get('/api/recommendations?limit=9999').set(asAlice());
    expect(response.status).toBe(422);
  });

  it('paginates a cache browse', async () => {
    const response = await request(app).get('/api/artworks?limit=3').set(asAlice());

    expect(response.status).toBe(200);
    expect(response.body.pagination.limit).toBe(3);
    expect(response.body.data.length).toBeLessThanOrEqual(3);
  });

  it('paginates without repeating or skipping artworks', async () => {
    // `upsertMany` runs in a transaction, so a whole batch shares one
    // `createdAt`. Without a unique tiebreaker the sort is only partial and
    // Postgres may order the tied rows differently between two queries,
    // showing a reader the same artwork on two pages.
    const seen = new Set<string>();
    let duplicates = 0;

    for (const page of [1, 2, 3]) {
      const response = await request(app).get(`/api/artworks?limit=4&page=${page}`).set(asAlice());
      expect(response.status).toBe(200);

      for (const artwork of response.body.data as Array<{ id: string }>) {
        if (seen.has(artwork.id)) duplicates += 1;
        seen.add(artwork.id);
      }
    }

    expect(duplicates).toBe(0);
  });

  it('keeps a sorted page stable across identical requests', async () => {
    const query = '/api/artworks?limit=6&page=2&sort=newest';
    const first = await request(app).get(query).set(asAlice());
    const second = await request(app).get(query).set(asAlice());

    expect(first.body.data.map((a: { id: string }) => a.id)).toEqual(
      second.body.data.map((a: { id: string }) => a.id),
    );
  });

  it('rejects a filter value outside the taste vocabulary', async () => {
    const response = await request(app).get('/api/artworks?medium=hologram').set(asAlice());
    expect(response.status).toBe(422);
  });

  it('returns an artwork with its saved-collection state', async () => {
    const response = await request(app).get(`/api/artworks/${artworkId}`).set(asAlice());

    expect(response.status).toBe(200);
    expect(response.body.data.artwork.id).toBe(artworkId);
    expect(Array.isArray(response.body.data.savedInCollectionIds)).toBe(true);
    expect(response.body.data.match.matchPercent).toBeGreaterThanOrEqual(0);
    expect(response.body.data.match.reasons.length).toBeGreaterThan(0);
  });

  it('404s an artwork id that resolves to nothing', async () => {
    const response = await request(app).get('/api/artworks/definitely-not-an-id').set(asAlice());
    expect(response.status).toBe(404);
  });
});
