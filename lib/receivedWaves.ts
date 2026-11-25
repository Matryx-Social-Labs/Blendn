import { useCallback, useEffect, useRef, useState } from 'react'

import { apiClient, type CrewWave, type CrewWavesWaitingRoom, type ReceivedWave, type ReceivedWavesPage, type WavesWaitingRoom } from './apiClient'
import { compactCount } from './format'
import { Logger } from './logger'
import { setListedAt, useRoomWaves, type WaveToastItem } from './roomWaves'
import { wavedAgo } from './waves'

/**
 * Waves to you, as the server keeps them (Wave PR (b), SCRUM-1042, board 03-receive). The strip under your room name
 * (S-A) and See all read `GET /events/:id/waves` (20 a page, newest first); Banter's one row per room (B-A) reads
 * `GET /waves`. Names are the room's (pseudonym + creature, or a first name they chose here); handles only, never an id.
 */

/** Anybody who waved at you: a person, or a crew (advisor T-A/U-A 2026-11-25: together, crews first while unanswered). */
export type AnyWave = ReceivedWave | CrewWave
export const isCrewWave = (w: AnyWave): w is CrewWave => 'crewId' in w
export const waveName = (w: AnyWave): string => (isCrewWave(w) ? w.name : w.displayName)
/** A key no person and crew share. */
export const waveId = (w: AnyWave): string => (isCrewWave(w) ? `crew:${w.crewId}` : w.userId)

/** A page shaped as the contract says, or nothing: the strip never draws from a malformed answer. */
export function isWavesPage(d: unknown): d is ReceivedWavesPage {
  const p = d as Partial<ReceivedWavesPage> | null
  return !!p && Array.isArray(p.waves) && typeof p.total === 'number' && typeof p.open === 'boolean'
}

/** A burst of waves (a big room) reads the list once it settles, not once per wave. */
const RELOAD_SETTLE_MS = 1_000
/** S-A: the newest three faces, whatever the room's size. */
export const STRIP_FACES = 3

export type Strip =
  | { kind: 'none' }
  /** One wave to answer: it answers in place. */
  | { kind: 'one'; wave: AnyWave }
  /** Several: the newest faces, the newest name, and how many others (the server's count). */
  | { kind: 'several'; faces: AnyWave[]; lead: AnyWave; others: number }

/**
 * What the strip shows from the list's first page. Only a wave not yet answered is one to answer, and only a row the
 * server returned may offer Wave back (admin security review).
 *
 * ponytail: the count is the server's total less the answered rows on this page, so answered waves past page one still
 * count; exact for anyone with under 20 waves. A `waiting` total on the list would make it exact everywhere.
 */
export function waitingStrip(page: ReceivedWavesPage | null): Strip {
  if (!page) return { kind: 'none' }
  const people = page.waves.filter((w) => !w.wavedBack)
  const crews = (page.crewWaves ?? []).filter((w) => !w.wavedBack)
  const waiting: AnyWave[] = [...crews, ...people]
  if (!waiting.length) return { kind: 'none' }
  const count = crews.length + Math.max(people.length, page.total - (page.waves.length - people.length))
  if (count === 1) return { kind: 'one', wave: waiting[0] }
  return { kind: 'several', faces: waiting.slice(0, STRIP_FACES), lead: waiting[0], others: count - 1 }
}

/**
 * See all's rows (U-A): crews you have not answered, the people in the server's paged order, then, after the last person,
 * the crews you answered before this read.
 */
export function listRows(list: Pick<ReceivedWavesPage, 'waves' | 'crewWaves' | 'nextCursor'>, answeredBefore: ReadonlySet<string>): AnyWave[] {
  const crews = list.crewWaves ?? []
  const before = crews.filter((c) => answeredBefore.has(c.crewId))
  return [...crews.filter((c) => !answeredBefore.has(c.crewId)), ...list.waves, ...(list.nextCursor ? [] : before)]
}

/** The strip's second line: "and N others waved at you", never cut, the count compact past 999. */
export function othersLine(others: number): string {
  return `and ${compactCount(others)} ${others === 1 ? 'other' : 'others'} waved at you`
}

/** "Waved at you · 4 min" when the list says when, else "Waved at you". */
export function wavedAtYouLine(at: string | undefined, now: number): string {
  const ago = wavedAgo(at, now)
  return ago ? `Waved at you · ${ago}` : 'Waved at you'
}

/** A See all row under its "Waved at you" header: "4 min ago", as board 03 draws it (the spoken label keeps `wavedAtYouLine`). */
export function wavedAgoLine(at: string | undefined, now: number): string {
  const ago = wavedAgo(at, now)
  return ago ? `${ago} ago` : 'Waved at you'
}

/** The toast's line: one name (L-A), or how many (L-B; "people" only when they all are). */
export function toastTitle(toast: WaveToastItem): string {
  if (toast.waves.length === 1) return `${toast.waves[0].fromName} waved at you`
  return `${toast.waves.length} ${toast.waves.some((w) => 'fromCrewId' in w) ? '' : 'people '}waved at you`
}

/**
 * The list's first page for a room, read again whenever a wave is heard, answered or blocked (`roomWaves` version).
 * A failed read keeps what was shown: the strip is a convenience, the toast and the cards still work.
 */
export function useReceivedWaves(eventId: string | null): { page: ReceivedWavesPage | null; reload: () => void } {
  const { version } = useRoomWaves()
  const [page, setPage] = useState<ReceivedWavesPage | null>(null)
  const [nudge, setNudge] = useState(0)
  const [pageFor, setPageFor] = useState(eventId)
  if (pageFor !== eventId) {
    setPageFor(eventId)
    setPage(null)
  }
  useEffect(() => {
    if (!eventId) return
    let live = true
    const read = () =>
      apiClient
        .getReceivedWaves(eventId, null)
        .then((r) => {
          if (!live || !r.success || !isWavesPage(r.data)) return
          setPage(r.data)
          setListedAt(eventId, r.data.waves)
        })
        .catch((e) => Logger.warn('match', 'received waves failed', { error: e }))
    // The first read at once; a re-read after a wave waits for the burst to settle.
    const timer = setTimeout(read, version || nudge ? RELOAD_SETTLE_MS : 0)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [eventId, version, nudge])
  const reload = useCallback(() => setNudge((n) => n + 1), [])
  return { page, reload }
}

/** One Banter row: the room's people and crews waiting. At least one of `people` and `crews` is there. */
export interface WaitingRow {
  eventId: string
  waiting: number
  people: WavesWaitingRoom | null
  crews: CrewWavesWaitingRoom | null
}

/** W-A: one row per room, people and crews counted together, in the server's order (rooms only crews waved in after). */
export function waitingRows(rooms: readonly WavesWaitingRoom[], crewRooms: readonly CrewWavesWaitingRoom[]): WaitingRow[] {
  const crewsAt = new Map(crewRooms.map((r) => [r.eventId, r]))
  const withPeople = rooms.map((people) => {
    const crews = crewsAt.get(people.eventId) ?? null
    return { eventId: people.eventId, waiting: people.waiting + (crews?.waiting ?? 0), people, crews }
  })
  const known = new Set(rooms.map((r) => r.eventId))
  const crewsOnly = crewRooms.filter((r) => !known.has(r.eventId)).map((crews) => ({ eventId: crews.eventId, waiting: crews.waiting, people: null, crews }))
  return [...withPeople, ...crewsOnly]
}

/** B-A: the rooms with waves waiting, read on mount, on `refreshKey` and on `reload`. */
export function useWavesWaiting(refreshKey: unknown): { rooms: WaitingRow[]; reload: () => void } {
  const [rooms, setRooms] = useState<WaitingRow[]>([])
  const [nudge, setNudge] = useState(0)
  const seq = useRef(0)
  useEffect(() => {
    const mine = ++seq.current
    apiClient
      .getWavesWaiting()
      .then((r) => {
        if (mine === seq.current && r.success && Array.isArray(r.data?.rooms)) setRooms(waitingRows(r.data.rooms, Array.isArray(r.data.crewRooms) ? r.data.crewRooms : []))
      })
      .catch((e) => Logger.warn('match', 'waves waiting failed', { error: e }))
  }, [refreshKey, nudge])
  const reload = useCallback(() => setNudge((n) => n + 1), [])
  return { rooms, reload }
}
