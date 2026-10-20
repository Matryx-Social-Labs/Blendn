import { Image } from 'expo-image'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native'
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedProps, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'

import { Icon } from '../ui/Icon'
import { Material } from '../ui/Material'
import { COLOR, FONT_FAMILY, ICON, MATERIAL, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { tint } from '../../lib/theme'
import { HoldToConfirm } from './HoldToConfirm'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, useBoldText, useIncreaseContrast } from './shared'

const THUMB = SIZE.primary
/** The tease's "?" discs: three at 32, overlapping by 8, ringed in 80% ink. */
const TEASE_DISC = SIZE.tag
const TEASE_SHOWN = 3
const TEASE_RING = tint(COLOR.ink, 0.8)

export type VenuePassProps = {
  title: string
  cover?: string | null
  hereCount: number
  /** "N people here share your taste": a count from the server (never under three), never who. */
  tasteCount?: number | null
  /** "Hold to switch" when checking in here takes you out of another room (ROUND3 4.8). */
  holdLabel?: string
  /** The consequence under the hold, and its hint. */
  note?: string
  onConfirm: () => void
  busy?: boolean
  busyLabel?: string
  refused?: boolean
  /** The server said yes (#9): the hold stays full under "You’re in". */
  confirmed?: boolean
  /** The pour (MomentPour, #9), mounted in the panel so its flood rises through it and is clipped to it. */
  pour?: ReactNode
  /** Under the hold, over the note: "Tell your crew" after the server's yes (Flow 4 delta R2-D1 "success"; the pass grows to hold it). */
  children?: ReactNode
  /** Outside the fence: the hold dims under `holdLabel` ("Go live when you’re here · 350 m"). */
  disabled?: boolean
  /** The design gallery only: the hold frozen this far in. */
  previewProgress?: number
  testID?: string
}

/**
 * The pass that appears when the phone is inside the event's fence
 * (guidelines/components/VenuePass.html): a sheet-tier panel (glass on iOS,
 * solid on Android and under Reduce Transparency) pinned above the tab bar.
 * The thumb, the Geist Mono "You're here", the title, how many are inside,
 * three "?" discs with "N people here share your taste" (never who), then the
 * HoldToConfirm and the consequence in one line.
 *
 * Its haptics are the hold's: `H.tick` ×3, `H.commit`, `H.error` on a refusal
 * (the fill drains, #10). On the server's yes (#9, the Flow 4 prototype) the
 * hold reads "You're in" and the screen mounts the pour in `pour`: its flood
 * rises through this panel and plays `H.success` (it is MomentPour's, not a
 * second one here). Read: "You're here. {title}. {N} inside now."
 * then the tease, then the hold, whose hint is the consequence. The panel
 * grows with its text; only the pill is fixed. Increase Contrast: the 50%
 * hairline.
 */
export function VenuePass({
  title,
  cover,
  hereCount,
  tasteCount,
  holdLabel = 'Hold to blend in',
  note = 'Checks you in. Other people at this event will see you.',
  onConfirm,
  busy,
  busyLabel = 'Checking you in…',
  refused,
  confirmed,
  pour,
  children,
  disabled,
  previewProgress,
  testID,
}: VenuePassProps) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const inside = hereCount > 0 ? `${hereCount} inside now` : 'Be the first one in'
  const tease = tasteCount && tasteCount > 0 ? `${tasteCount} ${tasteCount === 1 ? 'person' : 'people'} here share your taste` : null

  return (
    <View testID={testID} style={styles.pass}>
      <Material role="sheet" style={[StyleSheet.absoluteFill, styles.radius]} />
      <View accessible accessibilityLabel={`You’re here. ${title}. ${inside}.`} style={styles.head}>
        <View testID={testID && `${testID}-thumb`} style={styles.thumb}>
          {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} /> : null}
        </View>
        <View style={styles.headText}>
          <Text style={[font('label', bold), styles.secondary]}>YOU’RE HERE</Text>
          <Text numberOfLines={1} style={[font('title', bold), styles.primary]}>
            {title}
          </Text>
          <Text style={[font('meta', bold), styles.secondary]}>
            {hereCount > 0 ? (
              <>
                <Text style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.primary, styles.tabular]}>{hereCount}</Text> inside now
              </>
            ) : (
              inside
            )}
          </Text>
        </View>
      </View>
      {tease ? (
        <View accessible accessibilityLabel={tease} style={styles.tease}>
          <View style={styles.discs}>
            {Array.from({ length: TEASE_SHOWN }, (_, i) => (
              <View key={i} style={[styles.disc, i > 0 && styles.overlap]}>
                <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.secondary]}>
                  ?
                </Text>
              </View>
            ))}
          </View>
          <Text style={[font('meta', bold), styles.secondary, styles.shrink]}>{tease}</Text>
        </View>
      ) : null}
      <HoldToConfirm
        label={holdLabel}
        consequence={note}
        srLabel="Check in"
        onConfirm={onConfirm}
        busy={busy}
        busyLabel={busyLabel}
        refused={refused}
        confirmedLabel={confirmed ? 'You’re in' : undefined}
        disabled={disabled}
        previewProgress={previewProgress}
        testID={testID && `${testID}-hold`}
      />
      {children}
      {/* The hold's hint already says it: the line is for the eye. */}
      <Text accessibilityElementsHidden importantForAccessibility="no" style={[font('caption', bold), styles.secondary, styles.note]}>
        {note}
      </Text>
      {pour ? <View style={StyleSheet.absoluteFill}>{pour}</View> : null}
      {contrast ? <View testID={testID && `${testID}-contrast`} pointerEvents="none" style={[StyleSheet.absoluteFill, styles.radius, IC_HAIRLINE]} /> : null}
    </View>
  )
}

/** The code turns every 30 s on the server (`lib/offers/pass-code.ts`). */
const CODE_PERIOD_S = 30
const RING = 36
const RING_STROKE = SPACE.xxs
/** The seconds beside the ring change once a second; the ring itself drains on the UI thread, and the code comes from the server. */
const TICK_MS = 1000
const AnimatedCircle = Animated.createAnimatedComponent(Circle)

/** "K7QM2X" → "K7Q M2X"; read "K 7 Q, M 2 X". */
const grouped = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`
const spoken = (code: string) => `Door code ${[...code.slice(0, 3)].join(' ')}, ${[...code.slice(3)].join(' ')}`

const STILL = {
  redeemed: { code: '· · ·', line: (at?: string) => (at ? `Redeemed ${at}` : 'Redeemed') },
  used: { code: '· · ·', line: () => 'Used tonight' },
  ended: { code: '— — —', line: () => 'This offer ended' },
} as const

export type DoorCodeProps = {
  /** `GET /offers/:id`'s pass states, plus `offline` (no connection, so no code). */
  state: 'live' | 'offline' | 'redeemed' | 'used' | 'ended'
  /** The server's six characters. */
  code?: string
  /** When this code turns (ms since the epoch). */
  rotatesAt?: number
  /** "21:43". */
  redeemedAt?: string
  /** The label of an ended pass ("ENDED SUNDAY"). */
  endedLabel?: string
  /** False while another screen covers it: no ticking, no announcing to someone elsewhere. */
  active?: boolean
  testID?: string
}

/**
 * The door pass's code (ROUND3 G3, guidelines/round3/r3g.js): staff type the
 * six characters on the venue dashboard and tap Redeemed, so nothing is held
 * on the phone. The code is large, in Geist Mono, beside a 30-second ring
 * that drains to its next turn; offline there is no code ("This pass needs a
 * connection to show its code."). Redeemed, used tonight and ended are still.
 *
 * The ring and the code change stay under Reduce Motion (they are the pass's
 * security function, WCAG 2.2.2's essential motion); the code swaps with no
 * animation. Read as six characters in two groups, and again when it changes;
 * the ring is not read. No haptic (`H.success` on the server's redeem is the
 * screen's).
 */
export function DoorCode({ state, code = '', rotatesAt = 0, redeemedAt, endedLabel, active = true, testID }: DoorCodeProps) {
  const bold = useBoldText()
  const live = state === 'live' && code.length > 0
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!live || !active) return
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [live, active])

  const announced = useRef(code)
  useEffect(() => {
    if (!live || announced.current === code) return
    announced.current = code
    if (active) AccessibilityInfo.announceForAccessibility(spoken(code))
  }, [live, active, code])

  /*
   * The ring drains from where this code is now to empty at its turn, in one
   * linear run on the UI thread (constant motion; the pass's security function,
   * so Reduce Motion keeps it): React is not re-rendered to move it.
   */
  const fraction = useSharedValue(1)
  useEffect(() => {
    if (!live || !active) {
      cancelAnimation(fraction)
      return
    }
    const leftMs = Math.max(0, rotatesAt - Date.now())
    fraction.set(Math.min(1, leftMs / (CODE_PERIOD_S * 1000)))
    fraction.set(withTiming(0, { duration: leftMs, easing: Easing.linear, reduceMotion: ReduceMotion.Never }))
    return () => cancelAnimation(fraction)
  }, [live, active, rotatesAt, code, fraction])

  const left = Math.min(CODE_PERIOD_S, Math.max(0, Math.ceil((rotatesAt - now) / 1000)))
  const still = state === 'redeemed' || state === 'used' || state === 'ended' ? STILL[state] : null
  const codeFont = [font('display', bold, FONT_FAMILY.mono[700]), styles.code]
  const label = state === 'ended' && endedLabel ? endedLabel : 'DOOR CODE'

  return (
    <View testID={testID} style={styles.door}>
      <View
        accessible
        accessibilityLabel={
          live
            ? spoken(code)
            : state === 'offline'
              ? 'Door code unavailable. This pass needs a connection to show its code.'
              : `${label}. ${still?.line(redeemedAt) ?? ''}`
        }
        style={styles.doorText}
      >
        <Text style={[font('label', bold), styles.secondary]}>{label}</Text>
        {live ? (
          <Text style={[...codeFont, styles.primary]}>{grouped(code)}</Text>
        ) : (
          <Text style={[...codeFont, styles.tertiary]}>{still?.code ?? '··· ···'}</Text>
        )}
        <Text style={[font('meta', bold), styles.secondary]}>
          {live ? `Changes every ${CODE_PERIOD_S} s · Today only` : still ? still.line(redeemedAt) : 'Today only'}
        </Text>
      </View>
      {live ? (
        <View testID={testID && `${testID}-ring`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.ringCol}>
          <CountdownRing fraction={fraction} />
          <Text style={[font('caption', bold, FONT_FAMILY.mono[500]), styles.secondary, styles.tabular]}>{`${left} s`}</Text>
        </View>
      ) : state === 'offline' ? (
        <View testID={testID && `${testID}-offline`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.well}>
          <Icon name="wifi-off" size={ICON.control} color={COLOR.textSecondary} />
        </View>
      ) : null}
    </View>
  )
}

/** A 36 pt ring that drains clockwise from the top: 16% white track, white arc. */
function CountdownRing({ fraction }: { fraction: SharedValue<number> }) {
  const r = RING / 2 - RING_STROKE
  const c = 2 * Math.PI * r
  const arc = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - fraction.get()) }))
  return (
    <Svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} style={styles.ring}>
      <Circle cx={RING / 2} cy={RING / 2} r={r} fill="none" stroke={COLOR.hairlineStrong} strokeWidth={RING_STROKE} />
      <AnimatedCircle
        cx={RING / 2}
        cy={RING / 2}
        r={r}
        fill="none"
        stroke={COLOR.textPrimary}
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        strokeDasharray={c}
        animatedProps={arc}
      />
    </Svg>
  )
}

const styles = StyleSheet.create({
  pass: { borderRadius: RADIUS.sheet, padding: SPACE.lg, gap: SPACE.md, overflow: 'hidden' },
  radius: { borderRadius: RADIUS.sheet },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  thumb: { width: THUMB, height: THUMB, borderRadius: RADIUS.thumb, overflow: 'hidden', backgroundColor: COLOR.surfaceSunken },
  headText: { flex: 1, minWidth: 0 },
  primary: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  tertiary: { color: COLOR.textTertiary },
  tabular: { fontVariant: ['tabular-nums'] },
  tease: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: TEASE_DISC },
  discs: { flexDirection: 'row' },
  disc: {
    width: TEASE_DISC,
    height: TEASE_DISC,
    borderRadius: RADIUS.capsule,
    backgroundColor: MATERIAL.fillOnGlass,
    borderWidth: SPACE.xxs,
    borderColor: TEASE_RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlap: { marginLeft: -SPACE.sm },
  shrink: { flexShrink: 1 },
  note: { textAlign: 'center' },
  door: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  doorText: { flex: 1, minWidth: 0, gap: SPACE.xxs },
  code: { letterSpacing: SPACE.xxs, fontVariant: ['tabular-nums'] },
  ringCol: { alignItems: 'center', gap: SPACE.xs },
  ring: { transform: [{ rotate: '-90deg' }] },
  well: {
    width: RING,
    height: RING,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
