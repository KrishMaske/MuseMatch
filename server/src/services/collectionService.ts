import type { Collection as CollectionRow, Prisma } from '@prisma/client';
import type {
  Collection,
  CollectionDetail,
  CreateCollectionInput,
  UpdateCollectionInput,
} from '@musematch/shared';
import { prisma } from '../config/prisma.js';
import { rowToArtwork } from '../repositories/artworkRepository.js';
import { AppError } from '../utils/errors.js';
import { artworkService } from './artworkService.js';

/**
 * User collections.
 *
 * Every method takes the acting user's id and scopes its query by it, so
 * ownership is enforced by the query itself rather than by a check that a
 * future edit could forget to make.
 */

const PREVIEW_IMAGE_COUNT = 4;

type CollectionWithCounts = CollectionRow & {
  _count: { items: number };
  items: Array<{ artwork: { imageUrl: string | null } }>;
};

export const collectionService = {
  async list(userId: string): Promise<Collection[]> {
    const rows = await prisma.collection.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { items: true } },
        items: {
          take: PREVIEW_IMAGE_COUNT,
          orderBy: { createdAt: 'desc' },
          select: { artwork: { select: { imageUrl: true } } },
        },
      },
    });

    return rows.map(toCollection);
  },

  async get(userId: string, collectionId: string): Promise<CollectionDetail> {
    const row = await prisma.collection.findFirst({
      where: { id: collectionId, userId },
      include: {
        _count: { select: { items: true } },
        items: { orderBy: { createdAt: 'desc' }, include: { artwork: true } },
      },
    });

    if (!row) throw AppError.notFound('Collection not found.');

    return {
      ...toCollection({
        ...row,
        items: row.items.map((item) => ({ artwork: { imageUrl: item.artwork.imageUrl } })),
      }),
      items: row.items.map((item) => ({
        id: item.id,
        artwork: rowToArtwork(item.artwork),
        createdAt: item.createdAt.toISOString(),
      })),
    };
  },

  async create(userId: string, input: CreateCollectionInput): Promise<Collection> {
    const row = await prisma.collection.create({
      data: {
        userId,
        name: input.name,
        description: input.description ?? null,
      },
      include: {
        _count: { select: { items: true } },
        items: { take: 0, select: { artwork: { select: { imageUrl: true } } } },
      },
    });

    return toCollection(row);
  },

  async update(
    userId: string,
    collectionId: string,
    input: UpdateCollectionInput,
  ): Promise<Collection> {
    await this.assertOwnership(userId, collectionId);

    const data: Prisma.CollectionUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;

    const row = await prisma.collection.update({
      where: { id: collectionId },
      data,
      include: {
        _count: { select: { items: true } },
        items: {
          take: PREVIEW_IMAGE_COUNT,
          orderBy: { createdAt: 'desc' },
          select: { artwork: { select: { imageUrl: true } } },
        },
      },
    });

    return toCollection(row);
  },

  async remove(userId: string, collectionId: string): Promise<void> {
    await this.assertOwnership(userId, collectionId);
    await prisma.collection.delete({ where: { id: collectionId } });
  },

  /**
   * Adds an artwork, resolving it through the artwork service first so a piece
   * can be saved straight from a provider result that was never cached.
   */
  async addItem(
    userId: string,
    collectionId: string,
    artworkId: string,
  ): Promise<CollectionDetail> {
    await this.assertOwnership(userId, collectionId);
    const artwork = await artworkService.getById(artworkId);

    const existing = await prisma.collectionItem.findUnique({
      where: { collectionId_artworkId: { collectionId, artworkId: artwork.id } },
    });

    if (existing) {
      throw AppError.conflict('That artwork is already in this collection.');
    }

    await prisma.$transaction([
      prisma.collectionItem.create({ data: { collectionId, artworkId: artwork.id } }),
      // Touch the parent so collections sort by genuine recent activity.
      prisma.collection.update({ where: { id: collectionId }, data: { updatedAt: new Date() } }),
    ]);

    return this.get(userId, collectionId);
  },

  async removeItem(
    userId: string,
    collectionId: string,
    artworkId: string,
  ): Promise<CollectionDetail> {
    await this.assertOwnership(userId, collectionId);

    const deleted = await prisma.collectionItem.deleteMany({ where: { collectionId, artworkId } });
    if (deleted.count === 0) {
      throw AppError.notFound('That artwork is not in this collection.');
    }

    return this.get(userId, collectionId);
  },

  /** Collection ids containing this artwork, so the UI can show saved state. */
  async findContainingArtwork(userId: string, artworkId: string): Promise<string[]> {
    const rows = await prisma.collectionItem.findMany({
      where: { artworkId, collection: { userId } },
      select: { collectionId: true },
    });
    return rows.map((row) => row.collectionId);
  },

  /**
   * Confirms the collection exists *and* belongs to the caller.
   * A collection owned by someone else is reported as not found rather than
   * forbidden, so the API does not confirm which ids exist.
   */
  async assertOwnership(userId: string, collectionId: string): Promise<void> {
    const found = await prisma.collection.findFirst({
      where: { id: collectionId, userId },
      select: { id: true },
    });
    if (!found) throw AppError.notFound('Collection not found.');
  },
};

function toCollection(row: CollectionWithCounts): Collection {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    itemCount: row._count.items,
    previewImageUrls: row.items
      .map((item) => item.artwork.imageUrl)
      .filter((url): url is string => Boolean(url))
      .slice(0, PREVIEW_IMAGE_COUNT),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
