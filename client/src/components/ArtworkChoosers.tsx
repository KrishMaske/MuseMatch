import type { Artwork } from '@musematch/shared';
import { useState } from 'react';
import { useAddToCollection, useCollections, useCreateCollection } from '@/api/collections';
import { useRecordInteraction } from '@/api/interactions';
import { useAddToVisit, useVisits } from '@/api/visits';
import { ApiError } from '@/api/client';
import { toast } from '@/stores/toastStore';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Input, Label } from './ui/primitives';

export function CollectionChooser({
  artwork,
  open,
  onOpenChange,
}: {
  artwork: Artwork;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const collections = useCollections();
  const create = useCreateCollection();
  const add = useAddToCollection();
  const interaction = useRecordInteraction();
  const [name, setName] = useState('');
  const choose = (collectionId: string) =>
    add.mutate(
      { collectionId, artworkId: artwork.id },
      {
        onSuccess: () => {
          interaction.mutate({ artworkId: artwork.id, type: 'SAVE' });
          toast.success('Saved to collection');
          onOpenChange(false);
        },
        onError: (e) =>
          toast.error(
            e instanceof ApiError && e.code === 'CONFLICT'
              ? 'Already in that collection'
              : 'Could not save',
            e instanceof Error ? e.message : undefined,
          ),
      },
    );
  const createAndAdd = () =>
    create.mutate(
      { name },
      {
        onSuccess: (c) => choose(c.id),
        onError: (e) =>
          toast.error('Could not create collection', e instanceof Error ? e.message : undefined),
      },
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save “{artwork.title}”</DialogTitle>
          <DialogDescription>
            Choose a collection, or make one without leaving this artwork.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-56 gap-2 overflow-auto">
          {collections.data?.map((c) => (
            <Button
              key={c.id}
              variant="outline"
              className="justify-between"
              onClick={() => choose(c.id)}
              disabled={add.isPending}
            >
              <span>{c.name}</span>
              <span className="text-muted-foreground">{c.itemCount}</span>
            </Button>
          ))}
          {collections.isSuccess && !collections.data.length ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No collections yet.</p>
          ) : null}
        </div>
        <div className="mt-5 border-t pt-5">
          <Label htmlFor="new-collection">New collection</Label>
          <div className="mt-2 flex gap-2">
            <Input
              id="new-collection"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Weekend favorites"
            />
            <Button onClick={createAndAdd} disabled={!name.trim() || create.isPending}>
              Create & save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function VisitChooser({
  artwork,
  open,
  onOpenChange,
}: {
  artwork: Artwork;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const visits = useVisits();
  const add = useAddToVisit();
  const interaction = useRecordInteraction();
  const compatible = visits.data?.filter((v) => v.museum === artwork.source) ?? [];
  const choose = (visitId: string) =>
    add.mutate(
      { visitId, artworkId: artwork.id },
      {
        onSuccess: () => {
          interaction.mutate({ artworkId: artwork.id, type: 'ADD_TO_VISIT' });
          toast.success('Added to visit');
          onOpenChange(false);
        },
        onError: (e) =>
          toast.error(
            e instanceof ApiError && e.code === 'CONFLICT'
              ? 'Already in that visit'
              : 'Could not add to visit',
            e instanceof Error ? e.message : undefined,
          ),
      },
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to a visit</DialogTitle>
          <DialogDescription>Only plans for {artwork.museumName} are compatible.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {compatible.map((v) => (
            <Button
              key={v.id}
              variant="outline"
              className="justify-between"
              onClick={() => choose(v.id)}
              disabled={add.isPending}
            >
              <span>{v.name}</span>
              <span className="text-muted-foreground">{v.availableMinutes} min</span>
            </Button>
          ))}
          {visits.isSuccess && !compatible.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              You do not have a visit for this museum yet. Create one from Visits.
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
