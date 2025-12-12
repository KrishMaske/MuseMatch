import { Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Artwork, ArtworkSearchParams, MuseumSource } from '@musematch/shared';
import { MEDIUM_LABELS, THEME_LABELS } from '@musematch/shared';
import { useArtworkSearch } from '@/api/artworks';
import { ArtworkGrid } from '@/components/artwork';
import { CollectionChooser } from '@/components/ArtworkChoosers';
import { EmptyState, ErrorState, PageLoading } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/primitives';

export function DiscoverPage() {
  const [url, setUrl] = useSearchParams();
  const [draft, setDraft] = useState(url.get('q') ?? '');
  const [save, setSave] = useState<Artwork | null>(null);
  useEffect(() => {
    setDraft(url.get('q') ?? '');
  }, [url]);
  const page = Number(url.get('page') ?? 1);
  const params: ArtworkSearchParams = {
    q: url.get('q') || undefined,
    museum: (url.get('museum') as MuseumSource) || undefined,
    medium: url.get('medium') || undefined,
    theme: url.get('theme') || undefined,
    sort: (url.get('sort') as ArtworkSearchParams['sort']) || undefined,
    semantic: url.get('mode') === 'semantic',
    page,
    limit: 20,
  };
  const results = useArtworkSearch(params);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(url);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setUrl(next);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    update('q', draft.trim());
  };
  return (
    <div className="container py-10">
      <div className="mb-8">
        <p className="eyebrow">Two museums, one search</p>
        <h1 className="mt-3 text-4xl sm:text-5xl">Discover</h1>
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <Label className="sr-only" htmlFor="art-search">
          Search artworks
        </Label>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input
            id="art-search"
            className="pl-10"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Try ‘stormy landscapes’ or an artist…"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>
      <div className="my-6 flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <SlidersHorizontal className="mb-2 size-4 text-muted-foreground" />
        <Filter
          label="Museum"
          value={url.get('museum') ?? ''}
          onChange={(v) => update('museum', v)}
          options={[
            ['', 'All museums'],
            ['MET', 'The Met'],
            ['AIC', 'Art Institute'],
          ]}
        />
        <Filter
          label="Medium"
          value={url.get('medium') ?? ''}
          onChange={(v) => update('medium', v)}
          options={[['', 'All media'], ...Object.entries(MEDIUM_LABELS)]}
        />
        <Filter
          label="Theme"
          value={url.get('theme') ?? ''}
          onChange={(v) => update('theme', v)}
          options={[['', 'All themes'], ...Object.entries(THEME_LABELS)]}
        />
        <Filter
          label="Sort"
          value={url.get('sort') ?? ''}
          onChange={(v) => update('sort', v)}
          options={[
            ['', 'Recommended'],
            ['oldest', 'Oldest'],
            ['newest', 'Newest'],
          ]}
        />
        {params.q ? (
          <Filter
            label="Search mode"
            value={url.get('mode') ?? 'keyword'}
            onChange={(v) => update('mode', v)}
            options={[
              ['keyword', 'Keyword'],
              ['semantic', 'Meaning-based'],
            ]}
          />
        ) : null}
        <Button variant="ghost" size="sm" onClick={() => setUrl({})}>
          Clear
        </Button>
      </div>
      {results.data?.unavailableMuseums.length ? (
        <p className="mb-6 rounded-md bg-secondary p-3 text-sm" role="status">
          Some results are unavailable from {results.data.unavailableMuseums.join(' and ')}. Showing
          everything we could retrieve.
        </p>
      ) : null}
      {results.isLoading ? (
        <PageLoading label="Searching museum collections" />
      ) : results.isError ? (
        <ErrorState error={results.error} retry={() => void results.refetch()} />
      ) : results.data?.artworks.length ? (
        <>
          <p className="mb-5 text-sm text-muted-foreground">
            {results.data.pagination.total.toLocaleString()} results
          </p>
          <ArtworkGrid
            artworks={results.data.artworks}
            recommendations={results.data.recommendations}
            onSave={setSave}
          />
          <div className="mt-12 flex items-center justify-center gap-3">
            <Button
              variant="outline"
              disabled={page <= 1}
              onClick={() => update('page', String(page - 1))}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page}</span>
            <Button
              variant="outline"
              disabled={!results.data.pagination.hasMore}
              onClick={() => update('page', String(page + 1))}
            >
              Next
            </Button>
          </div>
        </>
      ) : (
        <EmptyState
          title={params.q ? 'No works matched that search' : 'No cached works yet'}
          message={
            params.q
              ? 'Try fewer words, another museum, or switch search modes.'
              : 'Search for an artist or subject to bring museum works into your local gallery.'
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
function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[][];
}) {
  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <select
        className="h-9 rounded-md border bg-background px-3 text-sm text-foreground"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
