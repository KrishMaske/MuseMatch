import { embeddingLogger } from '../config/logger.js';
import { prisma } from '../config/prisma.js';
import { artworkRepository } from '../repositories/artworkRepository.js';
import { embeddingRepository } from '../repositories/embeddingRepository.js';
import { embeddingService } from '../services/embeddings/embeddingService.js';

/**
 * Generates embeddings for cached artworks that do not have one yet.
 *
 * Safe to re-run: it only touches rows where `embedding IS NULL`. Pass
 * `--reset` after switching embedding providers -- vectors from two different
 * models share a column but not a space, and mixing them makes every
 * similarity score meaningless.
 *
 *   npm run embeddings:backfill --workspace @musematch/server
 *   npm run embeddings:backfill --workspace @musematch/server -- --reset
 */

const BATCH_SIZE = 32;

async function main(): Promise<void> {
  const shouldReset = process.argv.includes('--reset');

  if (shouldReset) {
    embeddingLogger.warn('Clearing all stored embeddings before backfilling');
    await embeddingRepository.clearAll();
  }

  const total = await artworkRepository.count();
  const alreadyEmbedded = await embeddingRepository.countEmbedded();

  embeddingLogger.info(
    { provider: embeddingService.providerName, total, alreadyEmbedded },
    'Starting embedding backfill',
  );

  let embedded = 0;

  for (;;) {
    const ids = await embeddingRepository.listMissing(BATCH_SIZE);
    if (ids.length === 0) break;

    const artworks = await artworkRepository.findManyByIds(ids);
    if (artworks.length === 0) break;

    const vectors = await embeddingService.embedArtworks(artworks);

    await embeddingRepository.saveMany(
      artworks.map((artwork, index) => ({
        artworkId: artwork.id,
        vector: vectors[index] as number[],
      })),
    );

    embedded += artworks.length;
    embeddingLogger.info(
      { embedded, remaining: total - alreadyEmbedded - embedded },
      'Backfill progress',
    );
  }

  embeddingLogger.info(
    { embedded, provider: embeddingService.providerName },
    'Embedding backfill complete',
  );
}

main()
  .catch((error) => {
    embeddingLogger.error({ err: error }, 'Embedding backfill failed');
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
