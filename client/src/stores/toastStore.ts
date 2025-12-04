import { create } from 'zustand';

/**
 * Transient UI notifications.
 *
 * A genuine case for Zustand: this is client-only state with no server
 * counterpart, and it is written from anywhere (a mutation's onError, a
 * keyboard shortcut) while being rendered in exactly one place. Server data
 * stays in TanStack Query.
 */

export type ToastTone = 'default' | 'success' | 'error';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id' | 'tone'> & { tone?: ToastTone }) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: ({ tone = 'default', ...toast }) =>
    set((state) => ({
      toasts: [...state.toasts, { ...toast, tone, id: crypto.randomUUID() }].slice(-3),
    })),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

/** Convenience wrapper so call sites read as `toast.success(...)`. */
export const toast = {
  show: (title: string, description?: string) =>
    useToastStore.getState().push({ title, ...(description ? { description } : {}) }),
  success: (title: string, description?: string) =>
    useToastStore
      .getState()
      .push({ title, tone: 'success', ...(description ? { description } : {}) }),
  error: (title: string, description?: string) =>
    useToastStore
      .getState()
      .push({ title, tone: 'error', ...(description ? { description } : {}) }),
};
