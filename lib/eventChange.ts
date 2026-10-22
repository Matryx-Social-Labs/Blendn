import { cardTime } from './pulse'

/**
 * "Changed while you're going" (Flow 3 · 3.1), from `GET /events/:eventId` (blendn-admin `lib/event-change.ts`
 * `changeForResponse`): `changedAt`, `changedFields` and `changedFrom`, the last holding what the time and place were before
 * the first change still standing. All three are null, `[]` and null for an event that has not changed, and absent from a
 * server that does not send them: either way there is no line, which is what the Scene drew before.
 */
export type ChangedField = 'time' | 'venue' | 'cancelled'

export interface EventChange {
  /** When it last moved. */
  changedAt: string
  fields: ChangedField[]
  from: { startTime?: string; endTime?: string; venueName?: string | null; address?: string | null }
}

const FIELDS: ReadonlySet<string> = new Set<ChangedField>(['time', 'venue', 'cancelled'])
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The change on an event read, or null when it has none (or the server sent nothing usable). */
export function parseEventChange(d: { changedAt?: unknown; changedFields?: unknown; changedFrom?: unknown }): EventChange | null {
  if (typeof d.changedAt !== 'string' || !Array.isArray(d.changedFields)) return null
  const fields = d.changedFields.filter((f): f is ChangedField => typeof f === 'string' && FIELDS.has(f))
  if (fields.length === 0) return null
  const raw = isRecord(d.changedFrom) ? d.changedFrom : {}
  const text = (v: unknown) => (typeof v === 'string' || v === null ? v : undefined)
  return {
    changedAt: d.changedAt,
    fields,
    from: {
      ...(typeof raw.startTime === 'string' && { startTime: raw.startTime }),
      ...(typeof raw.endTime === 'string' && { endTime: raw.endTime }),
      ...(text(raw.venueName) !== undefined && { venueName: text(raw.venueName) }),
      ...(text(raw.address) !== undefined && { address: text(raw.address) }),
    },
  }
}

export interface ChangeLine {
  key: 'time' | 'venue'
  /** "Updated · new start time" */
  label: string
  /** What it was, struck through. */
  was: string
  /** What it is now. */
  now: string
}

interface Current {
  start_time: string
  end_time: string
  venue_name: string
  address: string
}

/**
 * The lines the Scene draws, one per thing that moved. A cancel is the Scene's own banner, so it is not a line. The old and new
 * times are in the Pulse's date grammar (`cardTime`: "9 PM", "Sat · 10:30 PM"), so a moved night reads like its card.
 */
export function changeLines(change: EventChange, current: Current, now: number = Date.now()): ChangeLine[] {
  const out: ChangeLine[] = []
  if (change.fields.includes('time')) {
    const moved = change.from.startTime !== undefined ? 'start_time' : change.from.endTime !== undefined ? 'end_time' : null
    const was = moved === 'start_time' ? change.from.startTime : change.from.endTime
    if (moved && was) {
      const words = (iso: string) => cardTime({ start_time: iso, end_time: iso }, now)
      out.push({ key: 'time', label: `Updated · new ${moved === 'start_time' ? 'start' : 'end'} time`, was: words(was), now: words(current[moved]) })
    }
  }
  if (change.fields.includes('venue')) {
    // A name that was null (the event had none) says nothing of the old place: the address does.
    const byName = typeof change.from.venueName === 'string'
    const was = byName ? change.from.venueName : change.from.address
    const nowPlace = byName ? current.venue_name : current.address
    if (was && nowPlace) out.push({ key: 'venue', label: 'Updated · new venue', was, now: nowPlace })
  }
  return out
}
