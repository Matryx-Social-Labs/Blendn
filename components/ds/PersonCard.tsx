import { useEffect, useRef, useState, type ComponentProps, type ComponentRef, type ReactNode, type RefObject } from 'react'
import { AccessibilityInfo, Platform, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'

import ScalePress from '../motion/ScalePress'
import { Icon, type IconName } from '../ui/Icon'
import { COLOR, FONT_FAMILY, ICON, MATERIAL, PRESS, RADIUS, SIZE, SPACE, SPRING, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useReducedMotion } from '../../lib/motion'
import type { LeadPill } from '../../lib/roomLens'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { LensBlocks } from './LensBlocks'
import { CrewEmblem } from './CrewEmblem'
import type { Face } from './Facepile'
import { Sheet } from './Sheet'
import { announceOutcome, CONTROL_FONT_CAP, focusRing, font, minTarget, PRESSED_WASH, useBoldText, useIncreaseContrast, useLargeText, useSelection } from './shared'
import { StateScreen } from './StateScreen'

/** ROUND3 D · 4.1: here now · was here · pre-event room · matched · friend · unavailable · thin. */
export type PersonVariant = 'here' | 'was' | 'pre' | 'matched' | 'friend' | 'gone' | 'thin'
export type PersonState = 'none' | 'liked' | 'requested' | 'waveBusy' | 'waved'

export type PersonCardPerson = {
  face: Face
  /** The name the room shows you: the pseudonym unless they're named to you. */
  name: string
  age?: number
  /** Flow 5 P-A, from `lensView`: "Anonymous · 31" under the name. Absent: the age alone. */
  meta?: string
  /** "In the room at …" or, on a venue night, "At {place}, {city}": the sheet's first line. */
  context?: string | null
  /** The thin card's city. */
  city?: string
  /** What this room's lens leads with (`leadFor`); the reason to meet is lit. */
  lead?: LeadPill[]
  /** Tonight's question and their answer (`tonightCardFor`); null when the room asks nothing or they have not answered. */
  tonight?: { question: string; answer: string } | null
  /** "In common" or "Things in common", and what you share (`commonFor`). */
  common?: { label: string; items: readonly string[] }
}

export type PersonCardContentProps = {
  person: PersonCardPerson
  variant: PersonVariant
  /** Matched and friend: checked in here now, so the card says so. A here-now card always is. */
  here?: boolean
  state?: PersonState
  /**
   * The states one at a time, as the gallery draws them, or each on its own:
   * in a room someone can be liked, waved at and requested all at once, and
   * one never hides another. Either form sets it.
   */
  liked?: boolean
  requested?: boolean
  /** A wave on its way: the hand waves (#51). */
  waving?: boolean
  waved?: boolean
  /** They waved at you this long ago ("2 min"): the still chip, and Wave reads Wave back (4.2). Kept on the phone, gone after 10 minutes. */
  wavedAtYou?: string
  /** A like or wave the server refused (4.3): one neutral line, never naming the action, maybe with its action. No haptic. */
  refusal?: { text: string; action?: { label: string; onPress: () => void } }
  /**
   * A crew of yours is here (R2-D1, Flow 10 §10.7): the like is the crew's,
   * "Like for {crew}" with its emblem, and "Like as yourself" (`onLike`) under
   * the row. The note says who they would see.
   */
  crewLike?: { name: string; emblemSeed?: string; onPress: () => void }
  onLike?: () => void
  onWave?: () => void
  /** The ConnectSheet: a request that reveals you; a friend's DM for a friend. */
  onMessage?: () => void
  onSayHi?: () => void
  /** ⋯: Block and Report. */
  onMore?: () => void
  onViewProfile?: () => void
  /** The unavailable card's Close. */
  onClose?: () => void
  /** The sheet's focus target: the head, read first as the card opens (`PersonCard` passes it). */
  headRef?: RefObject<ComponentRef<typeof View> | null>
  testID?: string
}

/** P-A `personSheet`: the 72 pt face beside the name. */
const FACE = 72
/** #15: a Like button pops 0.85 → 1 on `M.pop` as it turns to Liked. */
const LIKE_POP_FROM = 0.85

const PRE_EVENT = 'You can only message people from an event you have both attended.'

/**
 * The person sheet (Flow 5 P-A, `pA-*` in element-boxes.json): one sheet from every entry point (a grid face, Meet
 * next, a chat name, a long-press, a room member, the wave row and banner), the same person through the room's lens.
 * In reading order: the context line, the 72 pt face with the name and "Anonymous · 31" (the head, which opens their
 * profile) and ⋯ (Block / Report), the lead pills, Tonight's question with their answer, In common, then the actions.
 * What the row offers depends on who they are to you, never on why the roster didn't list them (the thin card).
 *
 * - Wave · Message · Like, level at 52 (the board's `.db`); Like is lit, `H.like` once; Liked is a still lit pill.
 *   Say hi (matched): `H.primary`. Wave (here now only) is silent (#51); busy, the hand waves; then a still "Waved".
 *   Waved at you: a still chip and Wave back. Message (the ConnectSheet reveals you) or a still Requested.
 * - At the largest text the actions stack (NOTES § Person sheet).
 *
 * The sheet renders only what the caller sent for THIS person (`lensView` over their deck card): it never reaches for
 * the viewer's own profile, so an anonymous person shows no name, photo, bio or employer. iOS draws its panels in 8%
 * white on the glass sheet, Android in surfaceSunken on the solid one.
 */
export function PersonCardContent({
  person,
  variant,
  here = false,
  state = 'none',
  liked = false,
  requested = false,
  waving = false,
  waved = false,
  wavedAtYou,
  refusal,
  crewLike,
  onLike,
  onWave,
  onMessage,
  onSayHi,
  onMore,
  onViewProfile,
  onClose,
  headRef,
  testID,
}: PersonCardContentProps) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const reduceMotion = useReducedMotion()
  const large = useLargeText()
  const isLiked = liked || state === 'liked'
  const isRequested = requested || state === 'requested'
  const waveBusy = waving || state === 'waveBusy'
  const isWaved = waved || state === 'waved'
  const likedStyle = useLikedPop(isLiked, reduceMotion)

  // 4.3: the refusal is read as it arrives, or a screen reader hears nothing happen.
  const refusalText = refusal?.text
  useEffect(() => {
    if (refusalText) AccessibilityInfo.announceForAccessibility(refusalText)
  }, [refusalText])
  const panel = Platform.OS === 'android' ? COLOR.surfaceSunken : MATERIAL.fillOnGlass
  /** Liked and Waved are lit, never white (direction C: no white selection): the hue's fill, its 1 pt rim, the glyph in its light tone. */
  const sel = useSelection()
  const lit = { backgroundColor: sel.fill, borderColor: sel.edge }
  const quiet = contrast ? COLOR.textPrimary : COLOR.textSecondary
  const { name, age } = person
  // Waved is said as it lands, once (a card opened already waved says nothing): iOS announces it, Android's row is a live region.
  const wasWaved = useRef(isWaved)
  useEffect(() => {
    if (isWaved && !wasWaved.current) announceOutcome(`Waved at ${name}`)
    wasWaved.current = isWaved
  }, [isWaved, name])
  const id = (part: string) => testID && `${testID}-${part}`

  if (variant === 'gone') {
    return (
      <StateScreen
        icon="user"
        title="This profile isn’t available."
        body="It may have been removed, or one of you has blocked the other."
        actions={[{ label: 'Close', kind: 'secondary', onPress: () => onClose?.() }]}
        testID={testID}
      />
    )
  }

  const thin = variant === 'thin'
  const presence = variant === 'was' ? 'Was here' : variant === 'pre' ? 'Going' : null
  // P-A's meta line ("Anonymous · 31") when the caller put the person through the lens; else the plain age.
  const meta = thin ? [person.meta ?? age, person.city].filter((x) => x != null && x !== '').join(' · ') : (person.meta ?? (age ? String(age) : ''))
  const heading = [name, meta.replace(/ · /g, ', '), variant === 'friend' ? 'friend' : null, presence?.toLowerCase()]
    .filter((p) => p != null && p !== '')
    .join(', ')
  const note =
    variant === 'pre'
      ? PRE_EVENT
      : variant === 'friend'
        ? `Message opens your chat with ${name}.`
        : isRequested && variant !== 'matched'
        ? `Request sent to ${name}. They’ll see your name and photo.`
        : crewLike && !isLiked && (variant === 'here' || variant === 'was')
          ? `A crew like is shown to ${name} as ${crewLike.name}, never as you.`
          : null
  const lead = thin ? [] : (person.lead ?? [])
  const common = thin ? undefined : person.common
  const tonight = thin ? null : person.tonight

  const circle = (icon: IconName, label: string, onPress?: () => void) => (
    <Control
      testID={id(icon)}
      radius={RADIUS.capsule}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.circle, { backgroundColor: panel }]}
    >
      <Icon name={icon} size={ICON.control} />
    </Control>
  )
  /** A still state in an action's place (Liked, Waved, Requested): lit or quiet, the action row's height. */
  const still = (part: string, icon: IconName, label: string, spoken: string, on: boolean, style?: StyleProp<ViewStyle>) => (
    <Animated.View
      testID={id(part)}
      accessible
      accessibilityRole={part === 'liked' ? 'button' : undefined}
      accessibilityLabel={spoken}
      accessibilityState={on ? { selected: true } : undefined}
      style={[styles.pill, on ? [styles.lit, lit] : { backgroundColor: panel }, style]}
    >
      <Icon name={icon} size={ICON.control} color={on ? sel.glyph : COLOR.textSecondary} active={on} />
      <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} numberOfLines={1} style={[font('button', bold), on ? styles.ink : styles.secondary]}>
        {label}
      </Text>
    </Animated.View>
  )
  const row = [styles.actions, large && styles.actionsStacked]
  // Stacked, an action is its own height: a zero flex-basis in a column collapses the pill behind its label (Android, 2.0).
  const slot = large ? styles.stackedSlot : styles.slot

  return (
    <View testID={testID} style={styles.card}>
      {wavedAtYou ? (
        <View style={[styles.waveChip, { backgroundColor: panel }]}>
          <Icon name="hand" size={ICON.inline} />
          <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('caption', bold), styles.ink]}>{`Waved at you · ${wavedAtYou}`}</Text>
        </View>
      ) : null}

      {person.context && !thin ? (
        <Text testID={id('context')} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('note', bold), { color: quiet }]}>
          {person.context}
        </Text>
      ) : null}

      <View style={styles.headRow}>
        {/* The head is the sheet's focus target, read first; it opens their profile (the board draws no separate link). */}
        <Pressable
          ref={headRef}
          testID={id('head')}
          onPress={onViewProfile}
          disabled={!onViewProfile}
          accessibilityRole="header"
          accessibilityLabel={heading}
          accessibilityHint={onViewProfile ? 'Opens their profile' : undefined}
          style={styles.head}
        >
          <Avatar size={FACE} ring={COLOR.ink} testID={id('face')} blink {...person.face} />
          <View style={styles.headText}>
            <Text testID={id('name')} maxFontSizeMultiplier={MAX_FONT_SCALE.title} style={[font('title', bold), styles.ink]}>
              {name}
            </Text>
            {meta ? (
              <Text testID={id('meta')} maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.metaLine, { color: quiet }]}>
                {meta}
              </Text>
            ) : null}
            {presence || variant === 'friend' ? (
              <View style={styles.inline}>
                <Icon name={variant === 'was' ? 'clock' : variant === 'pre' ? 'calendar' : 'user-check'} size={ICON.inline} color={COLOR.textSecondary} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} style={[font('caption', bold), { color: quiet }]}>{presence ?? 'Friend'}</Text>
              </View>
            ) : null}
          </View>
        </Pressable>
        {circle('ellipsis', `Block or report ${name}`, onMore)}
      </View>

      <LensBlocks lead={lead} tonight={tonight} common={common} testID={testID} />

      <View testID={id('actions')} accessibilityLiveRegion="polite" style={row}>
        {variant === 'matched' ? (
          <Button label="Say hi" size="dock" onPress={onSayHi} style={slot} testID={id('say-hi')} />
        ) : null}

        {variant === 'here' ? (
          isWaved ? (
            still('waved', 'check', 'Waved', 'Waved', true, slot)
          ) : (
            <Button
              label={wavedAtYou && !waveBusy ? 'Wave back' : 'Wave'}
              kind="secondary"
              onGlass
              size="dock"
              leading={waveBusy ? <WavingHand testID={id('hand-waving')} /> : <Icon name="hand" size={ICON.control} />}
              disabled={waveBusy}
              pressHaptic={false}
              accessibilityLabel={wavedAtYou && !waveBusy ? `Wave back at ${name}` : `Wave at ${name}`}
              onPress={onWave}
              style={slot}
              testID={id(wavedAtYou && !waveBusy ? 'wave-back' : 'wave')}
            />
          )
        ) : null}

        {variant === 'pre' || variant === 'matched' ? null : isRequested ? (
          still('requested', 'check', 'Requested', `Request sent to ${name}`, false, slot)
        ) : (
          <Button
            label="Message"
            kind="secondary"
            onGlass
            size="dock"
            icon="message-circle"
            pressHaptic={false}
            accessibilityHint={variant === 'friend' ? undefined : 'Sends a request, which shows them your name and photo.'}
            onPress={onMessage}
            style={slot}
            testID={id('message')}
          />
        )}

        {variant === 'here' || variant === 'was' ? (
          isLiked ? (
            <Animated.View style={[slot, likedStyle]}>{still('liked', 'heart', 'Liked', 'Liked', true)}</Animated.View>
          ) : crewLike ? (
            <Button
              label={`Like for ${crewLike.name}`}
              kind="lit"
              size="dock"
              leading={crewLike.emblemSeed ? <CrewEmblem seed={crewLike.emblemSeed} size={ICON.nav} /> : undefined}
              icon={crewLike.emblemSeed ? undefined : 'heart'}
              pressHaptic={false}
              accessibilityHint={`${name} sees ${crewLike.name}, never you, and only if they like back.`}
              onPress={() => {
                H.like()
                crewLike.onPress()
              }}
              style={styles.crewLike}
              testID={id('like-crew')}
            />
          ) : (
            <Button
              label="Like"
              kind="lit"
              size="dock"
              leading={<Icon name="heart" size={ICON.control} color={sel.glyph} />}
              pressHaptic={false}
              accessibilityHint="They’re only told if they like you back."
              onPress={() => {
                H.like()
                onLike?.()
              }}
              style={slot}
              testID={id('like')}
            />
          )
        ) : null}
      </View>

      {crewLike && !isLiked && (variant === 'here' || variant === 'was') ? (
        <View style={styles.center}>
          <TextAction
            label="Like as yourself"
            onPress={() => {
              H.like()
              onLike?.()
            }}
            testID={id('like-as-yourself')}
          />
        </View>
      ) : null}

      {refusal ? (
        <View style={styles.refusal}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.ink, styles.shrink]}>{refusal.text}</Text>
          {refusal.action ? <TextAction label={refusal.action.label} onPress={refusal.action.onPress} testID={id('refusal-action')} /> : null}
        </View>
      ) : null}

      {note ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} style={[font('caption', bold), styles.note, { color: quiet }]}>{note}</Text> : null}
    </View>
  )
}

/** #51: a wave's hand rotates ±14° twice over 600 ms, once. Reduce Motion: still. */
const WAVE_DEGREES = 14
const WAVE_MS = 600
const WAVE_TURNS = 2

export function WavingHand({ testID, size = ICON.control }: { testID?: string; size?: number }) {
  const reduceMotion = useReducedMotion()
  const t = useSharedValue(0)
  useEffect(() => {
    if (!reduceMotion) t.set(withTiming(1, { duration: WAVE_MS, easing: Easing.linear }))
  }, [reduceMotion, t])
  const turn = useAnimatedStyle(() => ({ transform: [{ rotate: `${WAVE_DEGREES * Math.sin(t.get() * Math.PI * 2 * WAVE_TURNS)}deg` }] }))
  return (
    <Animated.View testID={testID} style={turn}>
      <Icon name="hand" size={size} />
    </Animated.View>
  )
}

/** #15: Like turns to Liked with a pop, 0.85 → 1 on `M.pop`; Reduce Motion places it. */
function useLikedPop(liked: boolean, reduceMotion: boolean) {
  const scale = useSharedValue(1)
  const last = useRef(liked)
  useEffect(() => {
    const was = last.current
    last.current = liked
    if (reduceMotion || was === liked || !liked) return
    scale.set(LIKE_POP_FROM)
    scale.set(withSpring(1, SPRING.pop))
  }, [liked, reduceMotion, scale])
  return useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }))
}

/**
 * A control the card draws itself (the circles, Wave back, the text actions):
 * iOS scales on `M.press`, Android ripples without scaling, and a keyboard or
 * Switch Control focus draws the ring, as Button and IconButton do.
 */
function Control({ radius, testID, style, children, ...press }: ComponentProps<typeof ScalePress> & { radius: number; children: ReactNode }) {
  const android = Platform.OS === 'android'
  const [focused, setFocused] = useState(false)
  return (
    <View>
      <ScalePress
        testID={testID}
        {...press}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        pressedScale={android ? 1 : PRESS.scale}
        android_ripple={{ color: PRESSED_WASH.android, foreground: true }}
        style={style}
      >
        {children}
      </ScalePress>
      {focused
        ? focusRing(radius).map((ring, i) => (
            <View key={i} testID={i ? undefined : testID && `${testID}-focus`} pointerEvents="none" style={ring} />
          ))
        : null}
    </View>
  )
}

/** A row-scale text action: 700 14 white on a 44 / 48 target (the R3 ruling). Silent. */
function TextAction({ label, onPress, testID }: { label: string; onPress?: () => void; testID?: string }) {
  const bold = useBoldText()
  return (
    <Control
      testID={testID}
      radius={RADIUS.thumb}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.textAction, { minHeight: minTarget() }]}
    >
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.ink]}>{label}</Text>
    </Control>
  )
}

/**
 * The PersonCard as the L3 sheet: glass at a partial height on iOS (medium,
 * draggable to tall), solid on Android; it scrolls past its height. No haptic
 * on opening; it rises on `M.travel` (the Sheet). The face's travel from the
 * grid cell (#33) is the screen's.
 */
export function PersonCard({
  visible,
  onClose,
  onDismissed,
  testID,
  ...card
}: PersonCardContentProps & { visible: boolean; onClose: () => void; onDismissed?: () => void }) {
  const head = useRef<ComponentRef<typeof View>>(null)
  return (
    // P-A's actions sit on the home-indicator inset alone (34 on the board), not the sheet's usual inset + 8.
    <Sheet visible={visible} onClose={onClose} onDismissed={onDismissed} flush focusRef={head} testID={testID}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody}>
        <PersonCardContent {...card} onClose={onClose} headRef={head} testID={testID && `${testID}-card`} />
      </ScrollView>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  card: { gap: SPACE.lg },
  waveChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    height: SIZE.tag,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.capsule,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  /** `personName` sits 14 right of the 72 face. */
  head: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: SPACE.md + SPACE.xxs },
  headText: { flex: 1, minWidth: 0 },
  metaLine: { marginTop: SPACE.xxs },
  inline: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginTop: SPACE.xxs },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  shrink: { flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  actionsStacked: { flexDirection: 'column', alignItems: 'stretch' },
  /** Each action takes an equal share. ponytail: the board's CSS lets Message keep its min-content (115 vs 110 at 393); add a measured min width if that 2 pt matters. */
  slot: { flexGrow: 1, flexBasis: 0 },
  stackedSlot: { alignSelf: 'stretch' },
  crewLike: { flexGrow: 1, flexBasis: '100%' },
  /** The ⋯ in the head: 44 on iOS, 48 on Android. */
  circle: { width: minTarget(), height: minTarget(), borderRadius: RADIUS.capsule, alignItems: 'center', justifyContent: 'center' },
  pill: {
    height: SIZE.tabBarCompact,
    borderRadius: RADIUS.capsule,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.md,
  },
  lit: { borderWidth: 1 },
  refusal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md },
  note: { textAlign: 'center' },
  center: { alignItems: 'center' },
  textAction: { justifyContent: 'center', paddingHorizontal: SPACE.lg },
  /** The focus rings sit 4 pt outside the controls: the scroll gives them the room. */
  scroll: { flexGrow: 0, marginHorizontal: -SPACE.xs },
  scrollBody: { paddingHorizontal: SPACE.xs, paddingTop: SPACE.xs },
})
