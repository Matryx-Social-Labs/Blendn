import { LoadError } from '../LoadError'

/**
 * The thread did not load — said as that, with a way to try again.
 *
 * Both chat screens used to fall through to their empty state when history
 * failed to load, so a network error read "Start the conversation! Say hi" over
 * a thread that might hold a month of messages — an invitation to talk into a
 * conversation the screen had simply failed to fetch.
 *
 * The app's one failed state (`components/LoadError.tsx`), worded for a chat.
 * Try again is that state's primary action, so it carries the accent: while
 * this shows there is nothing in the thread to send into.
 */
export function ChatLoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return <LoadError title={`Couldn't load ${what}`} onRetry={onRetry} />
}
