/**
 * The normalized artwork model.
 *
 * Every museum provider maps its own response shape onto this interface inside
 * the server's provider layer. Nothing downstream of `MuseumService` -- and in
 * particular nothing in the client -- should ever branch on `source`.
 */

export const MUSEUM_SOURCES = ['MET', 'AIC'] as const;
export type MuseumSource = (typeof MUSEUM_SOURCES)[number];

export const MUSEUM_NAMES: Record<MuseumSource, string> = {
  MET: 'The Metropolitan Museum of Art',
  AIC: 'Art Institute of Chicago',
};

export interface Artwork {
  /** Stable local id (cuid) once the artwork has been persisted. */
  id: string;
  source: MuseumSource;
  /** The provider's own identifier, unique within that provider. */
  externalId: string;
  museumName: string;

  title: string;
  /** `null` when the provider has no attribution. Never invent one. */
  artist: string | null;
  artistDisplay: string | null;

  /** Human-readable date as the museum prints it, e.g. "ca. 1906". */
  year: string | null;
  dateStart: number | null;
  dateEnd: number | null;

  imageUrl: string | null;
  thumbnailUrl: string | null;

  medium: string | null;
  department: string | null;
  classification: string | null;
  culture: string | null;
  period: string | null;

  description: string | null;
  /** Link to the artwork's page on the museum's own website. */
  objectUrl: string | null;

  /** Normalized lower-case descriptors used by the recommendation engine. */
  tags: string[];
  metadata: Record<string, unknown>;
}

/** Copy used when a provider simply does not supply a field. */
export const UNKNOWN_LABELS = {
  artist: 'Unknown artist',
  year: 'Date unavailable',
  medium: 'Medium unavailable',
  department: 'Department unavailable',
  culture: 'Culture unavailable',
} as const;

export interface ArtworkSearchParams {
  q?: string;
  museum?: MuseumSource;
  medium?: string;
  period?: string;
  artist?: string;
  department?: string;
  classification?: string;
  culture?: string;
  theme?: string;
  page?: number;
  limit?: number;
  sort?: ArtworkSort;
  /** Natural-language search routed through embeddings instead of keywords. */
  semantic?: boolean;
}

/** Personalized context returned with an artwork detail request. */
export interface ArtworkMatch {
  matchPercent: number;
  reasons: string[];
}

export const ARTWORK_SORTS = ['recommended', 'relevance', 'oldest', 'newest'] as const;
export type ArtworkSort = (typeof ARTWORK_SORTS)[number];
