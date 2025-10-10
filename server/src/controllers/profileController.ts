import type { Request, Response } from 'express';
import { QUIZ_QUESTIONS } from '@musematch/shared';
import { currentUser } from '../middleware/auth.js';
import { parseBody } from '../middleware/validate.js';
import { dashboardService } from '../services/profile/dashboardService.js';
import { preferenceService } from '../services/profile/preferenceService.js';
import { userService } from '../services/userService.js';
import { sendData } from '../utils/response.js';
import {
  onboardingSchema,
  updatePreferencesSchema,
  updateProfileSchema,
} from '../utils/schemas.js';

/** Profile, preferences and onboarding. Business logic lives in the services. */
export const profileController = {
  async get(req: Request, res: Response): Promise<void> {
    sendData(res, userService.toProfile(currentUser(req)));
  },

  async update(req: Request, res: Response): Promise<void> {
    const user = currentUser(req);
    const input = parseBody(req, updateProfileSchema);
    const updated = await userService.update(user.id, input);
    sendData(res, userService.toProfile(updated));
  },

  async getPreferences(req: Request, res: Response): Promise<void> {
    const user = currentUser(req);
    sendData(res, await preferenceService.getProfile(user.id));
  },

  async updatePreferences(req: Request, res: Response): Promise<void> {
    const user = currentUser(req);
    const input = parseBody(req, updatePreferencesSchema);

    const profile = await preferenceService.updateExplicit(user.id, {
      ...(input.weights
        ? {
            weights: {
              medium: input.weights.medium ?? {},
              era: input.weights.era ?? {},
              theme: input.weights.theme ?? {},
              style: input.weights.style ?? {},
              experience: input.weights.experience ?? {},
            },
          }
        : {}),
      ...(input.explorationScore !== undefined ? { explorationScore: input.explorationScore } : {}),
    });

    sendData(res, profile);
  },

  /** The quiz definition, so the client renders exactly what the server validates. */
  async getQuiz(_req: Request, res: Response): Promise<void> {
    sendData(res, { questions: QUIZ_QUESTIONS });
  },

  async completeOnboarding(req: Request, res: Response): Promise<void> {
    const user = currentUser(req);
    const { answers } = parseBody(req, onboardingSchema);
    sendData(res, await preferenceService.completeOnboarding(user.id, answers), 201);
  },

  async getDashboard(req: Request, res: Response): Promise<void> {
    const user = currentUser(req);
    sendData(res, await dashboardService.build(user.id));
  },
};
