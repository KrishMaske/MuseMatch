import type { Request, Response } from 'express';
import { currentUser } from '../middleware/auth.js';
import { parseBody } from '../middleware/validate.js';
import { interactionService } from '../services/interactionService.js';
import { sendData } from '../utils/response.js';
import { interactionSchema } from '../utils/schemas.js';

export const interactionController = {
  async record(req: Request, res: Response): Promise<void> {
    // The acting user comes from the verified token, never from the body.
    const user = currentUser(req);
    const input = parseBody(req, interactionSchema);

    sendData(res, await interactionService.record(user.id, input), 201);
  },
};
