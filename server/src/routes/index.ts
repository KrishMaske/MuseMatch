import { Router } from 'express';
import { artworkController } from '../controllers/artworkController.js';
import { collectionController } from '../controllers/collectionController.js';
import { interactionController } from '../controllers/interactionController.js';
import { profileController } from '../controllers/profileController.js';
import { recommendationController } from '../controllers/recommendationController.js';
import { visitController } from '../controllers/visitController.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/response.js';

/**
 * Route table.
 *
 * Routing only -- no logic. Every route below `router.use(requireAuth)` runs
 * with a verified user attached; the quiz definition above it is public so the
 * onboarding screen can render before an account exists.
 */
export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ data: { status: 'ok' } });
});

apiRouter.get('/onboarding/quiz', asyncHandler(profileController.getQuiz));

apiRouter.use(requireAuth);

// --- Profile & preferences -------------------------------------------------
apiRouter.get('/profile', asyncHandler(profileController.get));
apiRouter.put('/profile', asyncHandler(profileController.update));
apiRouter.get('/profile/preferences', asyncHandler(profileController.getPreferences));
apiRouter.put('/profile/preferences', asyncHandler(profileController.updatePreferences));
apiRouter.get('/profile/dashboard', asyncHandler(profileController.getDashboard));
apiRouter.post('/profile/onboarding', asyncHandler(profileController.completeOnboarding));

// --- Artworks --------------------------------------------------------------
// `/search` is declared before `/:id` so it is not captured as an id.
apiRouter.get('/artworks/search', asyncHandler(artworkController.search));
apiRouter.get('/artworks', asyncHandler(artworkController.browse));
apiRouter.get('/artworks/:id/similar', asyncHandler(artworkController.getSimilar));
apiRouter.get('/artworks/:id', asyncHandler(artworkController.getById));

// --- Recommendations -------------------------------------------------------
apiRouter.get('/recommendations', asyncHandler(recommendationController.list));

// --- Interactions ----------------------------------------------------------
apiRouter.post('/interactions', asyncHandler(interactionController.record));

// --- Collections -----------------------------------------------------------
apiRouter.get('/collections', asyncHandler(collectionController.list));
apiRouter.post('/collections', asyncHandler(collectionController.create));
apiRouter.get('/collections/:id', asyncHandler(collectionController.get));
apiRouter.patch('/collections/:id', asyncHandler(collectionController.update));
apiRouter.delete('/collections/:id', asyncHandler(collectionController.remove));
apiRouter.post('/collections/:id/items', asyncHandler(collectionController.addItem));
apiRouter.delete(
  '/collections/:id/items/:artworkId',
  asyncHandler(collectionController.removeItem),
);

// --- Visits ----------------------------------------------------------------
apiRouter.get('/visits', asyncHandler(visitController.list));
apiRouter.post('/visits', asyncHandler(visitController.create));
apiRouter.get('/visits/:id', asyncHandler(visitController.get));
apiRouter.patch('/visits/:id', asyncHandler(visitController.update));
apiRouter.delete('/visits/:id', asyncHandler(visitController.remove));
apiRouter.post('/visits/:id/generate', asyncHandler(visitController.generate));
apiRouter.post('/visits/:id/items', asyncHandler(visitController.addItem));
apiRouter.delete('/visits/:id/items/:artworkId', asyncHandler(visitController.removeItem));
apiRouter.put('/visits/:id/reorder', asyncHandler(visitController.reorder));
