import * as ToastPrimitive from '@radix-ui/react-toast';
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToastStore, type ToastTone } from '@/stores/toastStore';

const TONE_ICON: Record<ToastTone, typeof Info> = {
  default: Info,
  success: CheckCircle2,
  error: CircleAlert,
};

const TONE_CLASS: Record<ToastTone, string> = {
  default: 'text-muted-foreground',
  success: 'text-primary',
  error: 'text-destructive',
};

/**
 * Renders the toast queue.
 *
 * Radix's provider announces each toast politely to screen readers, so a
 * confirmation is not visual-only.
 */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={4000}>
      {toasts.map((item) => {
        const Icon = TONE_ICON[item.tone];

        return (
          <ToastPrimitive.Root
            key={item.id}
            open
            onOpenChange={(open) => {
              if (!open) dismiss(item.id);
            }}
            className={cn(
              'flex items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-lift',
              'data-[state=open]:animate-in data-[state=open]:slide-in-from-right-4',
              'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
            )}
          >
            <Icon
              className={cn('mt-0.5 size-4 shrink-0', TONE_CLASS[item.tone])}
              aria-hidden="true"
            />
            <div className="flex-1">
              <ToastPrimitive.Title className="text-sm font-medium">
                {item.title}
              </ToastPrimitive.Title>
              {item.description ? (
                <ToastPrimitive.Description className="mt-0.5 text-sm text-muted-foreground">
                  {item.description}
                </ToastPrimitive.Description>
              ) : null}
            </div>
            <ToastPrimitive.Close
              className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Dismiss notification"
            >
              <X className="size-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}

      <ToastPrimitive.Viewport
        className={cn(
          'fixed bottom-0 right-0 z-[60] flex w-full max-w-sm flex-col gap-2 p-4 outline-none',
          'sm:bottom-4 sm:right-4 sm:p-0',
        )}
      />
    </ToastPrimitive.Provider>
  );
}
