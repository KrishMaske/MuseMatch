import type { ReactNode } from 'react';
import { AlertCircle, Inbox } from 'lucide-react';
import { Button } from './ui/button';
import { Skeleton } from './ui/primitives';

export function PageLoading({ label = 'Loading your museum…' }: { label?: string }) {
  return (
    <div className="container py-16" role="status">
      <p className="sr-only">{label}</p>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i}>
            <Skeleton className="aspect-[4/5]" />
            <Skeleton className="mt-3 h-5 w-2/3" />
            <Skeleton className="mt-2 h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed bg-card px-6 py-16 text-center">
      <Inbox className="mx-auto mb-4 size-7 text-muted-foreground" />
      <h2 className="text-2xl">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{message}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div
      className="rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center"
      role="alert"
    >
      <AlertCircle className="mx-auto mb-3 size-6 text-destructive" />
      <h2 className="text-xl">This gallery did not load</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
        {error instanceof Error ? error.message : 'Please try again.'}
      </p>
      {retry ? (
        <Button className="mt-5" variant="outline" onClick={retry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
