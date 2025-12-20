import { Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  useCollection,
  useCollections,
  useCreateCollection,
  useDeleteCollection,
  useRemoveFromCollection,
  useUpdateCollection,
} from '@/api/collections';
import { ArtworkGrid } from '@/components/artwork';
import { EmptyState, ErrorState, PageLoading } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, Input, Label, Textarea } from '@/components/ui/primitives';
import { toast } from '@/stores/toastStore';

export function CollectionsPage() {
  const data = useCollections();
  const create = useCreateCollection();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      { name, description: description || null },
      {
        onSuccess: () => {
          setOpen(false);
          setName('');
          setDescription('');
          toast.success('Collection created');
        },
        onError: (e) =>
          toast.error('Could not create collection', e instanceof Error ? e.message : undefined),
      },
    );
  };
  return (
    <div className="container py-10">
      <div className="mb-10 flex items-end justify-between">
        <div>
          <p className="eyebrow">Saved with intention</p>
          <h1 className="mt-3 text-4xl sm:text-5xl">Collections</h1>
        </div>
        <Button onClick={() => setOpen(!open)}>
          <Plus />
          New collection
        </Button>
      </div>
      {open ? (
        <form
          onSubmit={submit}
          className="mb-8 grid gap-4 rounded-lg border bg-card p-6 sm:grid-cols-[1fr_2fr_auto]"
        >
          <div>
            <Label htmlFor="collection-name">Name</Label>
            <Input
              id="collection-name"
              className="mt-2"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="collection-description">Description</Label>
            <Input
              id="collection-description"
              className="mt-2"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <Button className="self-end" type="submit" disabled={create.isPending}>
            Create
          </Button>
        </form>
      ) : null}
      {data.isLoading ? (
        <PageLoading />
      ) : data.isError ? (
        <ErrorState error={data.error} retry={() => void data.refetch()} />
      ) : data.data?.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data.data.map((c) => (
            <Link key={c.id} to={`/collections/${c.id}`}>
              <Card className="h-full overflow-hidden transition hover:shadow-lift">
                <div className="grid aspect-[2/1] grid-cols-3 bg-secondary">
                  {c.previewImageUrls.slice(0, 3).map((url, i) => (
                    <img key={url + i} src={url} alt="" className="h-full w-full object-cover" />
                  ))}
                  {!c.previewImageUrls.length ? (
                    <div className="col-span-3 flex items-center justify-center text-sm text-muted-foreground">
                      Your gallery awaits
                    </div>
                  ) : null}
                </div>
                <CardHeader>
                  <CardTitle>{c.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {c.itemCount} {c.itemCount === 1 ? 'work' : 'works'}
                  </p>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Begin your first collection"
          message="Save works that speak to each other—a color, an era, or simply a feeling."
          action={<Button onClick={() => setOpen(true)}>Create collection</Button>}
        />
      )}
    </div>
  );
}

export function CollectionDetailPage() {
  const { id = '' } = useParams();
  const data = useCollection(id);
  const update = useUpdateCollection(id);
  const remove = useRemoveFromCollection();
  const del = useDeleteCollection();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  if (data.isLoading) return <PageLoading />;
  if (data.isError || !data.data)
    return (
      <main className="container py-16">
        <ErrorState error={data.error} retry={() => void data.refetch()} />
      </main>
    );
  const collection = data.data;
  const begin = () => {
    setName(collection.name);
    setDescription(collection.description ?? '');
    setEditing(true);
  };
  const save = () =>
    update.mutate(
      { name, description: description || null },
      {
        onSuccess: () => {
          setEditing(false);
          toast.success('Collection updated');
        },
      },
    );
  const destroy = () => {
    if (window.confirm(`Delete “${collection.name}”? This cannot be undone.`))
      del.mutate(id, { onSuccess: () => navigate('/collections') });
  };
  return (
    <div className="container py-10">
      <div className="mb-10 flex flex-col justify-between gap-5 border-b pb-8 sm:flex-row sm:items-end">
        <div>
          {editing ? (
            <div className="grid gap-3">
              <Input
                aria-label="Collection name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Textarea
                aria-label="Collection description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          ) : (
            <>
              <p className="eyebrow">Collection</p>
              <h1 className="mt-3 text-4xl sm:text-5xl">{collection.name}</h1>
              {collection.description ? (
                <p className="mt-3 text-muted-foreground">{collection.description}</p>
              ) : null}
            </>
          )}
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button onClick={save} disabled={!name.trim() || update.isPending}>
                Save
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={begin}>
              Edit
            </Button>
          )}
          <Button variant="ghost" className="text-destructive" onClick={destroy}>
            <Trash2 />
            Delete
          </Button>
        </div>
      </div>
      {collection.items.length ? (
        <>
          <ArtworkGrid artworks={collection.items.map((i) => i.artwork)} />
          <div className="mt-10">
            <h2 className="mb-4 text-xl">Manage items</h2>
            <div className="divide-y rounded-lg border">
              {collection.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 p-3">
                  <span className="truncate text-sm">{item.artwork.title}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      remove.mutate(
                        { collectionId: id, artworkId: item.artwork.id },
                        { onSuccess: () => toast.success('Removed from collection') },
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <EmptyState
          title="This collection is empty"
          message="Save an artwork from Home, Discover, or an artwork detail page."
          action={
            <Button asChild>
              <Link to="/discover">Discover art</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
