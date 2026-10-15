import { useSyncExternalStore } from 'react'

/**
 * What a thread holds only on this phone: the draft left in its composer and
 * the sends that never reached the server (ROUND3 D 5.8, SCRUM-633).
 *
 * A failed send used to vanish when you left the chat: it lived in the
 * screen's state, and the next open read the server's page, which never had
 * it. Kept here, the thread puts it back as "Not sent · Tap to retry", and the
 * Banter row says so too — failed first, then a draft, then the last message.
 *
 * Keyed `room:<id>` or `dm:<id>`. Each screen stores its own message shape;
 * the Banter only asks whether there is one.
 *
 * ponytail: in memory, so a relaunch forgets both. Persist to AsyncStorage
 * when a draft surviving a relaunch is asked for.
 */

export const roomThread = (chatGroupId: string) => `room:${chatGroupId}`
export const dmThread = (conversationId: string) => `dm:${conversationId}`

type State = { drafts: ReadonlyMap<string, string>; failed: ReadonlyMap<string, readonly unknown[]> }

let state: State = { drafts: new Map(), failed: new Map() }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

/** The composer's text as you leave the thread. Empty forgets it. */
export function setDraft(thread: string, text: string): void {
  const draft = text.trim() ? text : ''
  if ((state.drafts.get(thread) ?? '') === draft) return
  const drafts = new Map(state.drafts)
  if (draft) drafts.set(thread, draft)
  else drafts.delete(thread)
  state = { ...state, drafts }
  emit()
}

export function draftOf(thread: string): string {
  return state.drafts.get(thread) ?? ''
}

/** The thread's failed sends, as the screen holds them. Empty forgets them. */
export function keepFailed<M>(thread: string, messages: readonly M[]): void {
  const before = state.failed.get(thread)
  if (!messages.length && !before) return
  if (before && before.length === messages.length && before.every((m, i) => m === messages[i])) return
  const failed = new Map(state.failed)
  if (messages.length) failed.set(thread, messages)
  else failed.delete(thread)
  state = { ...state, failed }
  emit()
}

export function failedOf<M>(thread: string): M[] {
  return [...((state.failed.get(thread) as M[] | undefined) ?? [])]
}

/** What a Banter row says instead of its last message, if anything (5.8's precedence). */
export type OutboxLine = { kind: 'failed' } | { kind: 'draft'; text: string }

export function outboxLine(outbox: State, thread: string): OutboxLine | null {
  if (outbox.failed.get(thread)?.length) return { kind: 'failed' }
  const draft = outbox.drafts.get(thread)
  return draft ? { kind: 'draft', text: draft.replace(/\s+/g, ' ').trim() } : null
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const snapshot = () => state

/** The store as it stands, outside a component. */
export const readOutbox = snapshot

/** Every thread's draft and failed sends, for the Banter. */
export function useOutbox(): State {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** Tests only. */
export function resetOutbox(): void {
  state = { drafts: new Map(), failed: new Map() }
  emit()
}
