import type { InteractionType } from '@musematch/shared';
import { prisma } from '../config/prisma.js';

/** Reads over a user's interaction history, used by ranking and the dashboard. */
export const interactionRepository = {
  async record(input: {
    userId: string;
    artworkId: string;
    type: InteractionType;
    weight: number;
    sourcePage?: string;
    query?: string;
  }): Promise<{ id: string; createdAt: Date }> {
    return prisma.interaction.create({
      data: {
        userId: input.userId,
        artworkId: input.artworkId,
        type: input.type,
        weight: input.weight,
        sourcePage: input.sourcePage ?? null,
        query: input.query ?? null,
      },
      select: { id: true, createdAt: true },
    });
  },

  /**
   * Artworks the user has explicitly rejected. These are removed from the
   * candidate pool outright rather than merely down-ranked -- showing back
   * something a user dismissed reads as the product not listening.
   */
  async findRejectedArtworkIds(userId: string): Promise<string[]> {
    const rows = await prisma.interaction.findMany({
      where: { userId, type: { in: ['DISLIKE', 'SKIP'] } },
      select: { artworkId: true },
      distinct: ['artworkId'],
    });
    return rows.map((row) => row.artworkId);
  },

  /** Recently viewed artworks, so a refreshed feed is not the same page. */
  async findRecentlyViewedArtworkIds(userId: string, limit: number): Promise<string[]> {
    const rows = await prisma.interaction.findMany({
      where: { userId, type: 'VIEW' },
      orderBy: { createdAt: 'desc' },
      select: { artworkId: true },
      distinct: ['artworkId'],
      take: limit,
    });
    return rows.map((row) => row.artworkId);
  },

  /**
   * Artists behind the user's positive interactions, used for the
   * "you have saved work by X before" explanation.
   */
  async findFavouredArtists(userId: string, limit: number): Promise<Set<string>> {
    const rows = await prisma.interaction.findMany({
      where: { userId, type: { in: ['SAVE', 'LIKE', 'ADD_TO_VISIT'] } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { artwork: { select: { artist: true } } },
    });

    const artists = new Set<string>();
    for (const row of rows) {
      if (row.artwork.artist) artists.add(row.artwork.artist);
    }
    return artists;
  },

  async countByType(userId: string): Promise<Record<string, number>> {
    const rows = await prisma.interaction.groupBy({
      by: ['type'],
      where: { userId },
      _count: { _all: true },
    });

    return Object.fromEntries(rows.map((row) => [row.type, row._count._all]));
  },

  /** Distinct artwork count for a set of types, so re-views are not double counted. */
  async countDistinctArtworks(userId: string, types: InteractionType[]): Promise<number> {
    const rows = await prisma.interaction.findMany({
      where: { userId, type: { in: types } },
      select: { artworkId: true },
      distinct: ['artworkId'],
    });
    return rows.length;
  },
};
