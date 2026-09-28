/**
 * A toast from outside React: a helper in `lib/` that has news but no hook.
 *
 * `ToastProvider` (mounted once, in `app/_layout.tsx`) registers its
 * `showToast` here. Before it mounts — or in a test that renders none — a
 * toast is logged and dropped rather than thrown, because news nobody can see
 * is not worth crashing the flow that produced it.
 */
export type ToastVariant = 'success' | 'error' | 'info'

type Handler = (message: string, variant?: ToastVariant) => void

let handler: Handler | null = null

/** For `ToastProvider` only. Returns the unregister. */
export function setToastHandler(next: Handler): () => void {
  handler = next
  return () => {
    if (handler === next) handler = null
  }
}

export function toast(message: string, variant: ToastVariant = 'info'): void {
  handler?.(message, variant)
}
