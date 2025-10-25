import {
  buildFacetTag,
  ERA_RANGES,
  ERAS,
  type ArtworkFacets,
  type Era,
  type Experience,
  type Medium,
  type Style,
  type Theme,
} from '@musematch/shared';

/**
 * Museum metadata is free text written by curators, not a controlled
 * vocabulary we control. This module is the single place where that text is
 * interpreted into MuseMatch's five taste dimensions.
 *
 * The approach is deliberately a transparent keyword classifier rather than a
 * model: it is deterministic, debuggable, and easy to correct when it gets a
 * department wrong. Its weakness is real and worth stating -- it reads words,
 * not images, so an untitled abstract canvas with a sparse record will be
 * classified thinly.
 *
 * Matches are weighted by *which field* they came from, because museum fields
 * are not equally informative. "Painting and Sculpture of Europe" is the name
 * of a department, not a description of the object in it; without weighting,
 * every Van Gogh in that wing gets tagged as sculpture.
 */

type Segment =
  | 'title'
  | 'medium'
  | 'classification'
  | 'department'
  | 'culture'
  | 'period'
  | 'description'
  | 'keywords';

interface ClassificationSource {
  title: string;
  artist: string | null;
  medium: string | null;
  classification: string | null;
  department: string | null;
  culture: string | null;
  period: string | null;
  description: string | null;
  dateStart: number | null;
  dateEnd: number | null;
  /** Extra provider hints, e.g. AIC's `style_titles` and `subject_titles`. */
  keywords: string[];
}

type Rule<K extends string> = { key: K; patterns: RegExp[] };

/**
 * How much a match in each field counts, per dimension.
 *
 * A field's weight reflects how directly it describes the object: the `medium`
 * field states what a thing is made of, while `department` only says where the
 * museum files it.
 */
const SEGMENT_WEIGHTS: Record<'medium' | 'theme' | 'style', Partial<Record<Segment, number>>> = {
  medium: {
    medium: 1,
    classification: 1,
    keywords: 0.7,
    department: 0.35,
    title: 0.3,
    description: 0.2,
  },
  theme: {
    title: 1,
    keywords: 0.8,
    description: 0.45,
    classification: 0.5,
    department: 0.3,
    culture: 0.2,
  },
  style: {
    period: 1,
    medium: 0.8,
    classification: 0.7,
    keywords: 0.7,
    title: 0.4,
    description: 0.35,
  },
};

/**
 * Minimum weighted score before a facet is assigned. Set just above the
 * department weight, so where a museum files something is corroborating
 * evidence rather than sufficient evidence on its own.
 */
const MATCH_THRESHOLD = 0.6;

/** Distinct patterns per segment that count toward a rule's score. */
const MAX_HITS_PER_SEGMENT = 2;

const MEDIUM_RULES: Rule<Medium>[] = [
  {
    key: 'painting',
    // `painting`, not `paint`: "Earthenware; painted decoration" is a pot and
    // "cotton, plain weave; painted" is a textile.
    patterns: [
      /\bpaintings?\b/i,
      /oil on/i,
      /\bcanvas\b/i,
      /tempera/i,
      /acrylic/i,
      /fresco/i,
      /watercolou?r/i,
      /gouache/i,
      /distemper/i,
    ],
  },
  {
    key: 'photography',
    patterns: [
      /photograph/i,
      /gelatin silver/i,
      /albumen/i,
      /daguerreotype/i,
      /\bnegative\b/i,
      /platinum print/i,
      /chromogenic/i,
    ],
  },
  {
    key: 'sculpture',
    patterns: [
      /sculptur/i,
      /\bbronze\b/i,
      /\bmarble\b/i,
      /\bcarv/i,
      /terracotta/i,
      /\bstatue/i,
      /\brelief\b/i,
      /plaster/i,
      /alabaster/i,
    ],
  },
  {
    key: 'fashion',
    // Bare "silk" is deliberately absent: East Asian paintings are routinely
    // "ink and color on silk", and the material alone says nothing about form.
    patterns: [
      /costume/i,
      /\bdress\b/i,
      /textile/i,
      /garment/i,
      /embroider/i,
      /\bgown\b/i,
      /\brobe\b/i,
      /ensemble/i,
      /\bshoe/i,
      /tapestr/i,
      /\bweave\b/i,
    ],
  },
  {
    key: 'architecture',
    patterns: [
      /architect/i,
      /\bfacade\b/i,
      /architectural (model|drawing|element|fragment)/i,
      /\bcapital\b/i,
    ],
  },
  {
    key: 'decorative-arts',
    patterns: [
      /ceramic/i,
      /porcelain/i,
      /\bglass\b/i,
      /\bsilverware\b|\bsilver\b/i,
      /furniture/i,
      /\bvase\b/i,
      /jewel/i,
      /metalwork/i,
      /lacquer/i,
      /enamel/i,
      /\bivory\b/i,
      /\bpottery\b/i,
      /\bearthenware\b/i,
    ],
  },
  {
    key: 'digital-art',
    patterns: [
      /\bvideo\b/i,
      /\bdigital\b/i,
      /new media/i,
      /\binstallation\b/i,
      /\bsound art\b/i,
      /computer/i,
      /electronic/i,
    ],
  },
];

const THEME_RULES: Rule<Theme>[] = [
  {
    key: 'nature',
    patterns: [
      /landscape/i,
      /\btree/i,
      /\bflower/i,
      /\bgarden/i,
      /mountain/i,
      /\briver\b/i,
      /\bsea\b/i,
      /\bocean\b/i,
      /\banimal/i,
      /\bbird/i,
      /botanic/i,
      /\bforest/i,
      /still life/i,
      /\bhorse/i,
      /\bfruit\b/i,
    ],
  },
  {
    key: 'portraits',
    patterns: [
      /portrait/i,
      /\bbust of\b/i,
      /head of/i,
      /self-portrait/i,
      /\bsitter\b/i,
      /\bwomen\b/i,
      /\bmen\b/i,
    ],
  },
  {
    key: 'mythology',
    patterns: [
      /mytholog/i,
      /\bmyth\b/i,
      /\bgoddess\b/i,
      /\bapollo\b/i,
      /\bvenus\b/i,
      /hercules/i,
      /\bnymph/i,
      /allegor/i,
      /\bcupid\b/i,
      /\bdiana\b/i,
    ],
  },
  {
    key: 'cities',
    patterns: [
      /\bcity\b|\bcities\b/i,
      /\bstreet/i,
      /\burban\b/i,
      /\bbridge\b/i,
      /\bharbou?r\b/i,
      /\bskyline\b/i,
      /\bboulevard\b/i,
      /\bcityscape\b/i,
    ],
  },
  {
    key: 'everyday-life',
    patterns: [
      /genre (scene|painting)/i,
      /\bkitchen\b/i,
      /\bmarket\b/i,
      /\bfamily\b/i,
      /\bworker/i,
      /domestic/i,
      /\bmeal\b/i,
      /daily life/i,
      /\bcafe\b/i,
      /\btavern\b/i,
      /\binteriors?\b/i,
    ],
  },
  {
    key: 'fashion',
    patterns: [
      /costume/i,
      /\bdress\b/i,
      /\bgown\b/i,
      /fashion/i,
      /\battire\b/i,
      /textile/i,
      /\bjewelry\b/i,
    ],
  },
  {
    key: 'religion',
    // `saint` excludes hyphenated place names such as Saint-Remy, which
    // otherwise made every Van Gogh painted in Provence look devotional.
    patterns: [
      /\bchrist\b/i,
      /madonna/i,
      /\bsaint\b(?!-)/i,
      /\bbuddha\b/i,
      /\btemple\b/i,
      /\baltar/i,
      /crucifix/i,
      /\bsacred\b/i,
      /\bdeity\b/i,
      /\bvirgin mary\b/i,
      /\bshrine\b/i,
      /annunciation/i,
    ],
  },
  {
    key: 'abstraction',
    patterns: [
      /\babstract/i,
      /non-?objective/i,
      /color field/i,
      /\bminimalis/i,
      /\bgeometric\b/i,
      /composition no/i,
    ],
  },
  {
    key: 'politics',
    patterns: [
      /\bwar\b/i,
      /revolution/i,
      /\bprotest\b/i,
      /\bbattle\b/i,
      /propaganda/i,
      /\bemperor\b/i,
      /\bsoldier/i,
      /\bpolitic/i,
      /\bempire\b/i,
    ],
  },
  {
    key: 'architecture',
    patterns: [
      /architect/i,
      /\bbuilding/i,
      /cathedral/i,
      /\bfacade\b/i,
      /\bpalace\b/i,
      /\bruins?\b/i,
    ],
  },
];

const STYLE_RULES: Rule<Style>[] = [
  {
    key: 'dramatic',
    patterns: [
      /baroque/i,
      /chiaroscuro/i,
      /tenebr/i,
      /\bstorm/i,
      /\bbattle\b/i,
      /romanticism/i,
      /expressionis/i,
    ],
  },
  {
    key: 'peaceful',
    patterns: [/landscape/i, /\bgarden/i, /still life/i, /pastoral/i, /\bserene\b/i, /\bmeadow\b/i],
  },
  { key: 'realistic', patterns: [/realis/i, /naturalis/i, /portrait/i, /photograph/i, /trompe/i] },
  {
    key: 'abstract',
    patterns: [/abstract/i, /cubis/i, /surreal/i, /non-?objective/i, /color field/i, /futuris/i],
  },
  { key: 'minimal', patterns: [/minimal/i, /monochrom/i, /reductive/i] },
  {
    key: 'detailed',
    patterns: [
      /engraving/i,
      /etching/i,
      /miniature/i,
      /tapestr/i,
      /illuminated/i,
      /manuscript/i,
      /woodblock/i,
      /\bfiligree\b/i,
    ],
  },
  {
    key: 'colorful',
    patterns: [/impressionis/i, /\bfauv/i, /polychrome/i, /pop art/i, /\bvivid\b/i],
  },
  {
    key: 'muted',
    patterns: [
      /gelatin silver/i,
      /\bcharcoal\b/i,
      /graphite/i,
      /\bsepia\b/i,
      /\bink\b/i,
      /grisaille/i,
    ],
  },
];

/** Eras that read as "historical" for the experience dimension. */
const HISTORICAL_ERAS = new Set<Era>([
  'ancient',
  'medieval',
  'renaissance',
  'baroque',
  '18th-century',
]);

function buildSegments(source: ClassificationSource): Partial<Record<Segment, string>> {
  return {
    title: source.title.toLowerCase(),
    medium: source.medium?.toLowerCase() ?? '',
    classification: source.classification?.toLowerCase() ?? '',
    department: source.department?.toLowerCase() ?? '',
    culture: source.culture?.toLowerCase() ?? '',
    period: source.period?.toLowerCase() ?? '',
    description: source.description?.toLowerCase() ?? '',
    keywords: source.keywords.join(' ; ').toLowerCase(),
  };
}

/**
 * Scores each rule by weighted evidence and keeps those clearing the
 * threshold, strongest first.
 */
function matchRules<K extends string>(
  rules: Rule<K>[],
  segments: Partial<Record<Segment, string>>,
  weights: Partial<Record<Segment, number>>,
  limit: number,
): K[] {
  const scored: Array<{ key: K; score: number }> = [];

  for (const rule of rules) {
    let score = 0;

    for (const [segment, weight] of Object.entries(weights) as Array<[Segment, number]>) {
      const text = segments[segment];
      if (!text) continue;

      let hits = 0;
      for (const pattern of rule.patterns) {
        if (pattern.test(text)) hits += 1;
        if (hits >= MAX_HITS_PER_SEGMENT) break;
      }

      score += weight * hits;
    }

    if (score >= MATCH_THRESHOLD) scored.push({ key: rule.key, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.key);
}

/**
 * Places an artwork in an era from its date range, falling back to period and
 * culture text when the provider gives no usable dates.
 */
export function classifyEra(source: ClassificationSource): Era | null {
  const { dateStart, dateEnd } = source;

  if (dateStart !== null || dateEnd !== null) {
    const start = dateStart ?? dateEnd ?? 0;
    const end = dateEnd ?? dateStart ?? 0;
    const midpoint = (start + end) / 2;

    for (const era of ERAS) {
      const range = ERA_RANGES[era];
      if (midpoint >= range.start && midpoint < range.end) return era;
    }
    // Dates beyond the table still resolve to the nearest end of it.
    return midpoint >= ERA_RANGES.contemporary.start ? 'contemporary' : 'ancient';
  }

  const text =
    `${source.period ?? ''} ${source.culture ?? ''} ${source.classification ?? ''}`.toLowerCase();
  const textual: Array<[RegExp, Era]> = [
    [/contemporary|21st century/, 'contemporary'],
    [/modern|20th century|bauhaus|art deco/, 'modern'],
    [/19th century|victorian|impressionis/, '19th-century'],
    [/18th century|rococo|georgian/, '18th-century'],
    [/baroque|17th century/, 'baroque'],
    [/renaissance|16th century|15th century/, 'renaissance'],
    [/medieval|byzantine|gothic|romanesque/, 'medieval'],
    [/ancient|classical|egypt|roman|greek|assyrian|dynasty/, 'ancient'],
  ];

  for (const [pattern, era] of textual) {
    if (pattern.test(text)) return era;
  }

  return null;
}

/**
 * Which experiences an artwork plausibly affords.
 *
 * Derived from the other facets rather than from its own keyword list, because
 * "educational" is a property of the record and its context, not a word that
 * appears on a museum label.
 */
function classifyExperiences(
  source: ClassificationSource,
  mediums: Medium[],
  era: Era | null,
  themes: Theme[],
  styles: Style[],
): Experience[] {
  const experiences = new Set<Experience>();

  if (source.description && source.description.length > 120) experiences.add('educational');
  if (era && HISTORICAL_ERAS.has(era)) experiences.add('historical');

  if (styles.includes('peaceful') || themes.includes('nature')) experiences.add('relaxing');
  if (styles.includes('dramatic') || themes.includes('religion')) experiences.add('emotional');
  if (themes.includes('politics') || themes.includes('abstraction'))
    experiences.add('thought-provoking');
  if (
    (era === 'contemporary' || era === 'modern') &&
    (themes.includes('abstraction') || mediums.includes('digital-art'))
  ) {
    experiences.add('experimental');
  }
  if (mediums.includes('digital-art')) experiences.add('interactive');
  if (styles.includes('colorful') || styles.includes('dramatic'))
    experiences.add('visually-impressive');

  return [...experiences];
}

/**
 * Derives the full facet set for one artwork.
 * Caps per dimension keep a single verbose record from matching everything.
 */
export function classifyArtwork(source: ClassificationSource): ArtworkFacets {
  const segments = buildSegments(source);

  const mediums = matchRules(MEDIUM_RULES, segments, SEGMENT_WEIGHTS.medium, 2);
  const themes = matchRules(THEME_RULES, segments, SEGMENT_WEIGHTS.theme, 3);
  const styles = matchRules(STYLE_RULES, segments, SEGMENT_WEIGHTS.style, 3);
  const era = classifyEra(source);
  const experiences = classifyExperiences(source, mediums, era, themes, styles);

  return {
    mediums,
    era,
    themes,
    styles,
    experiences,
    free: source.keywords
      .map((keyword) => keyword.toLowerCase().trim())
      .filter(Boolean)
      .slice(0, 8),
  };
}

/** Flattens facets into the prefixed tag list stored on `Artwork.tags`. */
export function facetsToTags(facets: ArtworkFacets): string[] {
  const tags = [
    ...facets.mediums.map((key) => buildFacetTag('medium', key)),
    ...facets.themes.map((key) => buildFacetTag('theme', key)),
    ...facets.styles.map((key) => buildFacetTag('style', key)),
    ...facets.experiences.map((key) => buildFacetTag('experience', key)),
    ...facets.free,
  ];

  if (facets.era) tags.push(buildFacetTag('era', facets.era));

  return [...new Set(tags)];
}

export type { ClassificationSource, Segment };
