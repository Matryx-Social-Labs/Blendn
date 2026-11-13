import { Pressable, StyleSheet, Text } from 'react-native'

import { COLOR, FONT_FAMILY, ICON, RADIUS, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { CONTROL_FONT_CAP, font, useBoldText, useSelection } from '../ds/shared'
import { WavingHand } from '../ds/PersonCard'
import { Icon } from '../ui/Icon'

/** Board 03 `.btn-s`: 36 tall, 14 a side, hugging its label. */
const PILL = 36

/**
 * Wave back (the lit rose pill, as on Meet next), the hand swinging while it goes, then a still ✓ Waved (rose outline,
 * does nothing: no Wave again). `label` is the toast's "See" for a fold. The press plays `H.select` (07-motion).
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
  const bold = useBoldText()
  const sel = useSelection()
  const waved = state === 'waved'
  // `.btn-s`: the rose edge colour, solid, white ink; ✓ Waved is the still outline (`.still`).
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
      style={[styles.pill, waved ? { borderColor: sel.edge } : { backgroundColor: sel.edge, borderColor: sel.edge }]}
    >
      {state === 'sending' ? <WavingHand size={ICON.inline} /> : waved || hand ? <Icon name={waved ? 'check' : 'hand'} size={ICON.inline} color={ink} /> : null}
      <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.brand[500]), { color: ink }]}>
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
    paddingHorizontal: SPACE.md + SPACE.xxs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.xs + SPACE.xxs,
    flexShrink: 0,
  },
})
