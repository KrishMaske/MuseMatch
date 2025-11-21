import type { Request, Response } from 'express';
import { currentUser } from '../middleware/auth.js';
import { parseBody, parseParams } from '../middleware/validate.js';
import { visitService } from '../services/visitService.js';
import { sendData } from '../utils/response.js';
import {
  artworkIdParamSchema,
  createVisitSchema,
  idParamSchema,
  reorderVisitSchema,
  updateVisitSchema,
  visitItemSchema,
} from '../utils/schemas.js';

export const visitController = {
  async list(req: Request, res: Response): Promise<void> {
    const user = currentUser(req);
    sendData(res, await visitService.list(user.id));
  },

  async create(req: Request, res: Response): Promise<void> {
    const user = currentUser(req);
    const input = parseBody(req, createVisitSchema);
    sendData(res, await visitService.create(user.id, input), 201);
  },

  async get(req: Request, res: Response): Promise<void> {
    const user = currentUser(req);
    const { id } = parseParams(req, idParamSchema);
    sendData(res, await visitService.get(user.id, id));
  },

  async update(req: Request, res: Response): Promise<void> {
    const user = currentUser(req);
    const { id } = parseParams(req, idParamSchema);
    const input = parseBody(req, updateVisitSchema);
    sendData(res, await visitService.update(user.id, id, input));
  },

  async remove(req: Request, res: Response): Promise<void> {
    const user = currentUser(req);
    const { id } = parseParams(req, idParamSchema);
    await visitService.remove(user.id, id);
    res.status(204).send();
  },

  /** Runs the itinerary optimizer, replacing any existing plan. */
  async generate(req: Request, res: Response): Promise<void> {
    const user = currentUser(req);
    const { id } = parseParams(req, idParamSchema);
    sendData(res, await visitService.generate(user.id, id));
  },

  async addItem(req: Request, res: Response): Promise<void> {
    const user = currentUser(req);
    const { id } = parseParams(req, idParamSchema);
    const { artworkId } = parseBody(req, visitItemSchema);
    sendData(res, await visitService.addItem(user.id, id, artworkId), 201);
  },

  async removeItem(req: Request, res: Response): Promise<void> {
    const user = currentUser(req);
    const { id, artworkId } = parseParams(req, artworkIdParamSchema);
    sendData(res, await visitService.removeItem(user.id, id, artworkId));
  },

  async reorder(req: Request, res: Response): Promise<void> {
    const user = currentUser(req);
    const { id } = parseParams(req, idParamSchema);
    const { artworkIds } = parseBody(req, reorderVisitSchema);
    sendData(res, await visitService.reorder(user.id, id, artworkIds));
  },
};
