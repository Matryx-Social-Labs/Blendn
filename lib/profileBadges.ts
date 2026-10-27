import type { Badge } from './aboutYou'

/**
 * The badges a profile carries (`profile.badges` on `GET /profiles/:id`, and a room card's `badges`): earned from check-ins,
 * derived on read by the server. `null` is "none sent": the key is absent when the person turned badges off, for a viewer
 * the profile is anonymous to, and from a server that does not send it. `[]` is "sent, none earned yet". The two are never
 * folded together: an owner who turned them off sees no card, one who has earned none sees the not-yet sentence.
 */
const KINDS: ReadonlySet<string> = new Set<Badge['kind']>(['regular_here', 'shows_up', 'nights_out', 'nights_together'])

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function parseBadges(raw: unknown): Badge[] | null {
  if (!Array.isArray(raw)) return null
  const seen = new Set<string>()
  return raw.flatMap((b): Badge[] => {
    if (!isRecord(b) || typeof b.kind !== 'string' || !KINDS.has(b.kind) || seen.has(b.kind)) return []
    seen.add(b.kind)
    return [{ kind: b.kind as Badge['kind'], label: typeof b.label === 'string' ? b.label : '' }]
  })
}

/** What a badge means, in the design's words (Flow 14 · 14.5): shown on a tap on Me, one line, no haptic. */
export const BADGE_MEANING: Record<Badge['kind'], string> = {
  shows_up: 'When 80%+ of your RSVPs turn into nights, 3 or more',
  nights_out: '5 or more nights out this month',
  regular_here: '3 or more visits in 60 days, only at this venue',
  nights_together: 'A crew that goes out together often',
}
