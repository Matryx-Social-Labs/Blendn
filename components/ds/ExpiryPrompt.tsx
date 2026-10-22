import { useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'

import ScalePress from '../motion/ScalePress'
import { Icon } from '../ui/Icon'
import { COLOR, FONT_FAMILY, PRESS, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { OPACITY } from '../../lib/theme'
import { Button } from './Button'
import { monoCaption, spokenPrice } from './MonoFamily'
import { Sheet } from './Sheet'
import { CONTROL_FONT_CAP, focusRing, font, IC_HAIRLINE, PRESSED_WASH, useBoldText, useIncreaseContrast } from './shared'

/** The server's sentences (admin `lib/go-live.ts`, Flow 11 `SRV`). */
const SERVER = {
  notLive: 'You’re not live here any more. Go live at the venue to join today’s room.',
  reset: 'Today’s room has closed. Tomorrow’s opens at 6.',
}
/** ROUND3 G1: the built free extend (client `lib/goLive.ts`, `EXTEND_CHOICE`). */
const FREE_EXTEND = 'Extend 45 min — free'
const noop = () => {}

/**
 * When live time runs out (guidelines/components/ExpiryPrompt.html, Flow 11 ·
 * 11.4, ROUND3 G1): the room asks once, "Your live time at Toit is up · Still
 * here?". **Extend 45 min — free** is the gradient primary on purpose (a bold
 * paid "Yes" beside a faint free "No" is a dark pattern); the Blend'n+ row is
 * a full-width solid secondary between it and Done, and never on a night's
 * first Go Live. Silence lets it lapse. `reset` is the 06:00 close.
 *
 * `H.primary` on Extend; none as it appears, on the Plus row or on Done (the
 * R3-G frame's annotations; the page's `H.threshold` at 2 minutes is
 * overruled). Read title, "Still here?", then the three buttons.
 *
 * The row is Blend'n+'s where Blend'n+ is sold (`from`, the store's lowest
 * price): it opens the Tonight sheet. Where staying is simply free (a launch
 * season, or somebody who has Blend'n+) the same row reads "Stay while you're
 * here · up to 4 h" and stays; nothing is sold there, so no "from".
 */
export function ExpiryPrompt({
  kind,
  visible,
  venue,
  onExtend,
  plus,
  firstGoLiveTonight = false,
  extending = false,
  staying = false,
  onDone,
}: {
  kind: 'ended' | 'reset'
  visible: boolean
  venue: string
  onExtend?: () => void
  /**
   * The Stay row. With `from` (the store's own lowest price) it is Blend'n+'s and opens the Tonight sheet's expiry
   * trigger; without, staying is free here and it goes live.
   */
  plus?: { from?: string; onPress: () => void }
  /** The client rule: no Blend'n+ row on a person's first Go Live (it is never a first impression). */
  firstGoLiveTonight?: boolean
  extending?: boolean
  /** A Stay is on its way: everything holds, as for Extend, but Extend shows no spinner. */
  staying?: boolean
  onDone: () => void
}) {
  const held = extending || staying
  if (kind === 'reset') {
    return (
      <Sheet
        visible={visible}
        onClose={onDone}
        icon="moon"
        title="Today’s room has closed"
        body={`${SERVER.reset} Pseudonyms reset with it.`}
        actions={[{ label: 'Done for now', kind: 'lit', onPress: onDone }]}
      />
    )
  }
  return (
    // While Extend or Stay is on its way the sheet holds, as `<Sheet>` does for its own busy actions.
    <Sheet visible={visible} onClose={held ? noop : onDone} icon="hourglass" title={`Your live time at ${venue} is up`} body="Still here?">
      <View style={styles.actions}>
        <Button kind="primary" label={FREE_EXTEND} loading={extending} disabled={staying} onPress={onExtend} />
        {plus && !(plus.from && firstGoLiveTonight) ? <PlusRow from={plus.from} disabled={held} onPress={plus.onPress} /> : null}
        <Button kind="tertiary" label="Done for now" disabled={held} onPress={onDone} />
      </View>
    </Sheet>
  )
}

/** "Stay while you're here with Blend'n+ · up to 4 h · from ₹49": solid, since glass in a sheet would be glass on glass. Free to stay: "Stay while you're here · up to 4 h". */
function PlusRow({ from, disabled, onPress }: { from?: string; disabled: boolean; onPress: () => void }) {
  const android = Platform.OS === 'android'
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const [focused, setFocused] = useState(false)
  return (
    <View>
      <ScalePress
        onPress={onPress}
        disabled={disabled}
        pressedScale={android ? 1 : PRESS.scale}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        android_ripple={{ color: PRESSED_WASH.android, foreground: true }}
        accessibilityRole="button"
        accessibilityLabel={from ? `Stay while you’re here with Blend’n+, up to 4 h, from ${spokenPrice(from)}` : 'Stay while you’re here, up to 4 h'}
        accessibilityState={{ disabled }}
        style={[styles.plus, contrast && IC_HAIRLINE, disabled && { opacity: OPACITY.disabled }]}
      >
        <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('button', bold), styles.ink]}>
          {from ? 'Stay while you’re here with Blend’n+' : 'Stay while you’re here'}
        </Text>
        <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('caption', bold, FONT_FAMILY.brand[400]), { color: COLOR.textSecondary }]}>
          {from ? 'up to 4 h · from ' : 'up to 4 h'}
          {from ? <Text style={monoCaption(bold)}>{from}</Text> : null}
        </Text>
      </ScalePress>
      {focused ? focusRing(RADIUS.button).map((r, i) => <View key={i} pointerEvents="none" style={r} />) : null}
    </View>
  )
}

/** The notice's well: 56, raised, its glyph at 28 in `textSecondary` (Flow 11 `expiry`). */
const WELL = SIZE.primary
const WELL_GLYPH = SPACE.xxl - SPACE.xs

/**
 * After it ends, the room says so (Flow 11 · 11.4, `notLive`): a card over the
 * dimmed room with the server's sentence and "Go live again"; at the 06:00
 * close, "Today's room has closed" and "Back to Places". A raised well, the
 * title, one paragraph, one full-width action. Read title, body, action. No
 * haptic.
 */
export function NotLiveNotice({ kind, onPress, testID }: { kind: 'notLive' | 'roomClosed'; onPress: () => void; testID?: string }) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const notLive = kind === 'notLive'
  return (
    <View testID={testID} style={[styles.card, contrast && IC_HAIRLINE]}>
      <View style={styles.well} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon name={notLive ? 'radio' : 'moon'} size={WELL_GLYPH} color={contrast ? COLOR.textPrimary : COLOR.textSecondary} />
      </View>
      <Text accessibilityRole="header" style={[font('title', bold), styles.ink, styles.centre]}>
        {notLive ? 'Not live here any more' : 'Today’s room has closed'}
      </Text>
      <Text style={[font('body', bold), styles.centre, { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>
        {notLive ? SERVER.notLive : SERVER.reset}
      </Text>
      <Button kind={notLive ? 'primary' : 'secondary'} label={notLive ? 'Go live again' : 'Back to Places'} onPress={onPress} style={styles.full} />
    </View>
  )
}

const styles = StyleSheet.create({
  actions: { gap: SPACE.sm },
  ink: { color: COLOR.textPrimary },
  plus: {
    minHeight: SIZE.primary,
    borderRadius: RADIUS.button,
    backgroundColor: COLOR.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.lg,
  },
  card: { borderRadius: RADIUS.card, backgroundColor: COLOR.surface, padding: SPACE.xl, alignItems: 'center', gap: SPACE.md },
  well: { width: WELL, height: WELL, borderRadius: RADIUS.capsule, backgroundColor: COLOR.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  centre: { textAlign: 'center' },
  full: { alignSelf: 'stretch', marginTop: SPACE.sm },
})
