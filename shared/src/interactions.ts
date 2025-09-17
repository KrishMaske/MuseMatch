/**
 * Behavioral signals.
 *
 * Every interaction carries a signed strength. The behavioral learner nudges
 * the dimensions an artwork belongs to by that strength, scaled down heavily so
 * a single click never swings the profile.
 */

export const INTERACTION_TYPES = [
  'VIEW',
  'LIKE',
  'DISLIKE',
  'SAVE',
  'UNSAVE',
  'SKIP',
  'SEARCH',
  'ADD_TO_VISIT',
  'REMOVE_FROM_VISIT',
] as const;

export type InteractionType = (typeof INTERACTION_TYPES)[number];

/**
 * Signed strength per interaction type. Positive means "more of this".
 * Tuned so that deliberate acts (saving, planning a visit around it) outweigh
 * incidental ones (a card scrolling past).
 */
export const INTERACTION_STRENGTHS: Record<InteractionType, number> = {
  VIEW: 0.1,
  LIKE: 0.5,
  SAVE: 0.8,
  ADD_TO_VISIT: 1.0,
  SKIP: -0.2,
  DISLIKE: -0.8,
  UNSAVE: -0.5,
  REMOVE_FROM_VISIT: -0.4,
  SEARCH: 0.0,
};

export interface RecordInteractionInput {
  artworkId: string;
  type: InteractionType;
  sourcePage?: string;
  query?: string;
}

export interface Interaction {
  id: string;
  artworkId: string;
  type: InteractionType;
  weight: number;
  createdAt: string;
}
