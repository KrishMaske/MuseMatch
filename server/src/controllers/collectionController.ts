import type { Request, Response } from 'express';
import { currentUser } from '../middleware/auth.js';
import { parseBody, parseParams } from '../middleware/validate.js';
import { collectionService } from '../services/collectionService.js';
import { sendData } from '../utils/response.js';
import {
  artworkIdParamSchema,
  collectionItemSchema,
  createCollectionSchema,
  idParamSchema,
  updateCollectionSchema,
} from '../utils/schemas.js';

export const collectionController = {
  async list(req: Request, res: Response): Promise<void> {
    const user = currentUser(req);
    sendData(res, await collectionService.list(user.id));
  },

  async create(req: Request, res: Response): Promise<void> {
    const user = currentUser(req);
    const input = parseBody(req, createCollectionSchema);
    sendData(res, await collectionService.create(user.id, input), 201);
  },

  async get(req: Request, res: Response): Promise<void> {
    const user = currentUser(req);
    const { id } = parseParams(req, idParamSchema);
    sendData(res, await collectionService.get(user.id, id));
  },

  async update(req: Request, res: Response): Promise<void> {
    const user = currentUser(req);
    const { id } = parseParams(req, idParamSchema);
    const input = parseBody(req, updateCollectionSchema);
    sendData(res, await collectionService.update(user.id, id, input));
  },

  async remove(req: Request, res: Response): Promise<void> {
    const user = currentUser(req);
    const { id } = parseParams(req, idParamSchema);
    await collectionService.remove(user.id, id);
    res.status(204).send();
  },

  async addItem(req: Request, res: Response): Promise<void> {
    const user = currentUser(req);
    const { id } = parseParams(req, idParamSchema);
    const { artworkId } = parseBody(req, collectionItemSchema);
    sendData(res, await collectionService.addItem(user.id, id, artworkId), 201);
  },

  async removeItem(req: Request, res: Response): Promise<void> {
    const user = currentUser(req);
    const { id, artworkId } = parseParams(req, artworkIdParamSchema);
    sendData(res, await collectionService.removeItem(user.id, id, artworkId));
  },
};
