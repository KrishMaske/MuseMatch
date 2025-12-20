import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, Clock, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  MUSEUM_NAMES,
  VISIT_DURATION_PRESETS,
  toMatchPercent,
  type MuseumSource,
  type VisitDetail,
  type VisitItem,
} from '@musematch/shared';
import {
  useCreateVisit,
  useDeleteVisit,
  useGenerateVisit,
  useRemoveFromVisit,
  useReorderVisit,
  useUpdateVisit,
  useVisit,
  useVisits,
} from '@/api/visits';
import { ArtworkImage, MatchBadge } from '@/components/artwork';
import { EmptyState, ErrorState, PageLoading } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, Input, Label } from '@/components/ui/primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/stores/toastStore';

export function VisitsPage() {
  const data = useVisits();
  return (
    <div className="container py-10">
      <div className="mb-10 flex items-end justify-between">
        <div>
          <p className="eyebrow">Make time for wonder</p>
          <h1 className="mt-3 text-4xl sm:text-5xl">Visits</h1>
        </div>
        <Button asChild>
          <Link to="/visits/new">
            <Plus />
            Plan a visit
          </Link>
        </Button>
      </div>
      {data.isLoading ? (
        <PageLoading />
      ) : data.isError ? (
        <ErrorState error={data.error} retry={() => void data.refetch()} />
      ) : data.data?.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data.data.map((v) => (
            <Link key={v.id} to={`/visits/${v.id}`}>
              <Card className="h-full transition hover:shadow-lift">
                <CardHeader>
                  <p className="eyebrow">{v.museumName}</p>
                  <CardTitle>{v.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="size-4" />
                    {v.totalMinutes}/{v.availableMinutes} min
                  </span>
                  <span>{v.itemCount} stops</span>
                  {v.visitDate ? (
                    <span className="flex items-center gap-1">
                      <Calendar className="size-4" />
                      {new Date(v.visitDate).toLocaleDateString()}
                    </span>
                  ) : null}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Plan a museum day"
          message="Choose a museum and time budget. MuseMatch will arrange a personalized route that fits."
          action={
            <Button asChild>
              <Link to="/visits/new">Plan your first visit</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}

export function NewVisitPage() {
  const create = useCreateVisit();
  const navigate = useNavigate();
  const [name, setName] = useState('My museum visit');
  const [museum, setMuseum] = useState<MuseumSource>('MET');
  const [minutes, setMinutes] = useState(120);
  const [date, setDate] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      { name, museum, availableMinutes: minutes, visitDate: date || null },
      { onSuccess: (v) => navigate(`/visits/${v.id}`) },
    );
  };
  return (
    <div className="container max-w-2xl py-12">
      <p className="eyebrow">New itinerary</p>
      <h1 className="mt-3 text-4xl">Plan a visit</h1>
      <form onSubmit={submit} className="mt-10 grid gap-6 rounded-lg border bg-card p-6">
        <div>
          <Label htmlFor="visit-name">Visit name</Label>
          <Input
            id="visit-name"
            className="mt-2"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="museum">Museum</Label>
          <select
            id="museum"
            className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={museum}
            onChange={(e) => setMuseum(e.target.value as MuseumSource)}
          >
            {Object.entries(MUSEUM_NAMES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Time budget</Label>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {VISIT_DURATION_PRESETS.map((p) => (
              <Button
                key={p.minutes}
                type="button"
                variant={minutes === p.minutes ? 'default' : 'outline'}
                onClick={() => setMinutes(p.minutes)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Your generated itinerary will not exceed this viewing-time budget.
          </p>
        </div>
        <div>
          <Label htmlFor="visit-date">Date (optional)</Label>
          <Input
            id="visit-date"
            className="mt-2"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        {create.error ? <p className="text-sm text-destructive">{create.error.message}</p> : null}
        <Button size="lg" type="submit" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create visit'}
        </Button>
      </form>
    </div>
  );
}

function SortableItem({ item, onRemove }: { item: VisitItem; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: item.artwork.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-3 border-b bg-card p-3 last:border-0"
    >
      <button
        className="cursor-grab touch-none p-2 text-muted-foreground"
        aria-label={`Move ${item.artwork.title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical />
      </button>
      <ArtworkImage artwork={item.artwork} className="size-16 shrink-0 rounded object-cover" />
      <div className="min-w-0 flex-1">
        <Link className="font-medium hover:text-primary" to={`/artworks/${item.artwork.id}`}>
          {item.artwork.title}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {item.artwork.department ?? 'Museum gallery'} · {item.estimatedMinutes} min
        </p>
        {item.recommendationScore > 0 ? (
          <div className="mt-1">
            <MatchBadge percent={toMatchPercent(item.recommendationScore)} />
          </div>
        ) : null}
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        aria-label={`Remove ${item.artwork.title}`}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

function VisitEditor({ visit }: { visit: VisitDetail }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(visit.name);
  const [museum, setMuseum] = useState<MuseumSource>(visit.museum);
  const [minutes, setMinutes] = useState(visit.availableMinutes);
  const [date, setDate] = useState(visit.visitDate?.slice(0, 10) ?? '');
  const update = useUpdateVisit(visit.id);
  const save = (e: FormEvent) => {
    e.preventDefault();
    update.mutate(
      { name, museum, availableMinutes: minutes, visitDate: date || null },
      {
        onSuccess: () => {
          toast.success('Visit updated');
          setOpen(false);
        },
      },
    );
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Edit visit
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit visit</DialogTitle>
          <DialogDescription>
            Change the title, date, museum, or viewing-time budget. A museum can only change while
            the itinerary is empty.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-4">
          <div>
            <Label htmlFor="edit-visit-name">Name</Label>
            <Input
              id="edit-visit-name"
              className="mt-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="edit-visit-museum">Museum</Label>
            <select
              id="edit-visit-museum"
              className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={museum}
              onChange={(e) => setMuseum(e.target.value as MuseumSource)}
              disabled={visit.itemCount > 0}
            >
              {Object.entries(MUSEUM_NAMES).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="edit-visit-minutes">Budget in minutes</Label>
            <Input
              id="edit-visit-minutes"
              className="mt-2"
              type="number"
              min={30}
              max={600}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="edit-visit-date">Date</Label>
            <Input
              id="edit-visit-date"
              className="mt-2"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          {update.error ? <p className="text-sm text-destructive">{update.error.message}</p> : null}
          <Button type="submit" disabled={update.isPending || !name.trim()}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function VisitDetailPage() {
  const { id = '' } = useParams();
  const data = useVisit(id);
  const generate = useGenerateVisit(id);
  const reorder = useReorderVisit(id);
  const remove = useRemoveFromVisit(id);
  const del = useDeleteVisit();
  const navigate = useNavigate();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  if (data.isLoading) return <PageLoading />;
  if (data.isError || !data.data)
    return (
      <main className="container py-16">
        <ErrorState error={data.error} retry={() => void data.refetch()} />
      </main>
    );
  const visit = data.data;
  const drag = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = visit.items.map((i) => i.artwork.id);
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over!.id)));
    reorder.mutate(next, { onError: (x) => toast.error('Could not reorder', x.message) });
  };
  const destroy = () => {
    if (confirm(`Delete “${visit.name}”?`))
      del.mutate(id, { onSuccess: () => navigate('/visits') });
  };
  return (
    <div className="container py-10">
      <div className="mb-8 flex flex-col justify-between gap-5 border-b pb-8 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">{visit.museumName}</p>
          <h1 className="mt-3 text-4xl">{visit.name}</h1>
          <p className="mt-2 text-muted-foreground">
            {visit.totalMinutes} of {visit.availableMinutes} minutes · {visit.itemCount} stops
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              generate.mutate(undefined, {
                onSuccess: () => toast.success('Itinerary generated'),
                onError: (e) => toast.error('Could not generate', e.message),
              })
            }
            disabled={generate.isPending}
          >
            {generate.isPending
              ? 'Planning…'
              : visit.generated
                ? 'Regenerate'
                : 'Generate itinerary'}
          </Button>
          <VisitEditor visit={visit} />
          <Button variant="ghost" className="text-destructive" onClick={destroy}>
            <Trash2 />
            Delete
          </Button>
        </div>
      </div>
      {visit.items.length ? (
        <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
          <div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={drag}>
              <SortableContext
                items={visit.items.map((i) => i.artwork.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="overflow-hidden rounded-lg border">
                  {visit.items.map((item) => (
                    <SortableItem
                      key={item.id}
                      item={item}
                      onRemove={() =>
                        remove.mutate(item.artwork.id, {
                          onSuccess: () => toast.success('Stop removed'),
                        })
                      }
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <p className="mt-3 text-xs text-muted-foreground">
              Drag with a pointer, or focus a handle and use Space plus arrow keys, to reorder
              stops.
            </p>
          </div>
          <aside className="rounded-lg bg-secondary p-5">
            <p className="eyebrow">Walking order</p>
            {visit.stops.map((s, i) => (
              <div key={`${s.department}-${i}`} className="mt-5">
                <p className="font-medium">
                  {i + 1}. {s.department}
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.items.length} works · {s.totalMinutes} min
                </p>
              </div>
            ))}
          </aside>
        </div>
      ) : (
        <EmptyState
          title="Your route is ready to be made"
          message="Generate a personalized itinerary within your time budget, or add compatible works from their detail pages."
          action={<Button onClick={() => generate.mutate()}>Generate itinerary</Button>}
        />
      )}
    </div>
  );
}
