import type { Artwork } from '@musematch/shared';
import { env } from '../../config/env.js';
import { museumLogger } from '../../config/logger.js';
import { fetchJson } from '../../utils/http.js';
import { normalizeArtwork } from './normalize.js';
import type { MuseumProvider, MuseumSearchQuery, MuseumSearchResult } from './types.js';

/**
 * Art Institute of Chicago API.
 *
 * The opposite shape to the Met: search returns full records with a `fields`
 * projection and real pagination, so no hydration step is needed. Images are
 * assembled from a IIIF base plus an `image_id`, which is why an artwork with
 * no `image_id` has no image URL rather than a broken one.
 */

interface AicThumbnail {
  lqip?: string;
  width?: number;
  height?: number;
  alt_text?: string;
}

interface AicArtwork {
  id: number;
  title?: string;
  artist_title?: string | null;
  artist_display?: string | null;
  date_display?: string | null;
  date_start?: number | null;
  date_end?: number | null;
  medium_display?: string | null;
  department_title?: string | null;
  artwork_type_title?: string | null;
  classification_title?: string | null;
  classification_titles?: string[] | null;
  place_of_origin?: string | null;
  style_title?: string | null;
  style_titles?: string[] | null;
  subject_titles?: string[] | null;
  material_titles?: string[] | null;
  technique_titles?: string[] | null;
  description?: string | null;
  short_description?: string | null;
  credit_line?: string | null;
  dimensions?: string | null;
  gallery_title?: string | null;
  is_public_domain?: boolean;
  image_id?: string | null;
  thumbnail?: AicThumbnail | null;
}

interface AicListResponse {
  pagination?: { total?: number; limit?: number; current_page?: number };
  data: AicArtwork[];
  config?: { iiif_url?: string; website_url?: string };
}

interface AicDetailResponse {
  data: AicArtwork;
  config?: { iiif_url?: string; website_url?: string };
}

const FIELDS = [
  'id',
  'title',
  'artist_title',
  'artist_display',
  'date_display',
  'date_start',
  'date_end',
  'medium_display',
  'department_title',
  'artwork_type_title',
  'classification_title',
  'classification_titles',
  'place_of_origin',
  'style_title',
  'style_titles',
  'subject_titles',
  'material_titles',
  'technique_titles',
  'description',
  'short_description',
  'credit_line',
  'dimensions',
  'gallery_title',
  'is_public_domain',
  'image_id',
  'thumbnail',
].join(',');

const DEFAULT_IIIF_URL = 'https://www.artic.edu/iiif/2';
const WEBSITE_URL = 'https://www.artic.edu';

const SAMPLE_SEEDS = [
  'painting',
  'sculpture',
  'photograph',
  'portrait',
  'landscape',
  'textile',
  'print',
  'design',
];

/** AIC caps page size at 100. */
const MAX_PAGE_SIZE = 100;

export class ArtInstituteProvider implements MuseumProvider {
  readonly source = 'AIC' as const;
  readonly name = 'Art Institute of Chicago';

  private readonly baseUrl = env.AIC_API_BASE_URL;

  async search(query: MuseumSearchQuery): Promise<MuseumSearchResult> {
    const params = new URLSearchParams({
      fields: FIELDS,
      limit: String(Math.min(query.limit, MAX_PAGE_SIZE)),
      page: String(Math.max(1, query.page)),
    });

    const terms = [query.q, query.artist, query.medium, query.department].filter(Boolean);
    if (terms.length > 0) params.set('q', terms.join(' '));

    const endpoint = terms.length > 0 ? '/artworks/search' : '/artworks';
    const response = await fetchJson<AicListResponse>(
      `${this.baseUrl}${endpoint}?${params.toString()}`,
      {
        timeoutMs: env.MUSEUM_REQUEST_TIMEOUT_MS,
        label: this.name,
        headers: this.headers(),
      },
    );

    const iiifUrl = response.config?.iiif_url ?? DEFAULT_IIIF_URL;
    let artworks = (response.data ?? []).map((item) => this.toArtwork(item, iiifUrl));

    if (query.requireImage) artworks = artworks.filter((artwork) => artwork.imageUrl);

    // The date filter is applied here rather than in the query because AIC's
    // range syntax is Elasticsearch-shaped and differs per field; doing it
    // locally keeps the provider interface honest about what it supports.
    if (typeof query.dateBegin === 'number' || typeof query.dateEnd === 'number') {
      artworks = artworks.filter((artwork) =>
        withinDateRange(artwork, query.dateBegin, query.dateEnd),
      );
    }

    return { artworks, total: response.pagination?.total ?? artworks.length };
  }

  async getArtwork(externalId: string): Promise<Artwork | null> {
    const params = new URLSearchParams({ fields: FIELDS });

    const response = await fetchJson<AicDetailResponse>(
      `${this.baseUrl}/artworks/${encodeURIComponent(externalId)}?${params.toString()}`,
      { timeoutMs: env.MUSEUM_REQUEST_TIMEOUT_MS, label: this.name, headers: this.headers() },
    );

    if (!response?.data?.id) return null;
    return this.toArtwork(response.data, response.config?.iiif_url ?? DEFAULT_IIIF_URL);
  }

  async sample(limit: number): Promise<Artwork[]> {
    const seeds = shuffle([...SAMPLE_SEEDS]).slice(0, 3);
    const perSeed = Math.max(5, Math.ceil(limit / seeds.length));

    const batches = await Promise.all(
      seeds.map(async (seed) => {
        try {
          const result = await this.search({
            q: seed,
            page: 1,
            limit: perSeed,
            requireImage: true,
          });
          return result.artworks;
        } catch (error) {
          museumLogger.warn({ err: error, seed }, 'AIC sample seed failed');
          return [];
        }
      }),
    );

    const unique = new Map<string, Artwork>();
    for (const artwork of shuffle(batches.flat())) {
      if (!unique.has(artwork.externalId)) unique.set(artwork.externalId, artwork);
    }

    return [...unique.values()].slice(0, limit);
  }

  private toArtwork(item: AicArtwork, iiifUrl: string): Artwork {
    const imageUrl = item.image_id ? `${iiifUrl}/${item.image_id}/full/843,/0/default.jpg` : null;
    const thumbnailUrl = item.image_id
      ? `${iiifUrl}/${item.image_id}/full/400,/0/default.jpg`
      : null;

    const keywords = [
      ...(item.style_titles ?? []),
      ...(item.subject_titles ?? []),
      ...(item.classification_titles ?? []),
      ...(item.material_titles ?? []),
      ...(item.technique_titles ?? []),
      item.artwork_type_title,
    ].filter((value): value is string => Boolean(value));

    return normalizeArtwork({
      source: this.source,
      externalId: String(item.id),
      title: item.title,
      artist: item.artist_title,
      artistDisplay: item.artist_display,
      year: item.date_display,
      dateStart: item.date_start ?? null,
      dateEnd: item.date_end ?? null,
      imageUrl,
      thumbnailUrl,
      medium: item.medium_display,
      department: item.department_title,
      classification: item.classification_title ?? item.artwork_type_title,
      culture: item.place_of_origin,
      period: item.style_title,
      description: item.description ?? item.short_description,
      objectUrl: `${WEBSITE_URL}/artworks/${item.id}`,
      keywords,
      metadata: {
        creditLine: item.credit_line ?? null,
        dimensions: item.dimensions ?? null,
        galleryNumber: item.gallery_title ?? null,
        isPublicDomain: Boolean(item.is_public_domain),
        altText: item.thumbnail?.alt_text ?? null,
        lqip: item.thumbnail?.lqip ?? null,
      },
    });
  }

  private headers(): Record<string, string> {
    return {
      'user-agent': env.MUSEUM_USER_AGENT,
      'AIC-User-Agent': env.MUSEUM_USER_AGENT,
    };
  }
}

function withinDateRange(artwork: Artwork, begin?: number, end?: number): boolean {
  const start = artwork.dateStart ?? artwork.dateEnd;
  const finish = artwork.dateEnd ?? artwork.dateStart;
  if (start === null || finish === null) return false;
  if (typeof begin === 'number' && finish < begin) return false;
  if (typeof end === 'number' && start > end) return false;
  return true;
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
