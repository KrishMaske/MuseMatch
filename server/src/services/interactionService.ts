import {
  INTERACTION_STRENGTHS,
  type Interaction,
  type RecordInteractionInput,
} from '@musematch/shared';
import { interactionRepository } from '../repositories/interactionRepository.js';
import { artworkService } from './artworkService.js';
import { preferenceService } from './profile/preferenceService.js';

/**
 * Records behavioral signals and feeds them back into the taste profile.
 *
 * Both halves happen here so there is no way to log an interaction without it
 * teaching the profile, or to move the profile without a record of why.
 */
export const interactionService = {
  async record(userId: string, input: RecordInteractionInput): Promise<Interaction> {
    // Resolving through the artwork service means an interaction on a piece
    // that was never cached still lands on a real local row.
    const artwork = await artworkService.getById(input.artworkId);
    const weight = INTERACTION_STRENGTHS[input.type];

    const created = await interactionRepository.record({
      userId,
      artworkId: artwork.id,
      type: input.type,
      weight,
      ...(input.sourcePage ? { sourcePage: input.sourcePage } : {}),
      ...(input.query ? { query: input.query } : {}),
    });

    await preferenceService.applyInteraction(userId, artwork, input.type);

    return {
      id: created.id,
      artworkId: artwork.id,
      type: input.type,
      weight,
      createdAt: created.createdAt.toISOString(),
    };
  },
};
