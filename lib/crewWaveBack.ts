import { useSyncExternalStore } from 'react'

import { crewMessage, type BlendRef } from './crews'
import { crewsApi } from './crewsApi'
import type { RoomMessage } from './roomMessages'
import { showSheet } from './sheet'

/** A `crew_waved` line's metadata (admin lib/crews/like.ts): a crew's wave at yours, or a person's (their room handle). */
export type CrewWaveFrom = { eventId: string; fromCrewId: string } | { eventId: string; fromUserId: string }

/** How a Wave back from the crew chat went: done (a Mix when it was mutual), gone ("They've left the room"), or an error. */
export type WaveBackOutcome = { kind: 'done'; blend: BlendRef | null } | { kind: 'gone' } | { kind: 'error'; text: string }

/**
 * Wave back from the crew chat (advisor L-A), as `crewId` (this chat's crew): at a crew, the crew wave; at a person, the wave
 * for your crew at their room handle. A 404 is them gone, never an error.
 */
export async function waveBackFromChat(from: CrewWaveFrom, crewId: string): Promise<WaveBackOutcome> {
  const result =
    'fromCrewId' in from
      ? await crewsApi.waveCrew(from.eventId, from.fromCrewId, crewId)
      : await crewsApi.wavePersonAsCrew(from.eventId, from.fromUserId, crewId)
  if (result.success && result.data) return { kind: 'done', blend: result.data.blend ?? null }
  if (result.errorCode === 'NOT_FOUND') return { kind: 'gone' }
  return { kind: 'error', text: crewMessage(result, 'card', 'Couldn’t wave back. Try again.') }
}

/**
 * The server's 403 to a wave at a crew from somebody not open to crews tonight. ponytail: matched on its sentence (the route
 * sends no reasonCode); read the code once it does.
 */
const NOT_OPEN = /Open to joining a crew tonight/i

/** Wave back at a crew that waved at you, as yourself (admin #1007). `notOpen`: your own switch is off (`askOpenToCrews`). */
export async function waveBackAtCrew(eventId: string, crewId: string): Promise<WaveBackOutcome | { kind: 'notOpen' }> {
  const result = await crewsApi.waveCrew(eventId, crewId)
  if (result.success && result.data) return { kind: 'done', blend: result.data.blend }
  if (result.errorCode === 'NOT_FOUND') return { kind: 'gone' }
  if (result.error && NOT_OPEN.test(result.error)) return { kind: 'notOpen' }
  return { kind: 'error', text: crewMessage(result, 'card', 'Couldn’t wave back. Try again.') }
}

const openedListeners = new Set<(eventId: string) => void>()
/** "Open to joining a crew tonight" was turned on from a Wave back: the Crews view's switch follows. */
export function onOpenedToCrews(fn: (eventId: string) => void): () => void {
  openedListeners.add(fn)
  return () => {
    openedListeners.delete(fn)
  }
}

/**
 * Advisor Q7 (2026-11-25): the switch is off, so ask. "Turn it on" turns it on and sends the wave; the sheet stays, saying
 * why, when either is refused. `onOutcome` hears the wave's answer; Not now sends nothing.
 */
export function askOpenToCrews(eventId: string, crew: { crewId: string; name: string }, onOutcome: (outcome: WaveBackOutcome) => void): void {
  showSheet({
    kind: 'actions',
    hue: 'rose',
    icon: 'users',
    title: `Wave back at ${crew.name}?`,
    message: 'Turn on “Open to joining a crew tonight” to wave at a crew. It turns off at the end of the night.',
    actions: [
      {
        label: 'Turn it on',
        variant: 'primary',
        run: async () => {
          const opened = await crewsApi.openToCrews(eventId, true)
          if (!opened.success) return { ok: false, error: crewMessage(opened, 'card', 'Couldn’t save that. Try again.') }
          openedListeners.forEach((fn) => fn(eventId))
          const outcome = await waveBackAtCrew(eventId, crew.crewId)
          if (outcome.kind === 'notOpen' || outcome.kind === 'error') return { ok: false, error: outcome.kind === 'error' ? outcome.text : 'Couldn’t wave back. Try again.' }
          onOutcome(outcome)
          return { ok: true }
        },
      },
      { label: 'Not now', cancel: true },
    ],
  })
}

/**
 * Crews blocked or unblocked on this phone since it opened. The server leaves a blocked crew's waves out of every read after
 * (admin #1029), but a chat already open still holds them: this is what reaches it.
 */
let blockedNow: ReadonlySet<string> = new Set()
const blockedListeners = new Set<() => void>()
const setBlockedNow = (next: ReadonlySet<string>) => {
  blockedNow = next
  blockedListeners.forEach((fn) => fn())
}
export const noteCrewBlocked = (crewId: string) => setBlockedNow(new Set([...blockedNow, crewId]))
export const noteCrewUnblocked = (crewId: string) => setBlockedNow(new Set([...blockedNow].filter((id) => id !== crewId)))
const onBlockedNow = (fn: () => void) => {
  blockedListeners.add(fn)
  return () => {
    blockedListeners.delete(fn)
  }
}
/** The crews blocked on this phone since it opened (`noteCrewBlocked`). */
export const useCrewsBlockedNow = (): ReadonlySet<string> => useSyncExternalStore(onBlockedNow, () => blockedNow)

/** Advisor Q2: a blocked crew's `crew_waved` line is not drawn. A person's wave and every other line stay. */
export function withoutBlockedCrews(messages: RoomMessage[], blocked: ReadonlySet<string>): RoomMessage[] {
  return messages.filter((m) => !(m.crewWave && 'fromCrewId' in m.crewWave && blocked.has(m.crewWave.fromCrewId)))
}
