/**
 * The onboarding quiz, defined once and shared.
 *
 * The client renders these questions; the server validates submissions against
 * the same definitions and derives preference weights from the `contributions`
 * each chosen option declares. Keeping the mapping on the option itself means
 * there is no second place where "what does this answer mean" gets decided.
 */

import type { Era, Experience, Medium, PreferenceDimension, Style, Theme } from './preferences.js';

export type PreferenceKey = Medium | Era | Theme | Experience | Style;

export interface OptionContribution {
  dimension: PreferenceDimension;
  key: PreferenceKey;
  /** Weight added for this option, before rank decay and normalization. */
  weight: number;
}

export interface QuizOption {
  value: string;
  label: string;
  description?: string;
  contributions: OptionContribution[];
  /** Only on the exploration question: the exploration score this implies. */
  exploration?: number;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  helper?: string;
  type: 'single' | 'multi';
  minSelections?: number;
  /** Upper bound for multi-select questions. */
  maxSelections?: number;
  options: QuizOption[];
}

const m = (key: Medium, weight: number): OptionContribution => ({
  dimension: 'medium',
  key,
  weight,
});
const e = (key: Era, weight: number): OptionContribution => ({ dimension: 'era', key, weight });
const t = (key: Theme, weight: number): OptionContribution => ({ dimension: 'theme', key, weight });
const x = (key: Experience, weight: number): OptionContribution => ({
  dimension: 'experience',
  key,
  weight,
});
const s = (key: Style, weight: number): OptionContribution => ({ dimension: 'style', key, weight });

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'medium',
    prompt: 'What kind of work do you want to stand in front of?',
    helper: 'Pick up to three.',
    type: 'multi',
    minSelections: 1,
    maxSelections: 3,
    options: [
      { value: 'painting', label: 'Paintings', contributions: [m('painting', 1)] },
      { value: 'photography', label: 'Photography', contributions: [m('photography', 1)] },
      { value: 'sculpture', label: 'Sculpture', contributions: [m('sculpture', 1)] },
      {
        value: 'fashion',
        label: 'Fashion & textiles',
        contributions: [m('fashion', 1), t('fashion', 0.4)],
      },
      {
        value: 'architecture',
        label: 'Architecture',
        contributions: [m('architecture', 1), t('architecture', 0.4)],
      },
      {
        value: 'decorative-arts',
        label: 'Objects & decorative arts',
        contributions: [m('decorative-arts', 1)],
      },
      {
        value: 'digital-art',
        label: 'Digital & new media',
        contributions: [m('digital-art', 1), x('experimental', 0.4)],
      },
    ],
  },
  {
    id: 'era',
    prompt: 'Which stretch of history pulls at you?',
    helper: 'Pick up to three.',
    type: 'multi',
    minSelections: 1,
    maxSelections: 3,
    options: [
      {
        value: 'ancient',
        label: 'Ancient worlds',
        description: 'Before 500 CE',
        contributions: [e('ancient', 1), x('historical', 0.3)],
      },
      {
        value: 'medieval',
        label: 'Medieval',
        description: '500 - 1400',
        contributions: [e('medieval', 1), x('historical', 0.3)],
      },
      {
        value: 'renaissance',
        label: 'Renaissance',
        description: '1400 - 1600',
        contributions: [e('renaissance', 1)],
      },
      {
        value: 'baroque',
        label: 'Baroque',
        description: '1600 - 1700',
        contributions: [e('baroque', 1), s('dramatic', 0.4)],
      },
      { value: '18th-century', label: '18th century', contributions: [e('18th-century', 1)] },
      { value: '19th-century', label: '19th century', contributions: [e('19th-century', 1)] },
      {
        value: 'modern',
        label: 'Modern',
        description: '1900 - 1970',
        contributions: [e('modern', 1)],
      },
      {
        value: 'contemporary',
        label: 'Contemporary',
        description: '1970 - today',
        contributions: [e('contemporary', 1), x('experimental', 0.3)],
      },
    ],
  },
  {
    id: 'theme',
    prompt: 'What do you like art to be about?',
    helper: 'Pick up to four.',
    type: 'multi',
    minSelections: 1,
    maxSelections: 4,
    options: [
      { value: 'nature', label: 'Nature & landscape', contributions: [t('nature', 1)] },
      { value: 'portraits', label: 'People & portraits', contributions: [t('portraits', 1)] },
      { value: 'mythology', label: 'Myth & legend', contributions: [t('mythology', 1)] },
      { value: 'cities', label: 'Cities & street life', contributions: [t('cities', 1)] },
      { value: 'everyday-life', label: 'Ordinary life', contributions: [t('everyday-life', 1)] },
      { value: 'fashion', label: 'Clothing & adornment', contributions: [t('fashion', 1)] },
      { value: 'religion', label: 'Faith & ritual', contributions: [t('religion', 1)] },
      {
        value: 'abstraction',
        label: 'Pure form & abstraction',
        contributions: [t('abstraction', 1), s('abstract', 0.5)],
      },
      {
        value: 'politics',
        label: 'Power & protest',
        contributions: [t('politics', 1), x('thought-provoking', 0.4)],
      },
      { value: 'architecture', label: 'Buildings & space', contributions: [t('architecture', 1)] },
    ],
  },
  {
    id: 'experience',
    prompt: 'What do you want a visit to feel like?',
    helper: 'Pick up to three.',
    type: 'multi',
    minSelections: 1,
    maxSelections: 3,
    options: [
      {
        value: 'relaxing',
        label: 'Calm and unhurried',
        contributions: [x('relaxing', 1), s('peaceful', 0.4)],
      },
      {
        value: 'educational',
        label: 'I want to learn something',
        contributions: [x('educational', 1)],
      },
      { value: 'emotional', label: 'I want to be moved', contributions: [x('emotional', 1)] },
      {
        value: 'thought-provoking',
        label: 'I want to be challenged',
        contributions: [x('thought-provoking', 1)],
      },
      {
        value: 'visually-impressive',
        label: 'I want to be dazzled',
        contributions: [x('visually-impressive', 1), s('dramatic', 0.4)],
      },
      {
        value: 'experimental',
        label: 'Show me something strange',
        contributions: [x('experimental', 1), s('abstract', 0.3)],
      },
      { value: 'historical', label: 'I want the long view', contributions: [x('historical', 1)] },
      {
        value: 'interactive',
        label: 'I want to participate',
        contributions: [x('interactive', 1)],
      },
    ],
  },
  {
    id: 'style',
    prompt: 'Which of these describes the look you gravitate toward?',
    helper: 'Pick up to three.',
    type: 'multi',
    minSelections: 1,
    maxSelections: 3,
    options: [
      { value: 'colorful', label: 'Saturated and colorful', contributions: [s('colorful', 1)] },
      { value: 'muted', label: 'Quiet and muted', contributions: [s('muted', 1)] },
      { value: 'realistic', label: 'True to life', contributions: [s('realistic', 1)] },
      { value: 'abstract', label: 'Abstract', contributions: [s('abstract', 1)] },
      { value: 'minimal', label: 'Spare and minimal', contributions: [s('minimal', 1)] },
      { value: 'detailed', label: 'Dense with detail', contributions: [s('detailed', 1)] },
      { value: 'dramatic', label: 'High contrast and dramatic', contributions: [s('dramatic', 1)] },
      { value: 'peaceful', label: 'Still and peaceful', contributions: [s('peaceful', 1)] },
    ],
  },
  {
    id: 'doorway',
    prompt: 'You walk in with ten minutes to spare. Which room do you choose?',
    type: 'single',
    minSelections: 1,
    options: [
      {
        value: 'light-room',
        label: 'A bright room of landscapes and open windows',
        contributions: [
          t('nature', 0.8),
          s('peaceful', 0.6),
          x('relaxing', 0.6),
          m('painting', 0.4),
        ],
      },
      {
        value: 'dark-room',
        label: 'A dim room where one enormous canvas is lit from above',
        contributions: [
          s('dramatic', 0.8),
          x('emotional', 0.6),
          e('baroque', 0.4),
          m('painting', 0.4),
        ],
      },
      {
        value: 'white-room',
        label: 'A white room with three objects and a lot of empty floor',
        contributions: [
          s('minimal', 0.8),
          t('abstraction', 0.6),
          e('contemporary', 0.5),
          m('sculpture', 0.4),
        ],
      },
      {
        value: 'crowded-room',
        label: 'A crowded case of small things people actually used',
        contributions: [
          t('everyday-life', 0.8),
          m('decorative-arts', 0.6),
          x('historical', 0.5),
          s('detailed', 0.4),
        ],
      },
    ],
  },
  {
    id: 'pace',
    prompt: 'How do you actually move through a gallery?',
    type: 'single',
    minSelections: 1,
    options: [
      {
        value: 'slow',
        label: 'A few works, for a long time',
        contributions: [x('relaxing', 0.6), x('emotional', 0.4)],
      },
      {
        value: 'reader',
        label: 'I read every label',
        contributions: [x('educational', 0.8), x('historical', 0.4), s('detailed', 0.3)],
      },
      {
        value: 'sweep',
        label: 'I sweep the room and stop at whatever catches me',
        contributions: [x('visually-impressive', 0.6), s('colorful', 0.3)],
      },
      {
        value: 'wander',
        label: 'I get lost on purpose',
        contributions: [x('experimental', 0.6), x('thought-provoking', 0.3)],
      },
    ],
  },
  {
    id: 'exploration',
    prompt: 'How adventurous should your recommendations be?',
    helper: 'You can change this any time.',
    type: 'single',
    minSelections: 1,
    options: [
      {
        value: 'familiar',
        label: 'Mostly things I already know I like',
        contributions: [],
        exploration: 0.2,
      },
      {
        value: 'balanced',
        label: 'A balance of familiar and new',
        contributions: [],
        exploration: 0.5,
      },
      {
        value: 'exploratory',
        label: 'Push me somewhere unexpected',
        contributions: [x('experimental', 0.4)],
        exploration: 0.85,
      },
    ],
  },
];

/** Submitted answers: question id -> selected option values, in pick order. */
export type QuizAnswers = Record<string, string[]>;

/** Rank decay applied to multi-select picks, so the first pick counts most. */
export const QUIZ_RANK_DECAY = 0.85;

export function findQuestion(id: string): QuizQuestion | undefined {
  return QUIZ_QUESTIONS.find((question) => question.id === id);
}
