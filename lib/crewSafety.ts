import { noteCrewBlocked } from './crewWaveBack'
import { CREW_REPORT_REASONS, crewMessage } from './crews'
import { crewsApi } from './crewsApi'
import { showSheet, type Sheet } from './sheet'

type NamedCrew = { crewId: string; name: string }

export const reportCrewSheet = (crew: NamedCrew): Sheet => ({
  kind: 'reasons',
  hue: 'rose',
  title: `Report ${crew.name}`,
  message: 'What’s wrong with this crew’s name or bio? Nobody in the crew is told who reported it.',
  reasons: CREW_REPORT_REASONS.map((r) => ({ value: r.value, label: r.label })),
  submitLabel: 'Send report',
  run: async (reason, description) => {
    const result = await crewsApi.report(crew.crewId, {
      reason: reason as (typeof CREW_REPORT_REASONS)[number]['value'],
      ...(description ? { description } : {}),
    })
    if (!result.success) return { ok: false, error: crewMessage(result, 'card', 'Couldn’t send the report. Try again.') }
    return { ok: true, toast: 'Thanks — our team will look at it' }
  },
})

/** Block this crew (advisor S-A): a neutral confirm, then for good (`POST /crews/:id/hide`). */
export const blockCrewSheet = (crew: NamedCrew, onBlocked: () => void): Sheet => ({
  kind: 'actions',
  hue: 'rose',
  title: `Block ${crew.name}?`,
  message: `You won’t see ${crew.name} in any room again. Its members aren’t told. Unblock any time in Settings → Blocked.`,
  actions: [
    {
      label: `Block ${crew.name}`,
      variant: 'secondary',
      run: async () => {
        const result = await crewsApi.hideCrew(crew.crewId)
        if (!result.success) return { ok: false, error: crewMessage(result, 'card', `Couldn’t block ${crew.name}. Try again.`) }
        noteCrewBlocked(crew.crewId)
        onBlocked()
        return { ok: true, toast: `${crew.name} is blocked` }
      },
    },
    { label: 'Cancel', cancel: true },
  ],
})

/** Holding a crew's wave (advisor Q1 2026-11-25): Block and Report, both neutral, as a person's wave has (anti-spam W7). */
export function showCrewSafetyActions(crew: NamedCrew, onBlocked: () => void): void {
  showSheet({
    kind: 'actions',
    hue: 'rose',
    title: crew.name,
    layout: 'rows',
    actions: [
      { label: 'Block this crew', icon: 'ban', next: () => blockCrewSheet(crew, onBlocked) },
      { label: 'Report this crew', icon: 'flag', next: () => reportCrewSheet(crew) },
      { label: 'Cancel', cancel: true },
    ],
  })
}
