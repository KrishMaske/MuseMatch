import {
  MUSEUM_NAMES,
  parseArtworkFacets,
  type Artwork,
  type MuseumSource,
} from '@musematch/shared';
import { classifyArtwork, facetsToTags } from './taxonomy.js';

/**
 * The last step of every provider mapping.
 *
 * Providers extract their own fields; this function applies the rules that must
 * hold for every artwork regardless of source: empty strings become null, no
 * value is ever invented, and facets/tags are derived exactly one way.
 */

export interface NormalizeInput {
  source: MuseumSource;
  externalId: string;
  title: string | null | undefined;
  artist?: string | null;
  artistDisplay?: string | null;
  year?: string | null;
  dateStart?: number | null;
  dateEnd?: number | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  medium?: string | null;
  department?: string | null;
  classification?: string | null;
  culture?: string | null;
  period?: string | null;
  description?: string | null;
  objectUrl?: string | null;
  /** Provider-specific extras kept verbatim for the detail page. */
  metadata?: Record<string, unknown>;
  /** Free-text hints for the classifier, e.g. Met tag terms, AIC style titles. */
  keywords?: string[];
}

/** Empty, whitespace-only and placeholder values all collapse to null. */
function clean(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(unknown|n\/a|none|undetermined)$/i.test(trimmed)) return null;
  return trimmed;
}

function cleanNumber(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return null;
  return Math.trunc(value);
}

/** Strips the HTML the AIC returns inside its `description` field. */
export function stripHtml(value: string | null | undefined): string | null {
  const text = clean(value);
  if (!text) return null;
  return clean(
    text
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' '),
  );
}

export function normalizeArtwork(input: NormalizeInput): Artwork {
  const title = clean(input.title) ?? 'Untitled';
  const artist = clean(input.artist);
  const medium = clean(input.medium);
  const classification = clean(input.classification);
  const department = clean(input.department);
  const culture = clean(input.culture);
  const period = clean(input.period);
  // Stripped here rather than per-provider: any museum that starts returning
  // markup gets cleaned without a second place needing to remember.
  const description = stripHtml(input.description);
  const dateStart = cleanNumber(input.dateStart);
  const dateEnd = cleanNumber(input.dateEnd);

  const facets = classifyArtwork({
    title,
    artist,
    medium,
    classification,
    department,
    culture,
    period,
    description,
    dateStart,
    dateEnd,
    keywords: (input.keywords ?? []).map((keyword) => keyword.trim()).filter(Boolean),
  });

  return {
    // Filled in once the artwork is persisted; provider results carry the
    // composite key until then so the client always has something stable.
    id: `${input.source}:${input.externalId}`,
    source: input.source,
    externalId: String(input.externalId),
    museumName: MUSEUM_NAMES[input.source],

    title,
    artist,
    artistDisplay: clean(input.artistDisplay) ?? artist,

    year: clean(input.year),
    dateStart,
    dateEnd,

    imageUrl: clean(input.imageUrl),
    thumbnailUrl: clean(input.thumbnailUrl) ?? clean(input.imageUrl),

    medium,
    department,
    classification,
    culture,
    period,

    description,
    objectUrl: clean(input.objectUrl),

    tags: facetsToTags(facets),
    metadata: input.metadata ?? {},
  };
}

/**
 * Re-derives an artwork's facet tags from its stored fields.
 *
 * Used after a change to the classifier, so cached and fixture artworks pick
 * up the new rules without being re-fetched from the museum. The free-text
 * keywords survive the round trip because they are stored unprefixed in
 * `tags` and read back out here.
 */
export function reclassifyArtwork(artwork: Artwork): Artwork {
  const previous = parseArtworkFacets(artwork.tags);

  const facets = classifyArtwork({
    title: artwork.title,
    artist: artwork.artist,
    medium: artwork.medium,
    classification: artwork.classification,
    department: artwork.department,
    culture: artwork.culture,
    period: artwork.period,
    description: artwork.description,
    dateStart: artwork.dateStart,
    dateEnd: artwork.dateEnd,
    keywords: previous.free,
  });

  return { ...artwork, tags: facetsToTags(facets) };
}
