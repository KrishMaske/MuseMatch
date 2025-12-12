import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useRecommendations } from '@/api/recommendations';
import { useProfile } from '@/api/profile';
import { ArtworkGrid } from '@/components/artwork';
import { EmptyState, ErrorState, PageLoading } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { CollectionChooser } from '@/components/ArtworkChoosers';
import type { Artwork } from '@musematch/shared';
import { useState } from 'react';

export function HomePage() {
  const profile = useProfile();
  const feed = useRecommendations({ limit: 16 });
  const [save, setSave] = useState<Artwork | null>(null);
  if (feed.isLoading) return <PageLoading />;
  return (
    <div className="container py-10 sm:py-14">
      <section className="mb-12 flex flex-col justify-between gap-6 border-b pb-10 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Selected for you</p>
          <h1 className="mt-3 text-4xl sm:text-5xl">
            {profile.data?.displayName
              ? `${profile.data.displayName}’s gallery`
              : 'Your personal gallery'}
          </h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Each match blends what you told us with what you explore. Your actions refine the next
            visit.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/discover">
            Browse all art <ArrowRight />
          </Link>
        </Button>
      </section>
      {feed.isError ? (
        <ErrorState error={feed.error} retry={() => void feed.refetch()} />
      ) : feed.data?.length ? (
        <ArtworkGrid
          artworks={feed.data.map((r) => r.artwork)}
          recommendations={feed.data}
          onSave={setSave}
        />
      ) : (
        <EmptyState
          title="Your gallery is being hung"
          message="Browse the collection to give MuseMatch more works to learn from."
          action={
            <Button asChild>
              <Link to="/discover">Start exploring</Link>
            </Button>
          }
        />
      )}
      {save ? (
        <CollectionChooser
          artwork={save}
          open
          onOpenChange={(open) => {
            if (!open) setSave(null);
          }}
        />
      ) : null}
    </div>
  );
}
