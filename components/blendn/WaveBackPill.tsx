import { Pressable, StyleSheet, Text } from 'react-native'

import { COLOR, FONT_FAMILY, ICON, RADIUS, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { CONTROL_FONT_CAP, font, useBoldText, useSelection } from '../ds/shared'
import { WavingHand } from '../ds/PersonCard'
import { Icon } from '../ui/Icon'

/** The received surfaces' pill (board 03: the toast, the strip, See all): 32 tall, hugging its label. */
const PILL = 32

/**
 * Wave back (the lit rose pill, as on Meet next), the hand swinging while it goes, then a still ✓ Waved (rose outline,
 * does nothing: no Wave again). `label` is the toast's "See" for a fold. The press plays `H.select` (07-motion).
 */
export function WaveBackPill({
  name,
  state,
  label = 'Wave back',
  accessibilityLabel,
  onPress,
  testID,
}: {
  name: string
  state: 'ready' | 'sending' | 'waved'
  label?: string
  accessibilityLabel?: string
  onPress?: () => void
  testID?: string
}) {
  const bold = useBoldText()
  const sel = useSelection()
  const waved = state === 'waved'
  const ink = waved ? sel.glyph : COLOR.textPrimary
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        if (state !== 'ready') return
        H.select()
        onPress?.()
      }}
      disabled={state !== 'ready'}
      hitSlop={SPACE.xs}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (waved ? `Waved at ${name}` : `Wave back at ${name}`)}
      accessibilityState={{ disabled: state !== 'ready', busy: state === 'sending' }}
      style={[styles.pill, waved ? { borderColor: sel.edge } : { backgroundColor: sel.fill, borderColor: sel.edge }]}
    >
      {state === 'sending' ? <WavingHand size={ICON.inline} /> : label === 'Wave back' || waved ? <Icon name={waved ? 'check' : 'hand'} size={ICON.inline} color={ink} /> : null}
      <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('note', bold, FONT_FAMILY.brand[500]), { color: ink }]}>
        {waved ? 'Waved' : label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pill: {
    minHeight: PILL,
    borderRadius: RADIUS.capsule,
    borderWidth: 1,
    paddingHorizontal: SPACE.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.xs,
    flexShrink: 0,
  },
})
