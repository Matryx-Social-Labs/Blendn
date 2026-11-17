import { ICON } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { Button } from '../ds/Button'
import { WavingHand } from '../ds/PersonCard'

/**
 * Wave back: the DS's positive (`Button kind="lit" size="pill"`, buttons board C, owner 2026-11-17), the hand swinging while
 * it goes, then a still ✓ Waved (the neutral, disabled: no Wave again), as the person page's Wave. `label` is the toast's
 * "See" for a fold. The press plays `H.select` (07-motion).
 */
export function WaveBackPill({
  name,
  state,
  label = 'Wave back',
  hand = true,
  accessibilityLabel,
  onPress,
  testID,
}: {
  name: string
  state: 'ready' | 'sending' | 'waved'
  label?: string
  /** The hand before the label (the strip, See all); the toast's pill has none (board 03 L-A). */
  hand?: boolean
  accessibilityLabel?: string
  onPress?: () => void
  testID?: string
}) {
  const waved = state === 'waved'
  return (
    <Button
      kind={waved ? 'secondary' : 'lit'}
      size="pill"
      label={waved ? 'Waved' : label}
      icon={waved ? 'check' : hand ? 'hand' : undefined}
      leading={state === 'sending' ? <WavingHand size={ICON.inline} /> : undefined}
      disabled={waved}
      pressHaptic={state === 'ready' ? H.select : false}
      onPress={() => {
        if (state === 'ready') onPress?.()
      }}
      accessibilityLabel={accessibilityLabel ?? (waved ? `Waved at ${name}` : `Wave back at ${name}`)}
      testID={testID}
    />
  )
}
