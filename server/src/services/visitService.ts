import type {
  Prisma,
  Visit as VisitRow,
  VisitItem as VisitItemRow,
  Artwork as ArtworkRow,
} from '@prisma/client';
import {
  MUSEUM_NAMES,
  type CreateVisitInput,
  type MuseumSource,
  type UpdateVisitInput,
  type Visit,
  type VisitDetail,
  type VisitItem,
  type VisitStop,
} from '@musematch/shared';
import { prisma } from '../config/prisma.js';
import { rowToArtwork } from '../repositories/artworkRepository.js';
import { AppError } from '../utils/errors.js';
import { artworkService } from './artworkService.js';
import { itineraryService } from './itinerary/itineraryService.js';
import { estimateViewingMinutes } from './itinerary/viewingTime.js';

/**
 * Museum visits and their itineraries.
 *
 * Generation is destructive by design: regenerating replaces the plan rather
 * than merging into it, because a half-regenerated itinerary is neither the
 * optimizer's answer nor the user's. Manual edits after that are preserved
 * until the user asks for a new plan.
 */

type VisitWithItems = VisitRow & {
  items: Array<VisitItemRow & { artwork: ArtworkRow }>;
};

export const visitService = {
  async list(userId: string): Promise<Visit[]> {
    const rows = await prisma.visit.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { items: { include: { artwork: true } } },
    });

    return rows.map((row) => toVisit(row));
  },

  async get(userId: string, visitId: string): Promise<VisitDetail> {
    const row = await prisma.visit.findFirst({
      where: { id: visitId, userId },
      include: { items: { orderBy: { position: 'asc' }, include: { artwork: true } } },
    });

    if (!row) throw AppError.notFound('Visit not found.');
    return toVisitDetail(row);
  },

  async create(userId: string, input: CreateVisitInput): Promise<VisitDetail> {
    const visit = await prisma.visit.create({
      data: {
        userId,
        name: input.name,
        museum: input.museum,
        availableMinutes: input.availableMinutes,
        visitDate: input.visitDate ? new Date(input.visitDate) : null,
      },
    });

    return this.get(userId, visit.id);
  },

  async update(userId: string, visitId: string, input: UpdateVisitInput): Promise<VisitDetail> {
    await this.assertOwnership(userId, visitId);

    if (input.museum !== undefined) {
      const current = await prisma.visit.findUnique({
        where: { id: visitId },
        select: { museum: true, _count: { select: { items: true } } },
      });
      if (current && current.museum !== input.museum && current._count.items > 0) {
        throw AppError.badRequest(
          'Remove all itinerary items before changing this visit’s museum.',
        );
      }
    }

    const data: Prisma.VisitUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.museum !== undefined) data.museum = input.museum;
    if (input.availableMinutes !== undefined) data.availableMinutes = input.availableMinutes;
    if (input.visitDate !== undefined)
      data.visitDate = input.visitDate ? new Date(input.visitDate) : null;

    await prisma.visit.update({ where: { id: visitId }, data });
    return this.get(userId, visitId);
  },

  async remove(userId: string, visitId: string): Promise<void> {
    await this.assertOwnership(userId, visitId);
    await prisma.visit.delete({ where: { id: visitId } });
  },

  /** Runs the optimizer and replaces this visit's items with the result. */
  async generate(userId: string, visitId: string): Promise<VisitDetail> {
    const visit = await prisma.visit.findFirst({ where: { id: visitId, userId } });
    if (!visit) throw AppError.notFound('Visit not found.');

    const itinerary = await itineraryService.generate({
      userId,
      museum: visit.museum as MuseumSource,
      availableMinutes: visit.availableMinutes,
    });

    if (itinerary.items.length === 0) {
      throw AppError.upstream(
        'There is not enough cached artwork for this museum yet. Try searching it first.',
      );
    }

    await prisma.$transaction([
      prisma.visitItem.deleteMany({ where: { visitId } }),
      prisma.visitItem.createMany({
        data: itinerary.items.map((item, index) => ({
          visitId,
          artworkId: item.artwork.id,
          position: index,
          estimatedMinutes: item.estimatedMinutes,
          recommendationScore: item.recommendationScore,
          reasons: item.reasons,
        })),
      }),
      prisma.visit.update({ where: { id: visitId }, data: { generated: true } }),
    ]);

    return this.get(userId, visitId);
  },

  async addItem(userId: string, visitId: string, artworkId: string): Promise<VisitDetail> {
    const visit = await prisma.visit.findFirst({
      where: { id: visitId, userId },
      select: { museum: true },
    });
    if (!visit) throw AppError.notFound('Visit not found.');
    const artwork = await artworkService.getById(artworkId);

    if (artwork.source !== visit.museum) {
      throw AppError.badRequest(
        `This visit is for ${MUSEUM_NAMES[visit.museum as MuseumSource]}; choose an artwork from that museum.`,
      );
    }

    const existing = await prisma.visitItem.findUnique({
      where: { visitId_artworkId: { visitId, artworkId: artwork.id } },
    });
    if (existing) throw AppError.conflict('That artwork is already in this visit.');

    const last = await prisma.visitItem.findFirst({
      where: { visitId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    await prisma.visitItem.create({
      data: {
        visitId,
        artworkId: artwork.id,
        position: (last?.position ?? -1) + 1,
        estimatedMinutes: estimateViewingMinutes(artwork),
        recommendationScore: 0,
        reasons: ['Added by you'],
      },
    });

    return this.get(userId, visitId);
  },

  async removeItem(userId: string, visitId: string, artworkId: string): Promise<VisitDetail> {
    await this.assertOwnership(userId, visitId);

    const deleted = await prisma.visitItem.deleteMany({ where: { visitId, artworkId } });
    if (deleted.count === 0) throw AppError.notFound('That artwork is not in this visit.');

    await this.compactPositions(visitId);
    return this.get(userId, visitId);
  },

  /**
   * Applies a drag-and-drop reorder.
   *
   * The client sends the complete ordering, which must match the visit's
   * current items exactly -- a partial list would silently drop stops.
   */
  async reorder(userId: string, visitId: string, artworkIds: string[]): Promise<VisitDetail> {
    await this.assertOwnership(userId, visitId);

    const current = await prisma.visitItem.findMany({
      where: { visitId },
      select: { artworkId: true },
    });
    const currentIds = new Set(current.map((item) => item.artworkId));

    const incoming = new Set(artworkIds);
    const sameSize = incoming.size === currentIds.size && artworkIds.length === currentIds.size;
    const sameMembers = artworkIds.every((id) => currentIds.has(id));

    if (!sameSize || !sameMembers) {
      throw AppError.badRequest(
        'The new order must list exactly the artworks already in this visit.',
      );
    }

    await prisma.$transaction(
      artworkIds.map((artworkId, index) =>
        prisma.visitItem.update({
          where: { visitId_artworkId: { visitId, artworkId } },
          data: { position: index },
        }),
      ),
    );

    return this.get(userId, visitId);
  },

  async assertOwnership(userId: string, visitId: string): Promise<void> {
    const found = await prisma.visit.findFirst({
      where: { id: visitId, userId },
      select: { id: true },
    });
    if (!found) throw AppError.notFound('Visit not found.');
  },

  /** Closes gaps left by a removal so positions stay 0..n-1. */
  async compactPositions(visitId: string): Promise<void> {
    const items = await prisma.visitItem.findMany({
      where: { visitId },
      orderBy: { position: 'asc' },
      select: { id: true },
    });

    await prisma.$transaction(
      items.map((item, index) =>
        prisma.visitItem.update({ where: { id: item.id }, data: { position: index } }),
      ),
    );
  },
};

function toVisit(row: VisitWithItems): Visit {
  return {
    id: row.id,
    name: row.name,
    museum: row.museum as MuseumSource,
    museumName: MUSEUM_NAMES[row.museum as MuseumSource],
    visitDate: row.visitDate ? row.visitDate.toISOString() : null,
    availableMinutes: row.availableMinutes,
    generated: row.generated,
    itemCount: row.items.length,
    totalMinutes: row.items.reduce((sum, item) => sum + item.estimatedMinutes, 0),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toVisitDetail(row: VisitWithItems): VisitDetail {
  const items: VisitItem[] = row.items.map((item) => ({
    id: item.id,
    artwork: rowToArtwork(item.artwork),
    position: item.position,
    estimatedMinutes: item.estimatedMinutes,
    recommendationScore: item.recommendationScore,
    reasons: item.reasons,
  }));

  return { ...toVisit(row), items, stops: buildStops(items) };
}

/**
 * Groups consecutive items sharing a department into walking stops.
 *
 * Consecutive rather than global grouping, because a user who dragged an item
 * out of its wing meant to move it, and regrouping would undo the edit.
 */
export function buildStops(items: VisitItem[]): VisitStop[] {
  const stops: VisitStop[] = [];

  for (const item of items) {
    const department = item.artwork.department ?? 'Elsewhere in the museum';
    const last = stops[stops.length - 1];

    if (last && last.department === department) {
      last.items.push(item);
      last.totalMinutes += item.estimatedMinutes;
    } else {
      stops.push({ department, items: [item], totalMinutes: item.estimatedMinutes });
    }
  }

  return stops;
}
