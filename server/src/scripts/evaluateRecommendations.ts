import { prisma } from '../config/prisma.js';
import { artworkRepository } from '../repositories/artworkRepository.js';
import {
  describeFacets,
  evaluateProfile,
  EVALUATION_PROFILES,
} from '../services/recommendations/evaluation.js';

/**
 * Runs the synthetic visitors against the real cached collection and prints
 * what each one would be shown.
 *
 * The unit tests assert the same thing against a small fixture; this exists to
 * be *read* after a weight change, because "did the ranking get better" is a
 * judgement call that a boolean cannot make for you.
 *
 *   npm run eval:recommendations --workspace @musematch/server
 */

const TOP_N = 8;

async function main(): Promise<void> {
  const { artworks } = await artworkRepository.search({ requireImage: true, limit: 500, page: 1 });

  if (artworks.length === 0) {
    console.error('No cached artworks. Run `npm run db:seed --workspace @musematch/server` first.');
    process.exitCode = 1;
    return;
  }

  console.log(
    `Evaluating ${EVALUATION_PROFILES.length} synthetic profiles over ${artworks.length} artworks.\n`,
  );

  let failures = 0;

  for (const profile of EVALUATION_PROFILES) {
    const result = evaluateProfile(profile, artworks, TOP_N);
    const verdict = result.passed ? 'PASS' : 'FAIL';

    console.log(`${verdict}  ${profile.id} -- ${profile.description}`);
    console.log(
      `      ${result.matchingCount}/${TOP_N} top results carry an expected facet ` +
        `(needs ${profile.minMatchingTopResults}). Expected: ${profile.expectedTags.join(', ')}`,
    );

    for (const entry of result.topResults) {
      const marker = entry.matched ? '+' : ' ';
      const title = entry.artwork.title.slice(0, 42).padEnd(42);
      console.log(
        `      ${marker} ${String(entry.matchPercent).padStart(3)}%  ${title}  ${describeFacets(entry.artwork)}`,
      );
    }

    console.log('');
    if (!result.passed) failures += 1;
  }

  if (failures > 0) {
    console.error(`${failures} profile(s) did not meet their expectations.`);
    process.exitCode = 1;
  } else {
    console.log('All synthetic profiles ranked plausibly.');
  }
}

main()
  .catch((error) => {
    console.error('Evaluation failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
