import type { Request, Response } from 'express';
import { currentUser } from '../middleware/auth.js';
import { parseParams, parseQuery } from '../middleware/validate.js';
import { artworkService } from '../services/artworkService.js';
import { collectionService } from '../services/collectionService.js';
import { recommendationService } from '../services/recommendations/recommendationService.js';
import { buildPagination, sendData, sendList } from '../utils/response.js';
import { artworkSearchSchema, idParamSchema, similarQuerySchema } from '../utils/schemas.js';

const DEFAULT_LIMIT = 24;
const DEFAULT_SIMILAR_LIMIT = 8;

export const artworkController = {
  /**
   * Filter-driven browsing over the local cache.
   * Separate from `/search` because it never calls a museum API.
   */
  async browse(req: Request, res: Response): Promise<void> {
    const params = parseQuery(req, artworkSearchSchema);
    const result = await artworkService.browse(params);

    sendList(
      res,
      result.artworks,
      buildPagination(params.page ?? 1, params.limit ?? DEFAULT_LIMIT, result.total),
    );
  },

  /**
   * Keyword or semantic search.
   * Semantic results carry match scores and reasons, so they are returned as
   * recommendations rather than bare artworks.
   */
  async search(req: Request, res: Response): Promise<void> {
    const user = currentUser(req);
    const params = parseQuery(req, artworkSearchSchema);

    if (params.semantic) {
      const { recommendations, total } = await artworkService.semanticSearch(user.id, params);
      sendList(
        res,
        recommendations,
        buildPagination(params.page ?? 1, params.limit ?? DEFAULT_LIMIT, total),
      );
      return;
    }

    const result = await artworkService.search(params);
    res.status(200).json({
      data: result.artworks,
      pagination: buildPagination(params.page ?? 1, params.limit ?? DEFAULT_LIMIT, result.total),
      // Named so the UI can tell the user a museum is down instead of showing
      // a short list with no explanation.
      meta: { unavailableMuseums: result.unavailable },
    });
  },

  async getById(req: Request, res: Response): Promise<void> {
    const user = currentUser(req);
    const { id } = parseParams(req, idParamSchema);

    const artwork = await artworkService.getById(id);
    const savedInCollectionIds = await collectionService.findContainingArtwork(user.id, artwork.id);
    const [recommendation] = await recommendationService.rank(user.id, [artwork], undefined, {
      limit: 1,
      enforceDiversity: false,
      includeBelowThreshold: true,
    });

    sendData(res, {
      artwork,
      savedInCollectionIds,
      match: {
        matchPercent: recommendation?.matchPercent ?? 0,
        reasons: recommendation?.reasons ?? ['A chance to broaden your museum path'],
      },
    });
  },

  async getSimilar(req: Request, res: Response): Promise<void> {
    const { id } = parseParams(req, idParamSchema);
    const { limit } = parseQuery(req, similarQuerySchema);

    sendData(res, await artworkService.findSimilar(id, limit ?? DEFAULT_SIMILAR_LIMIT));
  },
};
