import type { Artwork as ArtworkRow, Prisma } from '@prisma/client';
import {
  buildFacetTag,
  type Artwork,
  type ArtworkSort,
  type MuseumSource,
} from '@musematch/shared';
import { prisma } from '../config/prisma.js';

/**
 * The local artwork cache.
 *
 * Every artwork that passes through the app is persisted here, which is what
 * gives interactions, collections and visits a stable id to point at. External
 * ids alone would not survive a provider changing its response shape, and they
 * are not unique across museums.
 */

export interface LocalSearchFilters {
  q?: string;
  museum?: MuseumSource;
  medium?: string;
  theme?: string;
  era?: string;
  artist?: string;
  department?: string;
  classification?: string;
  culture?: string;
  requireImage?: boolean;
  excludeIds?: string[];
  sort?: ArtworkSort;
  page?: number;
  limit?: number;
}

/** Maps a database row onto the normalized model the API speaks. */
export function rowToArtwork(row: ArtworkRow): Artwork {
  return {
    id: row.id,
    source: row.source as MuseumSource,
    externalId: row.externalId,
    museumName: row.museumName,
    title: row.title,
    artist: row.artist,
    artistDisplay: row.artistDisplay,
    year: row.year,
    dateStart: row.dateStart,
    dateEnd: row.dateEnd,
    imageUrl: row.imageUrl,
    thumbnailUrl: row.thumbnailUrl,
    medium: row.medium,
    department: row.department,
    classification: row.classification,
    culture: row.culture,
    period: row.period,
    description: row.description,
    objectUrl: row.objectUrl,
    tags: row.tags,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  };
}

function toWriteInput(artwork: Artwork) {
  return {
    source: artwork.source,
    externalId: artwork.externalId,
    museumName: artwork.museumName,
    title: artwork.title,
    artist: artwork.artist,
    artistDisplay: artwork.artistDisplay,
    year: artwork.year,
    dateStart: artwork.dateStart,
    dateEnd: artwork.dateEnd,
    imageUrl: artwork.imageUrl,
    thumbnailUrl: artwork.thumbnailUrl,
    medium: artwork.medium,
    department: artwork.department,
    classification: artwork.classification,
    culture: artwork.culture,
    period: artwork.period,
    description: artwork.description,
    objectUrl: artwork.objectUrl,
    tags: artwork.tags,
    metadata: artwork.metadata as Prisma.InputJsonValue,
  };
}

export const artworkRepository = {
  async findById(id: string): Promise<Artwork | null> {
    const row = await prisma.artwork.findUnique({ where: { id } });
    return row ? rowToArtwork(row) : null;
  },

  async findManyByIds(ids: string[]): Promise<Artwork[]> {
    if (ids.length === 0) return [];
    const rows = await prisma.artwork.findMany({ where: { id: { in: ids } } });
    // Preserve the caller's ordering, which is usually a ranking.
    const byId = new Map(rows.map((row) => [row.id, rowToArtwork(row)]));
    return ids.map((id) => byId.get(id)).filter((artwork): artwork is Artwork => Boolean(artwork));
  },

  async findByExternalId(source: MuseumSource, externalId: string): Promise<Artwork | null> {
    const row = await prisma.artwork.findUnique({
      where: { source_externalId: { source, externalId } },
    });
    return row ? rowToArtwork(row) : null;
  },

  /**
   * Persists a normalized artwork, refreshing metadata if the record already
   * exists. The embedding column is deliberately untouched: re-caching an
   * artwork should not throw away work the embedding backfill already did.
   */
  async upsert(artwork: Artwork): Promise<Artwork> {
    const input = toWriteInput(artwork);
    const row = await prisma.artwork.upsert({
      where: { source_externalId: { source: artwork.source, externalId: artwork.externalId } },
      create: input,
      update: input,
    });
    return rowToArtwork(row);
  },

  /**
   * Upserts a page of provider results, preserving order.
   * Runs sequentially in a transaction rather than in parallel because
   * concurrent upserts on the same unique key deadlock under Postgres.
   */
  async upsertMany(artworks: Artwork[]): Promise<Artwork[]> {
    if (artworks.length === 0) return [];

    const rows = await prisma.$transaction(
      artworks.map((artwork) => {
        const input = toWriteInput(artwork);
        return prisma.artwork.upsert({
          where: { source_externalId: { source: artwork.source, externalId: artwork.externalId } },
          create: input,
          update: input,
        });
      }),
    );

    return rows.map(rowToArtwork);
  },

  async search(filters: LocalSearchFilters): Promise<{ artworks: Artwork[]; total: number }> {
    const where = buildWhere(filters);
    const limit = filters.limit ?? 20;
    const page = filters.page ?? 1;

    const [rows, total] = await Promise.all([
      prisma.artwork.findMany({
        where,
        orderBy: buildOrderBy(filters.sort),
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.artwork.count({ where }),
    ]);

    return { artworks: rows.map(rowToArtwork), total };
  },

  /**
   * A pseudo-random slice of the cache, used as recommendation candidates when
   * the providers are unreachable or the pool needs topping up.
   */
  async sample(limit: number, filters: LocalSearchFilters = {}): Promise<Artwork[]> {
    const where = buildWhere({ ...filters, requireImage: filters.requireImage ?? true });
    const total = await prisma.artwork.count({ where });
    if (total === 0) return [];

    const skip = total > limit ? Math.floor(Math.random() * (total - limit)) : 0;
    const rows = await prisma.artwork.findMany({ where, skip, take: limit });
    return rows.map(rowToArtwork);
  },

  async count(): Promise<number> {
    return prisma.artwork.count();
  },
};

function buildWhere(filters: LocalSearchFilters): Prisma.ArtworkWhereInput {
  const and: Prisma.ArtworkWhereInput[] = [];

  if (filters.q) {
    and.push({
      OR: [
        { title: { contains: filters.q, mode: 'insensitive' } },
        { artist: { contains: filters.q, mode: 'insensitive' } },
        { description: { contains: filters.q, mode: 'insensitive' } },
        { medium: { contains: filters.q, mode: 'insensitive' } },
        { culture: { contains: filters.q, mode: 'insensitive' } },
      ],
    });
  }

  if (filters.museum) and.push({ source: filters.museum });
  if (filters.artist) and.push({ artist: { contains: filters.artist, mode: 'insensitive' } });
  if (filters.department)
    and.push({ department: { contains: filters.department, mode: 'insensitive' } });
  if (filters.classification) {
    and.push({ classification: { contains: filters.classification, mode: 'insensitive' } });
  }
  if (filters.culture) and.push({ culture: { contains: filters.culture, mode: 'insensitive' } });

  // Facet filters match the prefixed tags written during normalization, so
  // "medium=painting" means the classifier agreed, not that the free-text
  // medium field happened to contain the word.
  if (filters.medium) and.push({ tags: { has: buildFacetTag('medium', filters.medium) } });
  if (filters.theme) and.push({ tags: { has: buildFacetTag('theme', filters.theme) } });
  if (filters.era) and.push({ tags: { has: buildFacetTag('era', filters.era) } });

  if (filters.requireImage) and.push({ imageUrl: { not: null } });
  if (filters.excludeIds?.length) and.push({ id: { notIn: filters.excludeIds } });

  return and.length > 0 ? { AND: and } : {};
}

/**
 * Ordering for paginated browsing.
 *
 * Every ordering ends with the primary key. Without a unique tiebreaker the
 * sort is only partial and OFFSET pagination is not stable: `upsertMany` runs
 * in a transaction, so Postgres gives every row in a batch the same `now()`,
 * leaving dozens of artworks tied on `createdAt`. Postgres may then order the
 * tied rows differently between two queries, and a reader paging through
 * Discover would see the same artwork twice while never being shown another.
 * `title` and `dateStart` are not unique either, so they need it just as much.
 */
function buildOrderBy(sort: ArtworkSort | undefined): Prisma.ArtworkOrderByWithRelationInput[] {
  switch (sort) {
    case 'oldest':
      return [{ dateStart: { sort: 'asc', nulls: 'last' } }, { title: 'asc' }, { id: 'asc' }];
    case 'newest':
      return [{ dateStart: { sort: 'desc', nulls: 'last' } }, { title: 'asc' }, { id: 'asc' }];
    default:
      return [{ createdAt: 'desc' }, { id: 'asc' }];
  }
}
