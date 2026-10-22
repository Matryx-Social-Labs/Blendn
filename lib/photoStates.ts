/**
 * `photo_states` on your own `GET /profiles/:id` (blendn-admin `lib/photo-checks.ts` `PhotoState`): the photos that are up, in
 * order, then the ones moderation pulled in the last seven days, newest first. A pulled photo has `url: null` (its object is
 * withdrawn) and `was_main`, which says it was the main one. The live photos are already `photos`; only the pulled slots are
 * read here. Absent from a server that does not send it: nothing is pulled, which is what the app drew before.
 */

export interface PulledPhoto {
  /** When moderation took it down; null if the server did not say. */
  pulledAt: string | null
  /** It was the main photo: the next one is the main photo now. */
  wasMain: boolean
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The pulled slots in the server's order, from whatever `photo_states` held. Anything not an array of records reads as none. */
export function pulledPhotos(raw: unknown): PulledPhoto[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((s): PulledPhoto[] =>
    isRecord(s) && s.pulled === true
      ? [{ pulledAt: typeof s.pulled_at === 'string' ? s.pulled_at : null, wasMain: s.was_main === true }]
      : []
  )
}

/** Whether the main photo is among them: the grid then says what the main photo is now. */
export const mainWasPulled = (pulled: readonly PulledPhoto[]): boolean => pulled.some((p) => p.wasMain)
