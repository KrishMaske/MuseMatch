import type { Request, Response } from 'express';
import { currentUser } from '../middleware/auth.js';
import { parseQuery } from '../middleware/validate.js';
import { recommendationService } from '../services/recommendations/recommendationService.js';
import { sendData } from '../utils/response.js';
import { recommendationQuerySchema } from '../utils/schemas.js';

export const recommendationController = {
  async list(req: Request, res: Response): Promise<void> {
    const user = currentUser(req);
    const query = parseQuery(req, recommendationQuerySchema);

    const recommendations = await recommendationService.getRecommendations(user.id, {
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
      ...(query.museum ? { museum: query.museum } : {}),
      ...(query.excludeSeen !== undefined ? { excludeSeen: query.excludeSeen } : {}),
    });

    sendData(res, { recommendations });
  },
};
