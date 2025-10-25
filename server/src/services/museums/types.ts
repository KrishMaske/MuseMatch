import type { Artwork, MuseumSource } from '@musematch/shared';

export interface MuseumSearchQuery {
  q?: string;
  artist?: string;
  medium?: string;
  department?: string;
  dateBegin?: number;
  dateEnd?: number;
  /** Most feeds only want artworks that can actually be shown. */
  requireImage?: boolean;
  page: number;
  limit: number;
}

export interface MuseumSearchResult {
  artworks: Artwork[];
  /** Provider-reported match count, used for pagination. */
  total: number;
}

/**
 * The contract every museum integration implements.
 *
 * Adding a museum means writing one of these and registering it. Nothing
 * outside `services/museums` needs to change, and the client never learns that
 * a new source exists beyond the value in `Artwork.source`.
 */
export interface MuseumProvider {
  readonly source: MuseumSource;
  readonly name: string;

  search(query: MuseumSearchQuery): Promise<MuseumSearchResult>;

  getArtwork(externalId: string): Promise<Artwork | null>;

  /**
   * A varied slice of the collection, used to build the recommendation
   * candidate pool when the user has no query. Providers should return
   * different-looking sets across calls where they cheaply can.
   */
  sample(limit: number): Promise<Artwork[]>;
}
