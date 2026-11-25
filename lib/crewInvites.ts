import { useSyncExternalStore } from 'react'

import type { CrewInvite } from './crews'
import { crewsApi } from './crewsApi'

/**
 * The crew invites waiting on you: ONE list and ONE count, read by every surface that shows them (requests placement A,
 * SCRUM-1036). Crews › Invites, Me's Crews dot and Notifications · Waiting on you all draw from here, and every read of
 * `GET /crews` goes through `readMyCrews`, so whichever surface read last has told the others. An answer given anywhere
 * (`crewInviteAnswered`: Join on the consent screen, Decline there or in Notifications) takes the invite off every surface at
 * once, with no reload. The Banter no longer holds a copy.
 */
export type CrewOutcome = { outcome: 'joined' | 'declined'; name: string }

export type CrewInvitesState = {
  invites: readonly CrewInvite[]
  /** The server's count, never the length of the pages read. */
  total: number
  /** The next page of invites; null when every invite is read (only then can a missing one be called answered). */
  cursor: string | null
  /** A read has answered: until then "no invites" is not known. */
  loaded: boolean
  /** The invites answered this session, by crew: Notifications says "You’re in {crew}" for a Join from the consent screen. */
  outcomes: ReadonlyMap<string, CrewOutcome>
}

const EMPTY: CrewInvitesState = { invites: [], total: 0, cursor: null, loaded: false, outcomes: new Map() }
let state = EMPTY
const listeners = new Set<() => void>()
/** When each invite was answered: a read that began before the answer still lists it, and must not put it back. */
const answeredAt = new Map<string, number>()
/** Bumped on sign-out: a read begun for the last account writes nothing. */
let generation = 0

const emit = (next: CrewInvitesState) => {
  state = next
  listeners.forEach((l) => l())
}

/** What a read begun at `started` may still list that was answered since. */
const answeredSince = (started: number) => (i: CrewInvite) => (answeredAt.get(i.crewId) ?? -1) < started

/**
 * `GET /crews` (a page of invites past `cursor`), published to every surface. The result is returned as the server sent it,
 * so a caller can read its crews too; a failed read publishes nothing (what is drawn stays).
 */
export async function readMyCrews(cursor?: string | null) {
  const mine = generation
  const started = Date.now()
  const result = await crewsApi.myCrews(cursor)
  if (mine !== generation || !result.success || !result.data) return result
  const { invites, invitesPagination: page } = result.data
  const fresh = invites.filter(answeredSince(started))
  const stale = invites.length - fresh.length
  const total = Math.max(0, (page?.totalCount ?? invites.length) - stale)
  const next = page?.hasMore ? page.nextCursor : null
  if (!cursor) {
    emit({ ...state, invites: fresh, total, cursor: next, loaded: true })
  } else {
    const seen = new Set(state.invites.map((i) => i.crewId))
    emit({ ...state, invites: [...state.invites, ...fresh.filter((i) => !seen.has(i.crewId))], total, cursor: next, loaded: true })
  }
  return result
}

/** The next page onto the ones held; whether it landed. */
export async function moreCrewInvites(): Promise<boolean> {
  if (!state.cursor) return true
  const result = await readMyCrews(state.cursor)
  return result.success
}

/** An invite answered (joined or declined, here or anywhere): it leaves every surface now. */
export function crewInviteAnswered(crewId: string, outcome: CrewOutcome['outcome'], name: string): void {
  answeredAt.set(crewId, Date.now())
  // Counted if it is held, or may sit on a page not read yet; a total from a read that never listed it is left alone.
  const held = state.invites.some((i) => i.crewId === crewId) || state.cursor !== null
  emit({
    ...state,
    invites: state.invites.filter((i) => i.crewId !== crewId),
    total: held ? Math.max(0, state.total - 1) : state.total,
    outcomes: new Map(state.outcomes).set(crewId, { outcome, name }),
  })
}

/** Sign-out: the next account starts from nothing. */
export function resetCrewInvites(): void {
  generation += 1
  answeredAt.clear()
  emit(EMPTY)
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export const useCrewInvites = (): CrewInvitesState => useSyncExternalStore(subscribe, () => state)
