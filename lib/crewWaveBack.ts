import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'

import { crewMessage, type BlendRef } from './crews'
import { crewsApi } from './crewsApi'
import type { RoomMessage } from './roomMessages'

/** A `crew_waved` line's metadata (admin lib/crews/like.ts): a crew's wave at yours, or a person's (their room handle). */
export type CrewWaveFrom = { eventId: string; fromCrewId: string } | { eventId: string; fromUserId: string }

/** How a Wave back from the crew chat went: done (a Mix when it was mutual), gone ("They've left the room"), or an error. */
export type WaveBackOutcome = { kind: 'done'; blend: BlendRef | null } | { kind: 'gone' } | { kind: 'error'; text: string }

/**
 * Wave back from the crew chat (advisor L-A), as `crewId` (this chat's crew): at a crew, the crew wave; at a person, the crew
 * like of their room handle (b2 moves it to `POST /events/:id/waves`). A 404 is them gone, never an error.
 */
export async function waveBackFromChat(from: CrewWaveFrom, crewId: string): Promise<WaveBackOutcome> {
  const result =
    'fromCrewId' in from
      ? await crewsApi.waveCrew(from.eventId, from.fromCrewId, crewId)
      : await crewsApi.likePersonAsCrew(from.eventId, from.fromUserId, crewId)
  if (result.success && result.data) return { kind: 'done', blend: result.data.blend }
  if (result.errorCode === 'NOT_FOUND') return { kind: 'gone' }
  return { kind: 'error', text: crewMessage(result, 'card', 'Couldn’t wave back. Try again.') }
}

const HIDDEN_PAGE = 50
/** 1,000 blocked crews. Past it the list stays unknown, so crew lines are withheld rather than guessed. */
const HIDDEN_PAGES_MAX = 20

/** Every crew you blocked, or null when any page could not be read. */
async function readHiddenCrewIds(): Promise<ReadonlySet<string> | null> {
  const ids = new Set<string>()
  for (let page = 1; page <= HIDDEN_PAGES_MAX; page += 1) {
    const r = await crewsApi.hiddenCrews(page, HIDDEN_PAGE)
    if (!r.success || !r.data) return null
    r.data.crews.forEach((c) => ids.add(c.crewId))
    if (!r.data.pagination.hasMore) return ids
  }
  return null
}

/** The crews you blocked, for a crew chat (`enabled`): read each time the chat takes focus. Null until the whole list is known. */
export function useHiddenCrewIds(enabled: boolean): ReadonlySet<string> | null {
  const [ids, setIds] = useState<ReadonlySet<string> | null>(null)
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return
      let live = true
      void readHiddenCrewIds().then((next) => {
        // A failed re-read keeps the last list that was read whole.
        if (live && next) setIds(next)
      })
      return () => {
        live = false
      }
    }, [enabled])
  )
  return ids
}

/** A `crew_waved` line by its words: the socket sends it with no metadata. `your`: a crew's; `the`: a person's. */
const CREW_WAVED = /waved at (your|the) crew$/
const isSystemLine = (m: Pick<RoomMessage, 'message_type' | 'message_text'>, pattern: RegExp) => m.message_type === 'system' && pattern.test(m.message_text.trim())
export const isCrewWavedLine = (m: Pick<RoomMessage, 'message_type' | 'message_text' | 'crewWave'>): boolean => !!m.crewWave || isSystemLine(m, CREW_WAVED)

/**
 * Advisor Q2: a blocked crew's `crew_waved` line is not drawn. Fails closed: with the list unknown (`null`), or the line
 * naming no crew (live, before the history is read again), a crew's line is withheld. A person's wave and every other line stay.
 */
export function withoutBlockedCrews(messages: RoomMessage[], blocked: ReadonlySet<string> | null): RoomMessage[] {
  return messages.filter((m) => {
    if (!m.crewWave) return !isSystemLine(m, /waved at your crew$/)
    return !('fromCrewId' in m.crewWave) || (blocked !== null && !blocked.has(m.crewWave.fromCrewId))
  })
}
