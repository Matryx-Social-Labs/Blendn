import { useEffect, useState } from 'react'

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

/** The server's page cap. shortcut: a person who blocked more than 50 crews still sees the rest's lines; page it if anyone does. */
const HIDDEN_PAGE = 50
const NONE: ReadonlySet<string> = new Set()

/** The crews you blocked, for a crew chat (`enabled`): read once as it opens; a failed read hides nothing. */
export function useHiddenCrewIds(enabled: boolean): ReadonlySet<string> {
  const [ids, setIds] = useState(NONE)
  useEffect(() => {
    if (!enabled) return
    let live = true
    void crewsApi.hiddenCrews(1, HIDDEN_PAGE).then((r) => {
      if (live && r.success && r.data) setIds(new Set(r.data.crews.map((c) => c.crewId)))
    })
    return () => {
      live = false
    }
  }, [enabled])
  return ids
}

/** Advisor Q2: a blocked crew's `crew_waved` line is not drawn. A person's wave, and every other line, is. */
export function withoutBlockedCrews(messages: RoomMessage[], blocked: ReadonlySet<string>): RoomMessage[] {
  if (!blocked.size) return messages
  return messages.filter((m) => !(m.crewWave && 'fromCrewId' in m.crewWave && blocked.has(m.crewWave.fromCrewId)))
}
