import { useSyncExternalStore } from 'react'
import { Share } from 'react-native'

import type { ShareTarget } from '../components/ds/ShareSheet'
import { shareText } from './shareEvent'

/**
 * The share tray, opened from anywhere (Flow 16 · 16.1).
 *
 * The Scene, the venue page, Add friends, the Going rows and the Pulse's peek each want the same tray and none of them
 * should render one: `openShare` puts a target here and `components/share/ShareHost` (mounted once, in
 * `app/_layout.tsx`) draws it, the same shape as `lib/sheet`. The promise settles when the tray closes: true when the
 * link went somewhere (WhatsApp, Story, Copy, More…), false for a dismiss.
 */
type Request = { id: number; target: ShareTarget; settle: (went: boolean) => void }

let current: Request | null = null
let nextId = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

export function openShare(target: ShareTarget): Promise<boolean> {
  current?.settle(false)
  return new Promise<boolean>((resolve) => {
    current = { id: ++nextId, target, settle: resolve }
    emit()
  })
}

/** For the host: the tray has closed. */
export function closeShare(went: boolean): void {
  const request = current
  current = null
  emit()
  request?.settle(went)
}

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}
const snapshot = () => current

export function useShareRequest(): { id: number; target: ShareTarget } | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** Tests only. */
export function resetShareTray(): void {
  current = null
  nextId = 0
}

/**
 * The system share sheet with the target's words and link (Flow 4: the event page's Invite and its Share, "the system
 * share sheet" on the board). Says how it ended so the caller can speak only to a failure.
 */
export async function shareNatively(target: ShareTarget): Promise<'shared' | 'dismissed' | 'failed'> {
  try {
    const result = await Share.share({ message: shareText(target) })
    return result.action === Share.sharedAction ? 'shared' : 'dismissed'
  } catch {
    return 'failed'
  }
}
