/**
 * The taste vocabulary.
 *
 * These five dimensions are the shared language between the onboarding quiz,
 * the recommendation scorer, the behavioral learner and the profile dashboard.
 * Adding a value here makes it available to all four.
 */

export const MEDIUMS = [
  'painting',
  'photography',
  'sculpture',
  'fashion',
  'architecture',
  'decorative-arts',
  'digital-art',
] as const;
export type Medium = (typeof MEDIUMS)[number];

export const ERAS = [
  'ancient',
  'medieval',
  'renaissance',
  'baroque',
  '18th-century',
  '19th-century',
  'modern',
  'contemporary',
] as const;
export type Era = (typeof ERAS)[number];

export const THEMES = [
  'nature',
  'portraits',
  'mythology',
  'cities',
  'everyday-life',
  'fashion',
  'religion',
  'abstraction',
  'politics',
  'architecture',
] as const;
export type Theme = (typeof THEMES)[number];

export const EXPERIENCES = [
  'relaxing',
  'educational',
  'emotional',
  'thought-provoking',
  'visually-impressive',
  'experimental',
  'historical',
  'interactive',
] as const;
export type Experience = (typeof EXPERIENCES)[number];

export const STYLES = [
  'colorful',
  'muted',
  'realistic',
  'abstract',
  'minimal',
  'detailed',
  'dramatic',
  'peaceful',
] as const;
export type Style = (typeof STYLES)[number];

/** Display copy. Keys are the machine values above; never render those raw. */
export const MEDIUM_LABELS: Record<Medium, string> = {
  painting: 'Painting',
  photography: 'Photography',
  sculpture: 'Sculpture',
  fashion: 'Fashion & Textiles',
  architecture: 'Architecture',
  'decorative-arts': 'Decorative Arts',
  'digital-art': 'Digital & New Media',
};

export const ERA_LABELS: Record<Era, string> = {
  ancient: 'Ancient',
  medieval: 'Medieval',
  renaissance: 'Renaissance',
  baroque: 'Baroque',
  '18th-century': '18th Century',
  '19th-century': '19th Century',
  modern: 'Modern',
  contemporary: 'Contemporary',
};

export const THEME_LABELS: Record<Theme, string> = {
  nature: 'Nature & Landscape',
  portraits: 'Portraits & People',
  mythology: 'Mythology & Legend',
  cities: 'Cities & Urban Life',
  'everyday-life': 'Everyday Life',
  fashion: 'Fashion & Dress',
  religion: 'Faith & Ritual',
  abstraction: 'Abstraction',
  politics: 'Power & Politics',
  architecture: 'Architecture & Space',
};

export const EXPERIENCE_LABELS: Record<Experience, string> = {
  relaxing: 'Relaxing',
  educational: 'Educational',
  emotional: 'Emotional',
  'thought-provoking': 'Thought-provoking',
  'visually-impressive': 'Visually impressive',
  experimental: 'Experimental',
  historical: 'Historical',
  interactive: 'Interactive',
};

export const STYLE_LABELS: Record<Style, string> = {
  colorful: 'Colorful',
  muted: 'Muted',
  realistic: 'Realistic',
  abstract: 'Abstract',
  minimal: 'Minimal',
  detailed: 'Highly detailed',
  dramatic: 'Dramatic',
  peaceful: 'Peaceful',
};

/**
 * Approximate year boundaries used to place an artwork in an era.
 * These are conventions for grouping a catalog, not art-historical claims.
 */
export const ERA_RANGES: Record<Era, { start: number; end: number }> = {
  ancient: { start: -4000, end: 500 },
  medieval: { start: 500, end: 1400 },
  renaissance: { start: 1400, end: 1600 },
  baroque: { start: 1600, end: 1700 },
  '18th-century': { start: 1700, end: 1800 },
  '19th-century': { start: 1800, end: 1900 },
  modern: { start: 1900, end: 1970 },
  contemporary: { start: 1970, end: 2100 },
};

/** A weight map over one dimension. Values are clamped to [0, 1]. */
export type WeightMap<K extends string> = Partial<Record<K, number>>;

export interface PreferenceWeights {
  medium: WeightMap<Medium>;
  era: WeightMap<Era>;
  theme: WeightMap<Theme>;
  experience: WeightMap<Experience>;
  style: WeightMap<Style>;
}

export interface TasteProfile {
  /** Set once by the onboarding quiz, then only by explicit profile edits. */
  explicit: PreferenceWeights;
  /** Accumulated from interactions. Kept separate so either can be tuned alone. */
  behavioral: PreferenceWeights;
  /** 0 = only safe familiar picks, 1 = strongly exploratory. */
  explorationScore: number;
  onboardingCompleted: boolean;
  updatedAt: string;
}

export const PREFERENCE_DIMENSIONS = ['medium', 'era', 'theme', 'experience', 'style'] as const;
export type PreferenceDimension = (typeof PREFERENCE_DIMENSIONS)[number];

export const EMPTY_PREFERENCE_WEIGHTS: PreferenceWeights = {
  medium: {},
  era: {},
  theme: {},
  experience: {},
  style: {},
};

export const DEFAULT_EXPLORATION_SCORE = 0.5;
