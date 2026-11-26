import { useState } from 'react'

import type { WaveBackOutcome } from '../../lib/crewWaveBack'
import { H } from '../../lib/haptics'
import { SystemNotice } from '../ds/SystemNotice'
import { useAnnounced } from '../ds/shared'

/** Answered in this session, per line: a row the list unmounts on a scroll comes back answered, not as Wave back again. */
const answered = new Map<string, 'done' | 'gone'>()

const NOTE = {
  done: { text: 'Waved back', icon: 'check' as const },
  gone: { text: 'They’ve left the room' },
}

/**
 * "Nebula waved at your crew" in the crew chat (advisor L-A 2026-11-25): the DS SystemNotice with the hand and one text
 * action, Wave back. Answered, "Waved back" in the action's place; gone, "They've left the room"; an error keeps the action
 * and says why. `wavedBack` (admin #1029): answered before, after a restart too, so "Waved back" from the start. No
 * `onWaveBack`: the sentence alone.
 */
export function CrewWavedNotice({
  id,
  text,
  wavedBack,
  onWaveBack,
}: {
  id: string
  text: string
  wavedBack?: boolean
  onWaveBack?: () => Promise<WaveBackOutcome>
}) {
  const [tapped, setState] = useState<'idle' | 'busy' | 'done' | 'gone'>(() => answered.get(id) ?? 'idle')
  // The server's answer wins over a Wave back not yet tapped here, including one made elsewhere since this row mounted.
  const state = tapped === 'idle' && wavedBack ? 'done' : tapped
  const [error, setError] = useState<string | null>(null)
  useAnnounced(error)

  const waveBack = async () => {
    if (!onWaveBack || state !== 'idle') return
    H.select()
    setState('busy')
    setError(null)
    const outcome = await onWaveBack()
    if (outcome.kind === 'error') {
      setState('idle')
      setError(outcome.text)
      return
    }
    answered.set(id, outcome.kind)
    setState(outcome.kind)
  }

  const settled = state === 'done' || state === 'gone'
  return (
    <SystemNotice
      icon="hand"
      text={text}
      action={!settled && onWaveBack ? { label: 'Wave back', onPress: () => void waveBack() } : undefined}
      note={settled ? NOTE[state] : error ? { text: error } : undefined}
      testID={`crew-waved-${id}`}
    />
  )
}
