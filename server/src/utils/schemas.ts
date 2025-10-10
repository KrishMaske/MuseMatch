import { z } from 'zod';
import {
  ARTWORK_SORTS,
  ERAS,
  EXPERIENCES,
  INTERACTION_TYPES,
  MAX_VISIT_MINUTES,
  MEDIUMS,
  MIN_VISIT_MINUTES,
  MUSEUM_SOURCES,
  STYLES,
  THEMES,
} from '@musematch/shared';

/**
 * Request validation.
 *
 * Every schema is defined here so the accepted shape of the API is visible in
 * one file. Client-side validation is a convenience; this is the boundary that
 * actually decides what the database sees.
 */

const trimmedString = (max: number) => z.string().trim().min(1).max(max);

/**
 * Booleans in a query string arrive as the text "true"/"false".
 * An explicit enum rather than `z.coerce.boolean()`, which would read the
 * string "false" as truthy, and which would silently accept any other value.
 */
const booleanQueryParam = z
  .enum(['true', 'false'])
  .optional()
  .transform((value): boolean | undefined => (value === undefined ? undefined : value === 'true'));

/**
 * A visit date.
 *
 * Accepts a calendar day (`2026-09-15`) as well as a full timestamp, because a
 * museum visit is planned as a day and that is what `<input type="date">`
 * produces. Requiring a full ISO datetime would reject every date the planner
 * form can actually submit.
 */
const visitDateParam = z
  .union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date like 2026-09-15'),
    z.string().datetime(),
  ])
  .nullable()
  .optional();

/** Query strings arrive as text, so numeric params are coerced then bounded. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(60).optional(),
});

export const idParamSchema = z.object({
  id: z.string().min(1).max(200),
});

export const artworkIdParamSchema = z.object({
  id: z.string().min(1).max(200),
  artworkId: z.string().min(1).max(200),
});

export const artworkSearchSchema = paginationSchema.extend({
  q: z.string().trim().max(200).optional(),
  museum: z.enum(MUSEUM_SOURCES).optional(),
  medium: z.enum(MEDIUMS).optional(),
  theme: z.enum(THEMES).optional(),
  period: z.enum(ERAS).optional(),
  artist: z.string().trim().max(120).optional(),
  department: z.string().trim().max(120).optional(),
  classification: z.string().trim().max(120).optional(),
  culture: z.string().trim().max(120).optional(),
  sort: z.enum(ARTWORK_SORTS).optional(),
  semantic: booleanQueryParam,
});

export const similarQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(24).optional(),
});

export const recommendationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(60).optional(),
  museum: z.enum(MUSEUM_SOURCES).optional(),
  excludeSeen: booleanQueryParam,
});

export const updateProfileSchema = z
  .object({
    displayName: trimmedString(80).optional(),
    avatarUrl: z.string().url().max(500).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

/** A weight map: known keys only, values inside [0, 1]. */
const weightMap = <T extends readonly [string, ...string[]]>(keys: T) =>
  z.record(z.enum(keys), z.number().min(0).max(1)).optional();

export const preferenceWeightsSchema = z.object({
  medium: weightMap(MEDIUMS),
  era: weightMap(ERAS),
  theme: weightMap(THEMES),
  style: weightMap(STYLES),
  experience: weightMap(EXPERIENCES),
});

export const updatePreferencesSchema = z
  .object({
    weights: preferenceWeightsSchema.optional(),
    explorationScore: z.number().min(0).max(1).optional(),
  })
  .refine((value) => value.weights !== undefined || value.explorationScore !== undefined, {
    message: 'Provide weights, an exploration score, or both.',
  });

export const onboardingSchema = z.object({
  answers: z.record(z.string().max(60), z.array(z.string().max(60)).max(10)),
});

export const interactionSchema = z.object({
  artworkId: z.string().min(1).max(200),
  type: z.enum(INTERACTION_TYPES),
  sourcePage: z.string().trim().max(60).optional(),
  query: z.string().trim().max(200).optional(),
});

export const createCollectionSchema = z.object({
  name: trimmedString(80),
  description: z.string().trim().max(500).nullable().optional(),
});

export const updateCollectionSchema = z
  .object({
    name: trimmedString(80).optional(),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export const collectionItemSchema = z.object({
  artworkId: z.string().min(1).max(200),
});

export const createVisitSchema = z.object({
  name: trimmedString(80),
  museum: z.enum(MUSEUM_SOURCES),
  availableMinutes: z.number().int().min(MIN_VISIT_MINUTES).max(MAX_VISIT_MINUTES),
  visitDate: visitDateParam,
});

export const updateVisitSchema = z
  .object({
    name: trimmedString(80).optional(),
    museum: z.enum(MUSEUM_SOURCES).optional(),
    availableMinutes: z.number().int().min(MIN_VISIT_MINUTES).max(MAX_VISIT_MINUTES).optional(),
    visitDate: visitDateParam,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export const visitItemSchema = z.object({
  artworkId: z.string().min(1).max(200),
});

export const reorderVisitSchema = z.object({
  artworkIds: z.array(z.string().min(1).max(200)).min(1).max(200),
});
