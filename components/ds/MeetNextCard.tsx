import { useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import ScalePress from '../motion/ScalePress'
import { COLOR, FONT_FAMILY, ICON, MATERIAL, PRESS, RADIUS, SPACE } from '../../lib/design/tokens'
import { tint } from '../../lib/theme'
import { Icon } from '../ui/Icon'
import { RadialWash } from '../ui/GradientFill'
import { H } from '../../lib/haptics'
import type { WaveStatus } from '../../lib/waves'
import { Avatar } from './Avatar'
import { WavingHand } from './PersonCard'
import { type Face } from './Facepile'
import { CONTROL_FONT_CAP, focusRing, font, IC_HAIRLINE, PRESSED_WASH, useBoldText, useIncreaseContrast, useSelection } from './shared'

/** The card's face (R-A `pick`: a 64 pt creature over the name). */
const CARD_FACE = 64
/** The Wave pill under the reason (Wave B): 40 tall, the card's width less its padding. */
const PILL = 40
/** The card's light: rose from the top centre (`.xmc`). */
const WASH = [{ color: COLOR.brandRose, alpha: 0.28, at: [50, 0], size: [80, 60], reach: 0.75 }] as const

/**
 * One of three under "Meet next" (Flow 5 R-A `pick`, 109.7 wide at 393): a lit rose card, the face, the name and one
 * reason (two lines each) and a labelled 40 pt Wave pill (Wave B, SCRUM-1042). The three in a row share the tallest
 * one's height.
 *
 * The pill: Wave (quiet) → Wave back (lit, and the card's rim lights, "Waved at you · 4 min ago") → a still ✓ Waved
 * (rose outline, does nothing: no Wave again) → Say hi (the light pill, "You both waved"). In flight the hand swings.
 * Tap opens the PersonCard, silently; a screen reader has the pill as the card's "Wave" or "Wave back" action, and the
 * card is read "{name}, {reason}", then "waved". Name and reason cap at 1.3×. Increase Contrast: the 50% hairline and
 * the reason in white.
 */
export function MeetNextCard({
  face,
  name,
  reason,
  overlap,
  width,
  wave = 'none',
  wavedAgo,
  onPress,
  onWave,
  onSayHi,
  previewState,
  testID,
}: {
  face: Face
  name: string
  reason: string
  /**
   * Matching v2's one sentence (Flow 14 · 14.1): when the server sent one it is the reason, in the
   * two lines the card has. Never a score; nothing when there is none.
   */
  overlap?: string | null
  /** 109 three across at 393, 98 at 360. */
  width: number
  /** `lib/waves.ts`: Wave → Wave back → ✓ Waved → Say hi. */
  wave?: WaveStatus
  /** They waved at you this long ago ("4 min"), when this phone knows; the reason's second line. */
  wavedAgo?: string | null
  onPress?: () => void
  /** Wave, or Wave back. */
  onWave?: () => void
  /** You both waved: into the conversation. */
  onSayHi?: () => void
  /** The design gallery only: draws a transient state with no finger or keyboard. */
  previewState?: 'pressed' | 'focused'
  testID?: string
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const sel = useSelection()
  const android = Platform.OS === 'android'
  const [focused, setFocused] = useState(false)
  const atYou = wave === 'wavedAtYou'
  const mutual = wave === 'mutual'
  const said = atYou ? 'Waved at you' : mutual ? 'You both waved' : overlap || reason
  const ago = atYou && wavedAgo ? `${wavedAgo} ago` : null
  const spoken = [name, ago ? `${said} ${ago}` : said, wave === 'waved' ? 'waved' : null].filter(Boolean).join(', ')
  const sends = wave === 'none' || atYou
  const press = mutual ? onSayHi : sends ? onWave : undefined
  const actionLabel = mutual ? 'Say hi' : atYou ? 'Wave back' : 'Wave'
  const pill =
    wave === 'waved'
      ? { backgroundColor: 'transparent', borderColor: sel.edge }
      : atYou
        ? { backgroundColor: sel.fill, borderColor: sel.edge }
        : mutual
          ? { backgroundColor: COLOR.textPrimary, borderColor: COLOR.textPrimary }
          : { backgroundColor: COLOR.surfaceRaised, borderColor: tint(COLOR.textPrimary, PILL_EDGE_ALPHA) }
  const ink = mutual ? COLOR.ink : wave === 'waved' ? sel.glyph : COLOR.textPrimary
  return (
    <View testID={testID && `${testID}-scale`} style={[styles.outer, { width }, previewState === 'pressed' && styles.pressed]}>
      <ScalePress
        testID={testID}
        onPress={onPress}
        onLongPress={() => {
          H.longPress()
          onPress?.()
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        pressedScale={android ? 1 : PRESS.scale}
        android_ripple={{ color: PRESSED_WASH.android, foreground: true }}
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityActions={press ? [{ name: 'activate' }, { name: 'wave', label: actionLabel }] : undefined}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName !== 'wave') return onPress?.()
          if (sends) H.select()
          press?.()
        }}
        style={[styles.card, { borderColor: atYou ? sel.edge : tint(COLOR.selectionRoseGlyph, CARD_EDGE_ALPHA) }, contrast && IC_HAIRLINE]}
      >
        <RadialWash layers={WASH} style={StyleSheet.absoluteFill} />
        <Avatar size={CARD_FACE} testID={testID && `${testID}-face`} {...face} />
        <Text numberOfLines={2} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('control', bold, FONT_FAMILY.brand[500]), styles.name]}>
          {name}
        </Text>
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={CONTROL_FONT_CAP}
          style={[font('note', bold), styles.center, { color: atYou || mutual ? sel.glyph : contrast ? COLOR.textPrimary : COLOR.textSecondary }]}
        >
          {said}
        </Text>
        {ago ? (
          <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('note', bold), styles.center, { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>
            {ago}
          </Text>
        ) : null}
        <View style={styles.spacer} />
        <Pressable
          onPress={() => {
            // 07-motion: the press plays H.select as the hand starts to swing; Say hi is the light pill, silent.
            if (sends) H.select()
            press?.()
          }}
          disabled={!press}
          hitSlop={SPACE.xs}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID={testID && `${testID}-wave`}
          style={[styles.pill, pill]}
        >
          {mutual ? null : wave === 'sending' ? (
            <WavingHand testID={testID && `${testID}-hand-waving`} size={ICON.inline} />
          ) : (
            <Icon name={wave === 'waved' ? 'check' : 'hand'} size={ICON.inline} color={ink} />
          )}
          {/* Two lines at the largest text: "Wave back" wraps in a 110 card rather than cutting to "Wave b…". */}
          <Text numberOfLines={2} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('note', bold, FONT_FAMILY.brand[500]), styles.pillLabel, { color: ink }]}>
            {wave === 'waved' ? 'Waved' : actionLabel}
          </Text>
        </Pressable>
      </ScalePress>
      {focused || previewState === 'focused'
        ? focusRing(RADIUS.tile).map((ring, i) => (
            <View key={i} testID={i ? undefined : testID && `${testID}-focus`} pointerEvents="none" style={ring} />
          ))
        : null}
    </View>
  )
}

/** The card's rim: the rose glyph at 35% (`.xmc` inset 0.5). */
const CARD_EDGE_ALPHA = 0.35
/** The quiet Wave pill's rim (Wave B `.wp`): white at 12%. */
const PILL_EDGE_ALPHA = 0.12

const styles = StyleSheet.create({
  outer: { alignSelf: 'stretch' },
  pressed: { transform: [{ scale: PRESS.scale }] },
  card: {
    flexGrow: 1,
    borderRadius: RADIUS.tile,
    borderWidth: MATERIAL.glassEdge.width,
    backgroundColor: COLOR.surface,
    paddingTop: SPACE.md + SPACE.xxs,
    paddingHorizontal: SPACE.sm,
    paddingBottom: SPACE.md,
    alignItems: 'center',
    gap: SPACE.xs + SPACE.xxs,
    overflow: 'hidden',
  },
  name: { color: COLOR.textPrimary, textAlign: 'center', alignSelf: 'stretch' },
  center: { textAlign: 'center', alignSelf: 'stretch' },
  spacer: { flexGrow: 1 },
  pillLabel: { flexShrink: 1, textAlign: 'center' },
  pill: {
    alignSelf: 'stretch',
    minHeight: PILL,
    borderRadius: RADIUS.capsule,
    borderWidth: 1,
    marginTop: SPACE.xxs,
    paddingHorizontal: SPACE.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.xs,
  },
})
