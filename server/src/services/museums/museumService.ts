import { MUSEUM_SOURCES, type Artwork, type MuseumSource } from '@musematch/shared';
import { museumLogger } from '../../config/logger.js';
import { AppError } from '../../utils/errors.js';
import { ArtInstituteProvider } from './aicProvider.js';
import { MetMuseumProvider } from './metProvider.js';
import type { MuseumProvider, MuseumSearchQuery, MuseumSearchResult } from './types.js';

/**
 * Fans a query out across the registered providers and merges the results.
 *
 * The rule this service exists to enforce: one museum being down degrades the
 * experience, it does not break it. Every provider call is isolated, failures
 * are logged and reported through `unavailable`, and the caller still gets
 * whatever the healthy providers returned.
 */
export class MuseumService {
  private readonly providers: Map<MuseumSource, MuseumProvider>;

  constructor(providers?: MuseumProvider[]) {
    const list = providers ?? [new MetMuseumProvider(), new ArtInstituteProvider()];
    this.providers = new Map(list.map((provider) => [provider.source, provider]));
  }

  getProvider(source: MuseumSource): MuseumProvider {
    const provider = this.providers.get(source);
    if (!provider) throw AppError.notFound(`Unknown museum source: ${source}`);
    return provider;
  }

  listSources(): MuseumSource[] {
    return MUSEUM_SOURCES.filter((source) => this.providers.has(source));
  }

  async search(
    query: MuseumSearchQuery,
    museum?: MuseumSource,
  ): Promise<MuseumSearchResult & { unavailable: MuseumSource[] }> {
    const targets = museum ? [this.getProvider(museum)] : [...this.providers.values()];

    // Each provider is asked for a full page; the merge below interleaves them
    // so a single museum cannot fill the whole result set.
    const settled = await Promise.allSettled(targets.map((provider) => provider.search(query)));

    const unavailable: MuseumSource[] = [];
    const perProvider: Artwork[][] = [];
    let total = 0;

    settled.forEach((outcome, index) => {
      const provider = targets[index];
      if (!provider) return;

      if (outcome.status === 'fulfilled') {
        perProvider.push(outcome.value.artworks);
        total += outcome.value.total;
        return;
      }

      unavailable.push(provider.source);
      museumLogger.warn(
        { err: outcome.reason, provider: provider.source, query: query.q },
        'Museum provider search failed; continuing with remaining providers',
      );
    });

    if (unavailable.length === targets.length) {
      throw AppError.upstream('No museum collections are reachable right now.');
    }

    return { artworks: interleave(perProvider).slice(0, query.limit), total, unavailable };
  }

  async getArtwork(source: MuseumSource, externalId: string): Promise<Artwork | null> {
    return this.getProvider(source).getArtwork(externalId);
  }

  /** A varied pool used to seed recommendations when there is no query. */
  async sample(limit: number, museum?: MuseumSource): Promise<Artwork[]> {
    const targets = museum ? [this.getProvider(museum)] : [...this.providers.values()];
    const perProvider = Math.ceil(limit / targets.length);

    const settled = await Promise.allSettled(
      targets.map((provider) => provider.sample(perProvider)),
    );

    const batches: Artwork[][] = [];
    settled.forEach((outcome, index) => {
      if (outcome.status === 'fulfilled') {
        batches.push(outcome.value);
        return;
      }
      museumLogger.warn(
        { err: outcome.reason, provider: targets[index]?.source },
        'Museum provider sample failed',
      );
    });

    return interleave(batches).slice(0, limit);
  }
}

/** Round-robins lists so sources alternate in the merged output. */
function interleave<T>(lists: T[][]): T[] {
  const merged: T[] = [];
  const longest = Math.max(0, ...lists.map((list) => list.length));

  for (let index = 0; index < longest; index += 1) {
    for (const list of lists) {
      const item = list[index];
      if (item !== undefined) merged.push(item);
    }
  }

  return merged;
}

export const museumService = new MuseumService();
