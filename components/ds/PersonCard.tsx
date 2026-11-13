import { useEffect, useRef, useState, type ComponentProps, type ComponentRef, type ReactNode, type RefObject } from 'react'
import { AccessibilityInfo, Platform, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'

import ScalePress from '../motion/ScalePress'
import { Icon, type IconName } from '../ui/Icon'
import { COLOR, FONT_FAMILY, ICON, MATERIAL, PRESS, RADIUS, SIZE, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useReducedMotion } from '../../lib/motion'
import type { LeadPill } from '../../lib/roomLens'
import { waveAccessibilityLabel, type WaveStatus } from '../../lib/waves'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { Chip } from './Chip'
import { LensBlocks } from './LensBlocks'
import { CrewEmblem } from './CrewEmblem'
import type { Face } from './Facepile'
import { Sheet } from './Sheet'
import { announceOutcome, CONTROL_FONT_CAP, focusRing, font, minTarget, PRESSED_WASH, useBoldText, useIncreaseContrast, useLargeText, useSelection } from './shared'
import { StateScreen } from './StateScreen'

/** ROUND3 D · 4.1: here now · was here · pre-event room · matched · friend · unavailable · thin. */
export type PersonVariant = 'here' | 'was' | 'pre' | 'matched' | 'friend' | 'gone' | 'thin'
export type PersonState = 'none' | 'requested'

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
  /** State 1 A: a venue night's openers (`lensView`), drawn as chips when there is nothing in common and Message is open. */
  openers?: readonly string[] | null
  /** State 2 B: tonight's question they have not answered, for you to ask once they are shown to you (`lensView`). */
  ask?: string | null
  /** State 2 C, one line: the latest event you have both been to and how many more (`GET /users/:ref/shared-events`). */
  shared?: { latest: string; more: number } | null
  /** State 2 B: a few of their interests, once they are shown to you (their profile's, not only the shared ones). */
  interests?: readonly string[]
}

export type PersonCardContentProps = {
  person: PersonCardPerson
  variant: PersonVariant
  /** Matched and friend: checked in here now, so the card says so. A here-now card always is. */
  here?: boolean
  state?: PersonState
  /** Requested, as `state` or on its own: in a room someone can be waved at and requested at once, and one never hides the other. */
  requested?: boolean
  /** `lib/waves.ts`: Wave → Wave back → ✓ Waved → Say hi (SCRUM-1042). */
  wave?: WaveStatus
  /** They waved at you this long ago ("2 min"), when known: the chip's time. */
  wavedAtYou?: string
  /** A wave the server refused (4.3): one neutral line, never naming the action, maybe with its action. No haptic. */
  refusal?: { text: string; action?: { label: string; onPress: () => void } }
  /**
   * A crew of yours is here (R2-D1, Flow 10 §10.7): "Like for {crew}" as a row under the dock (Wave approval 3: crew
   * Mix likes stay until crew waves ship). The note says who they would see.
   */
  crewLike?: { name: string; emblemSeed?: string; onPress: () => void }
  /** Wave, or Wave back. */
  onWave?: () => void
  /** The ConnectSheet: a request that reveals you; a friend's DM for a friend. */
  onMessage?: () => void
  onSayHi?: () => void
  /** An opener or tonight's question tapped: it goes into Message (the Connect sheet, or the chat once matched); nothing sends. */
  onOpener?: (text: string) => void
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

const PRE_EVENT = 'You can only message people from an event you have both attended.'

/**
 * The person sheet (Flow 5 P-A, `pA-*` in element-boxes.json): one sheet from every entry point (a grid face, Meet
 * next, a chat name, a long-press, a room member, the wave row and banner), the same person through the room's lens.
 * In reading order: the context line, the 72 pt face with the name and "Anonymous · 31" (the head, which opens their
 * profile) and ⋯ (Block / Report), the lead pills, Tonight's question with their answer, In common, then the actions.
 * What the row offers depends on who they are to you, never on why the roster didn't list them (the thin card).
 *
 * - Wave dock A (SCRUM-1042): Wave + Message, level at 52 (the board's `.db`). Wave is lit, `H.select` on the press;
 *   in flight the hand swings; then a still lit "✓ Waved" (no Wave again). They waved at you: the chip "Waved at you ·
 *   4 min" and Wave back, the filled one; it answers until the room closes, so a "was here" card offers it too. You
 *   both waved (matched): the chip "You both waved" and Say hi only (`H.primary`). Message (the ConnectSheet reveals
 *   you) or a still Requested. A crew of yours here: "Like for {crew}" as a row under the dock. No person Like.
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
  requested = false,
  wave = 'none',
  wavedAtYou,
  refusal,
  crewLike,
  onWave,
  onMessage,
  onSayHi,
  onOpener,
  onMore,
  onViewProfile,
  onClose,
  headRef,
  testID,
}: PersonCardContentProps) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const large = useLargeText()
  const isRequested = requested || state === 'requested'
  const waveBusy = wave === 'sending'
  const isWaved = wave === 'waved'
  const atYou = wave === 'wavedAtYou'

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
        : crewLike && (variant === 'here' || variant === 'was')
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
      accessibilityRole={undefined}
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
            {atYou || wave === 'mutual' ? (
              // Wave dock A: the rose chip under the meta line.
              <View testID={id('wave-chip')} style={[styles.waveChip, lit]}>
                <Icon name="hand" size={ICON.inline} color={sel.glyph} />
                <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('caption', bold), { color: sel.glyph }]}>
                  {atYou ? (wavedAtYou ? `Waved at you · ${wavedAtYou}` : 'Waved at you') : 'You both waved'}
                </Text>
              </View>
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

      <LensBlocks
        lead={lead}
        tonight={tonight}
        common={common}
        // An opener needs somewhere to go: Message (the Connect sheet) or Say hi; never a request already sent.
        openers={thin ? null : person.openers}
        onOpener={variant === 'pre' || (isRequested && variant !== 'matched') ? undefined : onOpener}
        ask={thin ? null : person.ask}
        onAsk={variant === 'pre' || (isRequested && variant !== 'matched') ? undefined : onOpener}
        compact
        testID={testID}
      />

      {person.interests?.length && !thin ? (
        <View testID={id('interests')} style={styles.chips}>
          {person.interests.map((t) => <Chip key={t} label={t} lines={2} />)}
        </View>
      ) : null}

      {person.shared && !thin ? (
        <View testID={id('shared')} accessible accessibilityLabel={`You’ve both been to ${person.shared.latest}${person.shared.more ? ` and ${person.shared.more} more` : ''}`} style={styles.sharedLine}>
          <Icon name="calendar" size={ICON.inline} color={COLOR.textSecondary} />
          <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), { color: quiet }, styles.sharedText]}>
            {'You’ve both been to '}
            <Text style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.ink]}>{person.shared.latest}</Text>
          </Text>
          {person.shared.more ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), { color: quiet }]}>{`+${person.shared.more}`}</Text>
          ) : null}
        </View>
      ) : null}

      <View testID={id('actions')} accessibilityLiveRegion="polite" style={row}>
        {variant === 'matched' ? (
          <Button label="Say hi" size="dock" icon="message-circle" onPress={onSayHi} style={slot} testID={id('say-hi')} />
        ) : null}

        {variant === 'here' || (variant === 'was' && atYou) ? (
          isWaved ? (
            still('waved', 'check', 'Waved', `Waved at ${name}`, true, slot)
          ) : (
            <Button
              label={atYou ? 'Wave back' : 'Wave'}
              // Wave is lit; Wave back is the filled one (Wave dock A).
              kind={atYou ? 'primary' : 'lit'}
              size="dock"
              leading={waveBusy ? <WavingHand testID={id('hand-waving')} /> : <Icon name="hand" size={ICON.control} color={atYou ? COLOR.textOnGradient : sel.glyph} />}
              disabled={waveBusy}
              pressHaptic={waveBusy ? false : H.select}
              accessibilityLabel={waveAccessibilityLabel(name, wave)}
              onPress={onWave}
              style={slot}
              testID={id(atYou ? 'wave-back' : 'wave')}
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

      </View>

      {crewLike && (variant === 'here' || variant === 'was') ? (
        // Crew Mix likes stay until crew waves ship (Wave approval 3): a row under the dock, never a third dock button.
        <Control
          testID={id('like-crew')}
          radius={RADIUS.rowInCard}
          onPress={() => {
            H.like()
            crewLike.onPress()
          }}
          accessibilityRole="button"
          accessibilityLabel={`Like for ${crewLike.name}`}
          accessibilityHint={`${name} sees ${crewLike.name}, never you, and only if they like back.`}
          style={styles.crewRow}
        >
          {crewLike.emblemSeed ? <CrewEmblem seed={crewLike.emblemSeed} size={ICON.control} /> : <Icon name="heart" size={ICON.control} color={sel.glyph} />}
          <Text numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.ink, styles.shrink]}>
            {`Like for ${crewLike.name}`}
          </Text>
          <Icon name="chevron-right" size={ICON.inline} color={COLOR.textSecondary} />
        </Control>
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

/** 07-motion: a wave's hand swings ±14° three times over 600 ms (80 → 680 ms), once. Reduce Motion: still. */
const WAVE_DEGREES = 14
const WAVE_MS = 600
const WAVE_TURNS = 3

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
    gap: SPACE.xs,
    minHeight: SIZE.tag,
    marginTop: SPACE.xs,
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS.capsule,
    borderWidth: 1,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  /** `personName` sits 14 right of the 72 face. */
  head: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: SPACE.md + SPACE.xxs },
  headText: { flex: 1, minWidth: 0 },
  metaLine: { marginTop: SPACE.xxs },
  /** State 2 C's one line (combined board): a 16 glyph, 10 to the words, the count at the end. */
  sharedLine: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm + SPACE.xxs },
  sharedText: { flex: 1, minWidth: 0 },
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
  crewRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, minHeight: SIZE.targetIos, paddingVertical: SPACE.xs },
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
