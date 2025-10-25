import type { Artwork } from '@musematch/shared';
import { env } from '../../config/env.js';
import { museumLogger } from '../../config/logger.js';
import { fetchJson, mapWithConcurrency } from '../../utils/http.js';
import { normalizeArtwork } from './normalize.js';
import type { MuseumProvider, MuseumSearchQuery, MuseumSearchResult } from './types.js';

/**
 * The Metropolitan Museum of Art Collection API.
 *
 * Shape worth knowing: `/search` returns only an array of object ids -- no
 * pagination, no metadata -- so this provider slices the id list itself and
 * hydrates just the page it needs through `/objects/{id}`. That is the reason
 * for the bounded concurrency here; a naive implementation would fire one
 * request per result in the whole match set.
 */

interface MetSearchResponse {
  total: number;
  objectIDs: number[] | null;
}

interface MetTag {
  term?: string;
}

interface MetObject {
  objectID: number;
  isHighlight?: boolean;
  primaryImage?: string;
  primaryImageSmall?: string;
  title?: string;
  artistDisplayName?: string;
  artistDisplayBio?: string;
  objectDate?: string;
  objectBeginDate?: number;
  objectEndDate?: number;
  medium?: string;
  dimensions?: string;
  department?: string;
  classification?: string;
  objectName?: string;
  culture?: string;
  period?: string;
  dynasty?: string;
  creditLine?: string;
  objectURL?: string;
  GalleryNumber?: string;
  tags?: MetTag[] | null;
}

/** Broad seed terms used to build a varied candidate pool. */
const SAMPLE_SEEDS = [
  'painting',
  'sculpture',
  'photograph',
  'portrait',
  'landscape',
  'textile',
  'ceramic',
  'drawing',
];

const DETAIL_CONCURRENCY = 8;

export class MetMuseumProvider implements MuseumProvider {
  readonly source = 'MET' as const;
  readonly name = 'The Metropolitan Museum of Art';

  private readonly baseUrl = env.MET_API_BASE_URL;

  async search(query: MuseumSearchQuery): Promise<MuseumSearchResult> {
    const objectIds = await this.searchObjectIds(query);
    const offset = (query.page - 1) * query.limit;
    const pageIds = objectIds.slice(offset, offset + query.limit);

    const artworks = await this.hydrate(pageIds);

    return {
      artworks: query.requireImage ? artworks.filter((artwork) => artwork.imageUrl) : artworks,
      total: objectIds.length,
    };
  }

  async getArtwork(externalId: string): Promise<Artwork | null> {
    const object = await this.fetchObject(externalId);
    return object ? this.toArtwork(object) : null;
  }

  async sample(limit: number): Promise<Artwork[]> {
    // Rotate which seeds are used so repeated feed refreshes are not identical.
    const seeds = shuffle([...SAMPLE_SEEDS]).slice(0, 3);

    const idBatches = await Promise.all(
      seeds.map(async (seed) => {
        try {
          return await this.searchObjectIds({
            q: seed,
            page: 1,
            limit,
            requireImage: true,
          });
        } catch (error) {
          museumLogger.warn({ err: error, seed }, 'Met sample seed failed');
          return [];
        }
      }),
    );

    const ids = shuffle([...new Set(idBatches.flat())]).slice(0, limit);
    const artworks = await this.hydrate(ids);
    return artworks.filter((artwork) => artwork.imageUrl);
  }

  /** Returns the full id list the Met matched, in its own relevance order. */
  private async searchObjectIds(query: MuseumSearchQuery): Promise<number[]> {
    const params = new URLSearchParams();
    // The Met requires a `q`; an artist- or medium-only search still needs one,
    // so the most specific available term stands in.
    params.set('q', query.q || query.artist || query.medium || query.department || '*');
    if (query.requireImage !== false) params.set('hasImages', 'true');
    if (query.artist) params.set('artistOrCulture', query.artist);
    if (query.medium) params.set('medium', query.medium);
    if (typeof query.dateBegin === 'number' && typeof query.dateEnd === 'number') {
      params.set('dateBegin', String(query.dateBegin));
      params.set('dateEnd', String(query.dateEnd));
    }

    const response = await fetchJson<MetSearchResponse>(
      `${this.baseUrl}/search?${params.toString()}`,
      { timeoutMs: env.MUSEUM_REQUEST_TIMEOUT_MS, label: this.name, headers: this.headers() },
    );

    return response.objectIDs ?? [];
  }

  private async hydrate(ids: number[]): Promise<Artwork[]> {
    const objects = await mapWithConcurrency(ids, DETAIL_CONCURRENCY, async (id) => {
      try {
        return await this.fetchObject(String(id));
      } catch (error) {
        // One dead object id should not fail a page of results.
        museumLogger.debug({ err: error, objectId: id }, 'Met object fetch failed');
        return null;
      }
    });

    return objects
      .filter((object): object is MetObject => object !== null)
      .map((object) => this.toArtwork(object));
  }

  private async fetchObject(externalId: string): Promise<MetObject | null> {
    const object = await fetchJson<MetObject>(
      `${this.baseUrl}/objects/${encodeURIComponent(externalId)}`,
      {
        timeoutMs: env.MUSEUM_REQUEST_TIMEOUT_MS,
        label: this.name,
        headers: this.headers(),
      },
    );

    return object?.objectID ? object : null;
  }

  private toArtwork(object: MetObject): Artwork {
    const keywords = (object.tags ?? [])
      .map((tag) => tag?.term)
      .filter((term): term is string => Boolean(term));

    if (object.objectName) keywords.push(object.objectName);
    if (object.dynasty) keywords.push(object.dynasty);

    return normalizeArtwork({
      source: this.source,
      externalId: String(object.objectID),
      title: object.title,
      artist: object.artistDisplayName,
      artistDisplay: object.artistDisplayName
        ? [object.artistDisplayName, object.artistDisplayBio].filter(Boolean).join(', ')
        : null,
      year: object.objectDate,
      dateStart: object.objectBeginDate ?? null,
      dateEnd: object.objectEndDate ?? null,
      imageUrl: object.primaryImage,
      thumbnailUrl: object.primaryImageSmall,
      medium: object.medium,
      department: object.department,
      classification: object.classification || object.objectName,
      culture: object.culture,
      period: object.period,
      // The Met's records carry no curatorial description field. Rather than
      // synthesize one, the detail page shows the credit line from metadata.
      description: null,
      objectUrl: object.objectURL,
      keywords,
      metadata: {
        isHighlight: Boolean(object.isHighlight),
        creditLine: object.creditLine ?? null,
        dimensions: object.dimensions ?? null,
        galleryNumber: object.GalleryNumber || null,
      },
    });
  }

  private headers(): Record<string, string> {
    return { 'user-agent': env.MUSEUM_USER_AGENT };
  }
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = items[i] as T;
    const b = items[j] as T;
    items[i] = b;
    items[j] = a;
  }
  return items;
}
