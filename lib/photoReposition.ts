import { useSyncExternalStore } from 'react'

import type { CropRect, Size } from './photoCrop'

/**
 * The reposition step between choosing a photo and keeping it (Flow 6 · 6.3 #08), as a question the photo path asks and a
 * screen answers: `requestReposition` resolves to what the person did, and the host mounted by the screen that is adding the
 * photo (`RepositionHost`) draws it. A request with no host mounted is `skip`: the photo goes on as it was picked, never
 * stuck waiting for a screen that is not there.
 */
export type RepositionPhoto = Size & { uri: string }
export type RepositionResult =
  /** Use photo: the part of the photo inside the frame. */
  | { kind: 'use'; rect: CropRect }
  /** Choose another: back to where the photo comes from. */
  | { kind: 'again' }
  /** Closed with the system back, or nothing to ask. */
  | { kind: 'cancel' }
  /** No host: carry on with the photo as picked. */
  | { kind: 'skip' }

type Pending = { photo: RepositionPhoto; resolve: (result: RepositionResult) => void }

let pending: Pending | null = null
let hosts = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

/** A host is mounted while its screen is: `skip` is the answer when none is. Returns the unmount. */
export function mountRepositionHost(): () => void {
  hosts += 1
  return () => {
    hosts -= 1
    // The screen that was asking went away: the question is not left open.
    if (hosts === 0) settleReposition({ kind: 'cancel' })
  }
}

/** Whether a screen is mounted to ask on: a photo that cannot be repositioned is not re-encoded to find that out. */
export const hasRepositionHost = () => hosts > 0

export function requestReposition(photo: RepositionPhoto): Promise<RepositionResult> {
  if (hosts === 0) return Promise.resolve({ kind: 'skip' })
  // One question at a time: a second one closes the first.
  settleReposition({ kind: 'cancel' })
  return new Promise((resolve) => {
    pending = { photo, resolve }
    emit()
  })
}

export function settleReposition(result: RepositionResult): void {
  const now = pending
  if (!now) return
  pending = null
  emit()
  now.resolve(result)
}

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** The photo being repositioned, or null. */
export function usePendingReposition(): RepositionPhoto | null {
  return useSyncExternalStore(subscribe, () => pending?.photo ?? null)
}
