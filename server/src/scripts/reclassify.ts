import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { rowToArtwork } from '../repositories/artworkRepository.js';
import { reclassifyArtwork } from '../services/museums/normalize.js';

/**
 * Re-runs the taxonomy classifier over every cached artwork.
 *
 * Run this after changing a rule in `services/museums/taxonomy.ts`. Without
 * it, the new rules only apply to artworks fetched afterwards, and the cache
 * would hold two generations of tags at once -- which would quietly skew
 * recommendations toward whichever half a user happened to be shown.
 */

const BATCH_SIZE = 200;

async function main(): Promise<void> {
  const total = await prisma.artwork.count();
  logger.info({ total }, 'Reclassifying cached artworks');

  let processed = 0;
  let changed = 0;

  for (let skip = 0; skip < total; skip += BATCH_SIZE) {
    const rows = await prisma.artwork.findMany({
      skip,
      take: BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
    });

    for (const row of rows) {
      const artwork = rowToArtwork(row);
      const updated = reclassifyArtwork(artwork);
      processed += 1;

      if (sameTags(artwork.tags, updated.tags)) continue;

      await prisma.artwork.update({ where: { id: row.id }, data: { tags: updated.tags } });
      changed += 1;
    }

    logger.info({ processed, total }, 'Reclassification progress');
  }

  logger.info(
    { processed, changed },
    'Reclassification complete. Re-run the embedding backfill if facets changed materially.',
  );
}

function sameTags(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((tag) => setA.has(tag));
}

main()
  .catch((error) => {
    logger.error({ err: error }, 'Reclassification failed');
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
