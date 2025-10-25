import { Prisma } from '@prisma/client';
import type { MuseumSource } from '@musematch/shared';
import { prisma } from '../config/prisma.js';
import { EMBEDDING_DIMENSIONS } from '../config/env.js';

/**
 * pgvector access.
 *
 * Prisma cannot select or write an `Unsupported("vector")` column, so this is
 * the one place in the app that uses raw SQL. Every value still goes through a
 * bound parameter -- the vector is passed as a text literal and cast in the
 * query, never interpolated into the statement.
 */

export interface SimilarityHit {
  id: string;
  similarity: number;
}

export interface SimilaritySearchOptions {
  limit: number;
  excludeArtworkId?: string;
  museum?: MuseumSource;
  requireImage?: boolean;
  /** Restrict the search to a candidate set, for reranking. */
  artworkIds?: string[];
}

/** pgvector's text input format: `[0.1,0.2,...]`. */
function toVectorLiteral(vector: number[]): string {
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected ${EMBEDDING_DIMENSIONS}-dimensional vector, received ${vector.length}.`,
    );
  }
  return `[${vector.join(',')}]`;
}

export const embeddingRepository = {
  async save(artworkId: string, vector: number[]): Promise<void> {
    const literal = toVectorLiteral(vector);
    await prisma.$executeRaw`
      UPDATE "artworks"
      SET "embedding" = ${literal}::vector, "embeddedAt" = NOW()
      WHERE "id" = ${artworkId}
    `;
  },

  async saveMany(entries: Array<{ artworkId: string; vector: number[] }>): Promise<void> {
    if (entries.length === 0) return;
    await prisma.$transaction(
      entries.map(({ artworkId, vector }) => {
        const literal = toVectorLiteral(vector);
        return prisma.$executeRaw`
          UPDATE "artworks"
          SET "embedding" = ${literal}::vector, "embeddedAt" = NOW()
          WHERE "id" = ${artworkId}
        `;
      }),
    );
  },

  /**
   * Nearest neighbours by cosine distance.
   * `<=>` is pgvector's cosine distance, so similarity is 1 - distance.
   */
  async search(vector: number[], options: SimilaritySearchOptions): Promise<SimilarityHit[]> {
    const literal = toVectorLiteral(vector);
    const conditions: Prisma.Sql[] = [Prisma.sql`"embedding" IS NOT NULL`];

    if (options.excludeArtworkId) {
      conditions.push(Prisma.sql`"id" <> ${options.excludeArtworkId}`);
    }
    if (options.museum) {
      conditions.push(Prisma.sql`"source" = ${options.museum}::"MuseumSource"`);
    }
    if (options.requireImage) {
      conditions.push(Prisma.sql`"imageUrl" IS NOT NULL`);
    }
    if (options.artworkIds) {
      if (options.artworkIds.length === 0) return [];
      conditions.push(Prisma.sql`"id" IN (${Prisma.join(options.artworkIds)})`);
    }

    const rows = await prisma.$queryRaw<Array<{ id: string; distance: number }>>(Prisma.sql`
      SELECT "id", ("embedding" <=> ${literal}::vector) AS "distance"
      FROM "artworks"
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY "embedding" <=> ${literal}::vector
      LIMIT ${options.limit}
    `);

    return rows.map((row) => ({
      id: row.id,
      similarity: clampSimilarity(1 - Number(row.distance)),
    }));
  },

  /** "Find similar" on the detail page: neighbours of a stored embedding. */
  async searchByArtwork(artworkId: string, limit: number): Promise<SimilarityHit[]> {
    const rows = await prisma.$queryRaw<Array<{ id: string; distance: number }>>(Prisma.sql`
      WITH target AS (
        SELECT "embedding" FROM "artworks" WHERE "id" = ${artworkId}
      )
      SELECT a."id", (a."embedding" <=> target."embedding") AS "distance"
      FROM "artworks" a, target
      WHERE a."embedding" IS NOT NULL
        AND target."embedding" IS NOT NULL
        AND a."id" <> ${artworkId}
        AND a."imageUrl" IS NOT NULL
      ORDER BY a."embedding" <=> target."embedding"
      LIMIT ${limit}
    `);

    return rows.map((row) => ({
      id: row.id,
      similarity: clampSimilarity(1 - Number(row.distance)),
    }));
  },

  async hasAny(): Promise<boolean> {
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>(
      Prisma.sql`SELECT EXISTS (SELECT 1 FROM "artworks" WHERE "embedding" IS NOT NULL) AS "exists"`,
    );
    return Boolean(rows[0]?.exists);
  },

  async countEmbedded(): Promise<number> {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`SELECT COUNT(*)::bigint AS "count" FROM "artworks" WHERE "embedding" IS NOT NULL`,
    );
    return Number(rows[0]?.count ?? 0);
  },

  /** Artwork ids still awaiting an embedding, for the backfill script. */
  async listMissing(limit: number): Promise<string[]> {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "artworks"
      WHERE "embedding" IS NULL
      ORDER BY "createdAt" DESC
      LIMIT ${limit}
    `);
    return rows.map((row) => row.id);
  },

  /** Drops every stored vector, used when switching embedding providers. */
  async clearAll(): Promise<void> {
    await prisma.$executeRaw`UPDATE "artworks" SET "embedding" = NULL, "embeddedAt" = NULL`;
  },
};

/** Cosine distance can drift a hair outside [0, 2] from float error. */
function clampSimilarity(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
