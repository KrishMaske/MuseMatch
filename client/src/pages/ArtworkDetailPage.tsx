import { ExternalLink, Heart, MapPinned } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useArtwork, useSimilarArtworks } from '@/api/artworks';
import { trackView } from '@/api/interactions';
import { ArtworkActions, ArtworkGrid, ArtworkImage, MatchBadge } from '@/components/artwork';
import { CollectionChooser, VisitChooser } from '@/components/ArtworkChoosers';
import { ErrorState, PageLoading } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/primitives';

export function ArtworkDetailPage() {
  const { id } = useParams();
  const detail = useArtwork(id);
  const similar = useSimilarArtworks(id);
  const [collection, setCollection] = useState(false);
  const [visit, setVisit] = useState(false);
  useEffect(() => {
    if (detail.data?.artwork.id) trackView(detail.data.artwork.id, 'artwork-detail');
  }, [detail.data?.artwork.id]);
  if (detail.isLoading) return <PageLoading />;
  if (detail.isError || !detail.data)
    return (
      <main className="container py-16">
        <ErrorState error={detail.error} retry={() => void detail.refetch()} />
      </main>
    );
  const { artwork, match, savedInCollectionIds } = detail.data;
  const metadata = [
    ['Artist', artwork.artistDisplay ?? artwork.artist],
    ['Date', artwork.year],
    ['Medium', artwork.medium],
    ['Culture', artwork.culture],
    ['Period', artwork.period],
    ['Department', artwork.department],
    ['Classification', artwork.classification],
  ].filter((x): x is [string, string] => Boolean(x[1]));
  return (
    <div className="container py-10">
      <div className="grid gap-10 lg:grid-cols-[1.15fr_.85fr]">
        <ArtworkImage
          artwork={artwork}
          className="max-h-[78vh] w-full rounded-lg object-contain shadow-frame"
        />
        <section>
          <div className="flex flex-wrap gap-2">
            <Badge>{artwork.museumName}</Badge>
            <MatchBadge percent={match.matchPercent} />
            {savedInCollectionIds.length ? <Badge variant="accent">Saved</Badge> : null}
          </div>
          <h1 className="mt-5 text-balance text-4xl sm:text-5xl">{artwork.title}</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            {artwork.artist ?? 'Unknown artist'}
            {artwork.year ? ` · ${artwork.year}` : ''}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={() => setCollection(true)}>
              <Heart />
              Save
            </Button>
            <Button variant="outline" onClick={() => setVisit(true)}>
              <MapPinned />
              Add to visit
            </Button>
            <ArtworkActions artwork={artwork} />
          </div>
          <div className="mt-8 rounded-lg bg-secondary p-5">
            <p className="eyebrow">Why it matches</p>
            <ul className="mt-3 grid gap-2 text-sm">
              {match.reasons.map((r) => (
                <li key={r}>— {r}</li>
              ))}
            </ul>
          </div>
          {artwork.description ? (
            <p className="mt-8 leading-relaxed text-muted-foreground">{artwork.description}</p>
          ) : null}
          <dl className="mt-8 divide-y border-y">
            {metadata.map(([label, value]) => (
              <div key={label} className="grid grid-cols-3 gap-4 py-3 text-sm">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="col-span-2">{value}</dd>
              </div>
            ))}
          </dl>
          {artwork.objectUrl ? (
            <Button asChild variant="link" className="mt-5 px-0">
              <a href={artwork.objectUrl} target="_blank" rel="noreferrer">
                View at {artwork.museumName}
                <ExternalLink />
              </a>
            </Button>
          ) : null}
        </section>
      </div>
      <section className="mt-20 border-t pt-12">
        <p className="eyebrow">Continue looking</p>
        <h2 className="mb-8 mt-2 text-3xl">Similar works</h2>
        {similar.data?.length ? (
          <ArtworkGrid artworks={similar.data} />
        ) : similar.isLoading ? (
          <PageLoading label="Loading similar art" />
        ) : (
          <p className="text-muted-foreground">No similar works are cached yet.</p>
        )}
      </section>
      <CollectionChooser artwork={artwork} open={collection} onOpenChange={setCollection} />
      <VisitChooser artwork={artwork} open={visit} onOpenChange={setVisit} />
    </div>
  );
}
