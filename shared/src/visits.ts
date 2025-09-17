import type { Artwork, MuseumSource } from './artwork.js';

export interface Visit {
  id: string;
  name: string;
  museum: MuseumSource;
  museumName: string;
  visitDate: string | null;
  availableMinutes: number;
  generated: boolean;
  itemCount: number;
  totalMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface VisitDetail extends Visit {
  items: VisitItem[];
  /** The same items grouped for walking order. See ItineraryService. */
  stops: VisitStop[];
}

export interface VisitItem {
  id: string;
  artwork: Artwork;
  position: number;
  estimatedMinutes: number;
  recommendationScore: number;
  reasons: string[];
}

/** A run of consecutive items that live in the same department. */
export interface VisitStop {
  department: string;
  items: VisitItem[];
  totalMinutes: number;
}

export interface CreateVisitInput {
  name: string;
  museum: MuseumSource;
  availableMinutes: number;
  visitDate?: string | null;
}

export type UpdateVisitInput = Partial<CreateVisitInput>;

/** Presets offered by the visit planner, in minutes. */
export const VISIT_DURATION_PRESETS = [
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
  { label: '3 hours', minutes: 180 },
  { label: 'Half a day', minutes: 300 },
] as const;

export const MIN_VISIT_MINUTES = 30;
export const MAX_VISIT_MINUTES = 600;

/**
 * Rough dwell times, in minutes.
 *
 * These are planning conventions, not measurements. They exist so a two-hour
 * budget produces a plausible number of stops rather than an unwalkable list.
 */
export const VIEWING_TIME_MINUTES = {
  standard: 10,
  major: 15,
  installation: 20,
} as const;

export type ViewingTimeClass = keyof typeof VIEWING_TIME_MINUTES;
