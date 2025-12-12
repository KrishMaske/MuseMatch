import type { Artwork, Recommendation } from '@musematch/shared';
import { Heart, ImageOff, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useRecordInteraction } from '@/api/interactions';
import { cn } from '@/lib/utils';
import { toast } from '@/stores/toastStore';
import { Button } from './ui/button';
import { Badge } from './ui/primitives';

/**
 * The artwork card and its parts.
 *
 * This is the most-repeated component in the product, so two things matter
 * more here than anywhere else: it must survive a missing or broken image, and
 * its controls must be reachable by keyboard.
 */

/**
 * Describes the image for a screen reader.
 *
 * The AIC supplies real curatorial alt text; the Met does not, so the artist
 * and title are composed into something descriptive rather than leaving the
 * bare title. No detail is invented -- absent fields are simply omitted.
 */
function buildAltText(artwork: Artwork): string {
  const provided = artwork.metadata['altText'];
  if (typeof provided === 'string' && provided.trim()) return provided.trim();

  return artwork.artist ? `${artwork.title}, by ${artwork.artist}` : artwork.title;
}

export function ArtworkImage({
  artwork,
  className = '',
}: {
  artwork: Artwork;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = artwork.imageUrl ?? artwork.thumbnailUrl;

  // Museum image URLs go stale, so a broken one has to degrade into a real
  // placeholder rather than a torn layout.
  if (!src || failed) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-secondary text-muted-foreground',
          className,
        )}
      >
        <div className="text-center">
          <ImageOff className="mx-auto size-7" aria-hidden="true" />
          <span className="mt-2 block text-xs">Image unavailable</span>
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={buildAltText(artwork)}
      onError={() => setFailed(true)}
      loading="lazy"
      className={cn('bg-secondary object-cover', className)}
    />
  );
}

export function MatchBadge({ percent }: { percent: number }) {
  return <Badge variant="accent">{percent}% match</Badge>;
}

export function ArtworkActions({
  artwork,
  onSave,
  className,
}: {
  artwork: Artwork;
  onSave?: () => void;
  className?: string;
}) {
  const interaction = useRecordInteraction();

  const signal = (type: 'LIKE' | 'DISLIKE') =>
    interaction.mutate(
      { artworkId: artwork.id, type },
      {
        onSuccess: () =>
          toast.success(type === 'LIKE' ? 'Taste noted' : 'We’ll show fewer like this'),
        onError: () => toast.error('That did not save. Try again.'),
      },
    );

  return (
    <div className={cn('flex gap-1', className)}>
      <Button
        size="icon"
        variant="ghost"
        aria-label={`Like ${artwork.title}`}
        disabled={interaction.isPending}
        onClick={() => signal('LIKE')}
      >
        <ThumbsUp />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label={`Show fewer like ${artwork.title}`}
        disabled={interaction.isPending}
        onClick={() => signal('DISLIKE')}
      >
        <ThumbsDown />
      </Button>
      {onSave ? (
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Save ${artwork.title} to a collection`}
          onClick={onSave}
        >
          <Heart />
        </Button>
      ) : null}
    </div>
  );
}

export function ArtworkCard({
  artwork,
  recommendation,
  onSave,
}: {
  artwork: Artwork;
  recommendation?: Recommendation;
  onSave?: () => void;
}) {
  return (
    <article className="group relative animate-fade-up">
      <div className="overflow-hidden rounded-lg border bg-card shadow-frame transition group-hover:-translate-y-0.5 group-hover:shadow-lift">
        <div className="relative">
          <ArtworkImage
            artwork={artwork}
            className="aspect-[4/5] w-full transition duration-500 group-hover:scale-[1.02]"
          />
          {recommendation ? (
            <div className="absolute left-3 top-3">
              <MatchBadge percent={recommendation.matchPercent} />
            </div>
          ) : null}
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="line-clamp-2 text-lg">
                {/*
                  A stretched link: the anchor stays a normal element inside the
                  heading, so its accessible name is the artwork's title, while
                  the pseudo-element makes the whole card clickable. The buttons
                  below are siblings rather than descendants -- nesting them in
                  the anchor would be invalid HTML and unreachable by keyboard.
                */}
                <Link
                  to={`/artworks/${encodeURIComponent(artwork.id)}`}
                  className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                >
                  {artwork.title}
                </Link>
              </h3>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {artwork.artist ?? 'Unknown artist'}
                {artwork.year ? ` · ${artwork.year}` : ''}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{artwork.museumName}</p>
            </div>

            <ArtworkActions artwork={artwork} onSave={onSave} className="relative z-10" />
          </div>

          {recommendation?.reasons.length ? (
            <div className="mt-3 border-t pt-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {recommendation.reasons[0]}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function ArtworkGrid({
  artworks,
  recommendations,
  onSave,
}: {
  artworks: Artwork[];
  recommendations?: Recommendation[];
  onSave?: (artwork: Artwork) => void;
}) {
  const byId = new Map(recommendations?.map((item) => [item.artwork.id, item]));

  return (
    <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {artworks.map((artwork) => (
        <ArtworkCard
          key={artwork.id}
          artwork={artwork}
          recommendation={byId.get(artwork.id)}
          onSave={onSave ? () => onSave(artwork) : undefined}
        />
      ))}
    </div>
  );
}
