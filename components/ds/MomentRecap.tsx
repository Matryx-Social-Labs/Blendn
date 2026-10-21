import { barTop } from '../../lib/barGeometry'
import { useEffect, type ReactNode } from 'react'
import { AccessibilityInfo, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { COLOR, FONT_FAMILY, MAX_FONT_SCALE, NUMERIC, RADIUS, SIZE, SPACE, STAGGER } from '../../lib/design/tokens'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { timeSpentLabel } from '../../lib/roomRecap'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { Grain } from './Grain'
import { IconButton } from './IconButton'
import { fade, type MomentFace } from './MomentStage'
import { Orbs } from './Orbs'
import { font, IC_HAIRLINE, useBoldText, useIncreaseContrast } from './shared'

/** flow4.js `recap`: your face at 80 (the Avatar scale's nearest is 72). */
const FACE = 72

/** "2 hours 15 minutes": what a screen reader says for the tile's "2h 15m". */
export function spokenMinutes(total: number): string {
  if (total < 1) return 'under a minute'
  const part = (n: number, unit: string) => (n ? `${n} ${unit}${n === 1 ? '' : 's'}` : '')
  return [part(Math.floor(total / 60), 'hour'), part(total % 60, 'minute')].filter(Boolean).join(' ')
}

export type MomentRecapProps = {
  /** Yours as the room knew you: your photo if you were named there, else your creature. Decorative. */
  face: MomentFace
  /** The event's title, and its venue. */
  title: string
  venue?: string | null
  /** Minutes in the room, to the event's end; null when the check-in time is unknown (no tile then). */
  minutes: number | null
  matches: number
  /** You have rated this night: say thanks once and offer nothing else. */
  rated: boolean
  /** Rate who you met, or the night when you matched with nobody: never a dead end. */
  onRate: () => void
  /** Back to tonight. */
  onBack: () => void
  /** The overlay's close (chevron down), when the Recap is inside it. */
  onClose?: () => void
  /** Hold the orbs' drift: the screen is not focused, or the overlay is closing over it. */
  paused?: boolean
  testID?: string
}

/**
 * That's a wrap (guidelines/components/MomentRecap.html, Flow 4, motion #43):
 * the Room once the event is over. Your face, "It's over · That's a wrap", two
 * tiles (time in the room, matches), then Rate who you met (or Rate the night)
 * and Back to tonight. A brand screen: the orbs and the grain behind it.
 *
 * #43: after the disc drains, the title fades and rises 8 pt and the blocks
 * follow 28 ms apart; the numbers arrive already set (no count-up). No haptic
 * on open; Rate is the screen's primary (`H.primary`). Announced once, read
 * face (decorative) → title → tiles → actions.
 *
 * Reduce Motion: fade only.
 */
export function MomentRecap({ face, title, venue, minutes, matches, rated, onRate, onBack, onClose, paused = false, testID }: MomentRecapProps) {
  const reduceMotion = useReducedMotion()
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const insets = useSafeAreaInsets()
  const where = venue ? `${title} · ${venue}` : title

  useEffect(() => {
    AccessibilityInfo.announceForAccessibilityWithOptions(`That’s a wrap. ${venue ? `${title}, ${venue}` : title}.`, { queue: true })
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tiles: { label: string; value: string; spoken: string }[] = [
    ...(minutes === null ? [] : [{ label: 'In the room', value: timeSpentLabel(minutes * 60_000), spoken: spokenMinutes(Math.floor(minutes)) }]),
    { label: 'Matches', value: String(matches), spoken: String(matches) },
  ]
  const blocks = (i: number) => ({ index: i, reduceMotion, testID: testID && `${testID}-block-${i}` })

  return (
    <View testID={testID} style={styles.page}>
      <Orbs set="brand" paused={paused} />
      <Grain />
      {onClose ? (
        <View style={[styles.close, { top: barTop(insets.top) }]}>
          <IconButton icon="chevron-down" accessibilityLabel="Close" onPress={onClose} testID={testID && `${testID}-close`} />
        </View>
      ) : null}
      <View style={[styles.body, { paddingTop: insets.top + SIZE.circleButton + SPACE.xl }]}>
        <Block {...blocks(0)} style={styles.head}>
          <Avatar {...face} size={FACE} ring={COLOR.ink} testID={testID && `${testID}-face`} />
          <View style={styles.titles}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.label} style={[font('label', bold), { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>
              IT’S OVER
            </Text>
            <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE.moment} style={[font('moment', bold), styles.centre]}>
              That’s a wrap
            </Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} numberOfLines={2} style={[font('meta', bold), styles.centre, { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>
              {where}
            </Text>
          </View>
        </Block>
        <View style={styles.tiles}>
          {tiles.map((t, i) => (
            <Block key={t.label} {...blocks(i + 1)} style={[styles.tile, contrast && IC_HAIRLINE]}>
              <View accessible accessibilityLabel={`${t.label}, ${t.spoken}`}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE.label} style={[font('label', bold), { color: contrast ? COLOR.textPrimary : COLOR.textTertiary }]}>
                  {t.label.toUpperCase()}
                </Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE.numericDisplay} style={[font('title', bold, FONT_FAMILY.mono[700]), styles.number]}>
                  {t.value}
                </Text>
              </View>
            </Block>
          ))}
        </View>
      </View>
      <Block {...blocks(tiles.length + 1)} style={[styles.actions, { paddingBottom: insets.bottom + SPACE.xl }]}>
        {rated ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.centre, { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>
            You rated this night. Thanks.
          </Text>
        ) : (
          <Button label={matches > 0 ? 'Rate who you met' : 'Rate the night'} onPress={onRate} testID={testID && `${testID}-rate`} />
        )}
        <Button label="Back to tonight" kind="secondary" onPress={onBack} testID={testID && `${testID}-back`} />
      </Block>
    </View>
  )
}

/** #43: one block of the entrance, `index` × 28 ms in; it rises 8 pt as it fades (fade only under Reduce Motion). */
function Block({ index, reduceMotion, testID, style, children }: { index: number; reduceMotion: boolean; testID?: string; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const { duration, rise } = motionTokens(reduceMotion)
  const p = useSharedValue(0)
  useEffect(() => {
    p.set(fade(1, duration.base, STAGGER.base * index, 'entrance'))
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const appear = useAnimatedStyle(() => ({ opacity: p.get(), transform: [{ translateY: (1 - p.get()) * rise.list }] }))
  return (
    <Animated.View testID={testID} style={[style, appear]}>
      {children}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLOR.ink },
  close: { position: 'absolute', left: SPACE.lg, zIndex: 1 },
  body: { flex: 1, paddingHorizontal: SPACE.gutter, gap: SPACE.xl },
  head: { alignItems: 'center', gap: SPACE.lg },
  titles: { alignItems: 'center', gap: SPACE.sm },
  centre: { textAlign: 'center', color: COLOR.textPrimary },
  tiles: { flexDirection: 'row', gap: SPACE.md },
  tile: { flex: 1, borderRadius: RADIUS.rowInCard, backgroundColor: COLOR.surface, paddingVertical: SPACE.md, paddingHorizontal: SPACE.lg },
  number: { color: COLOR.textPrimary, marginTop: SPACE.sm, fontVariant: [...NUMERIC.fontVariant] },
  actions: { paddingHorizontal: SPACE.gutter, gap: SPACE.sm },
})
