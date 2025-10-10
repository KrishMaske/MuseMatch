import {
  ERA_LABELS,
  EXPERIENCE_LABELS,
  MEDIUM_LABELS,
  STYLE_LABELS,
  THEME_LABELS,
  type ArtPersonality,
  type PreferenceWeights,
} from '@musematch/shared';
import { getWeight, topKeys } from '../../utils/weights.js';

/**
 * The art personality shown on the profile page.
 *
 * Rule-based on purpose. A language model would produce nicer prose, but this
 * has to be deterministic (the same profile always yields the same title),
 * explainable (the summary names the actual weights that chose it), free, and
 * unable to invent a flattering fact about the user. A scored rule table gives
 * all four.
 */

interface PersonalityRule {
  title: string;
  /** Higher wins. Ties break by order of declaration. */
  score: (weights: PreferenceWeights, exploration: number) => number;
}

const w = getWeight;

const RULES: PersonalityRule[] = [
  {
    title: 'The Modern Explorer',
    score: (weights, exploration) =>
      Math.max(w(weights, 'era', 'contemporary'), w(weights, 'era', 'modern')) * 1.2 + exploration,
  },
  {
    title: 'The Romantic Historian',
    score: (weights) =>
      Math.max(
        w(weights, 'era', 'renaissance'),
        w(weights, 'era', 'baroque'),
        w(weights, 'era', '19th-century'),
      ) + Math.max(w(weights, 'experience', 'historical'), w(weights, 'experience', 'emotional')),
  },
  {
    title: 'The Visual Minimalist',
    score: (weights) =>
      Math.max(w(weights, 'style', 'minimal'), w(weights, 'style', 'muted')) * 1.2 +
      w(weights, 'theme', 'abstraction'),
  },
  {
    title: 'The Curious Traditionalist',
    score: (weights, exploration) =>
      Math.max(
        w(weights, 'era', 'ancient'),
        w(weights, 'era', 'medieval'),
        w(weights, 'era', 'renaissance'),
      ) +
      (1 - exploration) * 0.8,
  },
  {
    title: 'The Experimental Collector',
    score: (weights) =>
      w(weights, 'experience', 'experimental') * 1.3 +
      Math.max(w(weights, 'medium', 'digital-art'), w(weights, 'medium', 'sculpture')) * 0.7,
  },
  {
    title: 'The Quiet Naturalist',
    score: (weights) =>
      w(weights, 'theme', 'nature') +
      Math.max(w(weights, 'style', 'peaceful'), w(weights, 'experience', 'relaxing')) * 0.9,
  },
  {
    title: 'The Portrait Reader',
    score: (weights) =>
      w(weights, 'theme', 'portraits') + w(weights, 'experience', 'educational') * 0.8,
  },
  {
    title: 'The City Documentarian',
    score: (weights) =>
      Math.max(w(weights, 'theme', 'cities'), w(weights, 'theme', 'everyday-life')) +
      w(weights, 'medium', 'photography') * 0.9,
  },
];

const FALLBACK_TITLE = 'The Open Visitor';

export function deriveArtPersonality(
  weights: PreferenceWeights,
  exploration: number,
): ArtPersonality {
  const traits = collectTraits(weights);

  if (traits.length === 0) {
    return {
      title: FALLBACK_TITLE,
      summary: 'Take the taste quiz and MuseMatch will start describing what you gravitate toward.',
      traits: [],
    };
  }

  let best = RULES[0] as PersonalityRule;
  let bestScore = best.score(weights, exploration);

  for (const rule of RULES.slice(1)) {
    const score = rule.score(weights, exploration);
    if (score > bestScore) {
      best = rule;
      bestScore = score;
    }
  }

  // A profile too weak to distinguish should not be given a confident label.
  const title = bestScore < 0.4 ? FALLBACK_TITLE : best.title;

  return { title, summary: buildSummary(weights, exploration), traits };
}

/** Names the actual top weights, so the summary is a description not a claim. */
function buildSummary(weights: PreferenceWeights, exploration: number): string {
  const era = topKeys(weights, 'era', 1)[0];
  const theme = topKeys(weights, 'theme', 1)[0];
  const medium = topKeys(weights, 'medium', 1)[0];
  const style = topKeys(weights, 'style', 1)[0];

  const clauses: string[] = [];

  if (era && medium) {
    clauses.push(
      `${ERA_LABELS[era.key as keyof typeof ERA_LABELS].toLowerCase()} ${MEDIUM_LABELS[
        medium.key as keyof typeof MEDIUM_LABELS
      ].toLowerCase()}`,
    );
  } else if (medium) {
    clauses.push(MEDIUM_LABELS[medium.key as keyof typeof MEDIUM_LABELS].toLowerCase());
  } else if (era) {
    clauses.push(`${ERA_LABELS[era.key as keyof typeof ERA_LABELS].toLowerCase()} work`);
  }

  if (theme) {
    clauses.push(`${THEME_LABELS[theme.key as keyof typeof THEME_LABELS].toLowerCase()}`);
  }
  if (style) {
    clauses.push(
      `${STYLE_LABELS[style.key as keyof typeof STYLE_LABELS].toLowerCase()} visual styles`,
    );
  }

  const appetite =
    exploration > 0.65
      ? ' You have asked for recommendations that push past the familiar.'
      : exploration < 0.35
        ? ' You have asked to stay close to what you already know you like.'
        : '';

  return `You gravitate toward ${joinClauses(clauses)}.${appetite}`;
}

function collectTraits(weights: PreferenceWeights): string[] {
  const traits: string[] = [];

  for (const { key } of topKeys(weights, 'medium', 1)) {
    traits.push(MEDIUM_LABELS[key as keyof typeof MEDIUM_LABELS]);
  }
  for (const { key } of topKeys(weights, 'era', 1)) {
    traits.push(ERA_LABELS[key as keyof typeof ERA_LABELS]);
  }
  for (const { key } of topKeys(weights, 'theme', 2)) {
    traits.push(THEME_LABELS[key as keyof typeof THEME_LABELS]);
  }
  for (const { key } of topKeys(weights, 'experience', 1)) {
    traits.push(EXPERIENCE_LABELS[key as keyof typeof EXPERIENCE_LABELS]);
  }

  return traits;
}

function joinClauses(clauses: string[]): string {
  if (clauses.length === 0) return 'a broad range of work';
  if (clauses.length === 1) return clauses[0] as string;
  return `${clauses.slice(0, -1).join(', ')} and ${clauses[clauses.length - 1]}`;
}
