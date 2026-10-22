import { useEffect, useRef, useState, type ComponentProps, type ComponentRef, type ReactNode, type RefObject } from 'react'
import { AccessibilityInfo, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'

import ScalePress from '../motion/ScalePress'
import { Icon, type IconName } from '../ui/Icon'
import { COLOR, FONT_FAMILY, ICON, MATERIAL, PRESS, RADIUS, SIZE, SPACE, SPRING } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useReducedMotion } from '../../lib/motion'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { InterestChip } from './Chip'
import { CrewEmblem } from './CrewEmblem'
import type { Face } from './Facepile'
import { PresenceDot } from './MonoFamily'
import { OverlapLine, type OverlapLabel } from './OverlapLine'
import { Sheet } from './Sheet'
import { CONTROL_FONT_CAP, focusRing, font, minTarget, PRESSED_WASH, useBoldText, useIncreaseContrast, useSelection } from './shared'
import { StateScreen } from './StateScreen'

/** ROUND3 D · 4.1: here now · was here · pre-event room · matched · friend · unavailable · thin. */
export type PersonVariant = 'here' | 'was' | 'pre' | 'matched' | 'friend' | 'gone' | 'thin'
export type PersonState = 'none' | 'liked' | 'requested' | 'waveBusy' | 'waved'

export type PersonCardPerson = {
  face: Face
  /** The name the room shows you: the pseudonym unless they're named to you. */
  name: string
  age?: number
  /** Why they're here, the top reason ("Both into vinyl"). */
  reason?: string
  /** The thin card's city. */
  city?: string
  /** Every reason, in the server's order: the panel. */
  reasons?: string[]
  chips?: string[]
  /**
   * Matching v2 (Flow 14 · 14.1): the server's strongest overlap as one line,
   * and the shared labels under it (2 before a reveal, 4 after). Absent or
   * `line: null` draws no line, and the plain `chips` stay.
   */
  overlap?: { line: string | null; labels: OverlapLabel[] }
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

const FACE = 112
/** #15: a Like button pops 0.85 → 1 on `M.pop` as it turns to Liked. */
const LIKE_POP_FROM = 0.85

const PRE_EVENT = 'You can only message people from an event you have both attended.'

/**
 * Everything worth knowing before you walk over (guidelines/components/PersonCard.html,
 * ROUND3 D · 4.1–4.3, the R3-D4 delta): the 112 pt face, name and age, why
 * they're here and the presence line, the reasons panel, their chips, then
 * the actions in one row and the consequence under them. The same card from
 * every entry point (a grid face, Meet next, a chat name, a long-press, a room
 * member, the wave row and banner). What the row offers depends on who they
 * are to you, never on why the roster didn't list them (the thin card).
 *
 * - Like: the gradient primary (there is always an event here: here and was),
 *   `H.like` once; Liked is a still white pill. Say hi (matched): `H.primary`.
 * - Wave (here now only): none on the press (#51, R3-D4; the server can't
 *   promise delivery). Busy while it goes; then the label settles to a still
 *   white "Waved" with a check (R3-D4, which Flow 15 #18 defers to). Waved at
 *   you: a still chip and Wave back.
 * - Message (secondary; the ConnectSheet reveals you) or a still Requested.
 *   ⋯ is Block / Report. View profile on every variant but unavailable.
 *
 * Read: "{name}, {age}, {reason}, here now", then the actions as buttons.
 * The row wraps rather than truncating a label at 2× text or on a narrow
 * phone. iOS draws its panels in 8% white on the glass sheet, Android in
 * surfaceSunken on the solid one.
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
  const line = thin ? person.city : variant === 'friend' ? 'Friend' : person.reason
  const presence =
    variant === 'was' ? 'Was here' : variant === 'pre' ? 'Going' : variant === 'here' || (here && variant !== 'thin') ? 'Here now' : null
  const heading = [name, age, line, presence?.toLowerCase()].filter((p) => p != null && p !== '').join(', ')
  const showReasons = !thin && variant !== 'pre' && !!person.reasons?.length
  const note =
    variant === 'pre'
      ? PRE_EVENT
      : variant === 'matched'
        ? null
        : variant === 'friend'
          ? `Message opens your chat with ${name}.`
          : isRequested
            ? `Request sent to ${name}. They’ll see your name and photo.`
            : crewLike && !isLiked && (variant === 'here' || variant === 'was')
              ? `A crew like is shown to ${name} as ${crewLike.name}, never as you.`
              : `${isWaved && variant === 'here' ? 'Waved. ' : ''}Message sends a request and reveals you to ${name}.`

  const circle = (icon: IconName, label: string, onPress?: () => void, busy = false) => (
    <Control
      testID={id(icon)}
      radius={RADIUS.capsule}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled: busy }}
      style={[styles.circle, { backgroundColor: panel }]}
    >
      {/* Sending a wave: the hand waves (#51, owner-approved for the busy state), never a spinner. */}
      {busy ? <WavingHand testID={id('hand-waving')} /> : <Icon name={icon} size={ICON.control} />}
    </Control>
  )

  return (
    <View testID={testID} style={styles.card}>
      {wavedAtYou ? (
        <View style={[styles.waveChip, { backgroundColor: panel }]}>
          <Icon name="hand" size={ICON.inline} />
          <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('caption', bold), styles.ink]}>{`Waved at you · ${wavedAtYou}`}</Text>
        </View>
      ) : null}

      <View ref={headRef} accessible accessibilityRole="header" accessibilityLabel={heading} style={styles.head}>
        <Avatar size={FACE} ring={COLOR.ink} testID={id('face')} {...person.face} />
        <View style={styles.headText}>
          <Text style={[font('title', bold), styles.ink]}>
            {name}
            {age ? (
              <>
                {', '}
                <Text style={[font('title', bold, FONT_FAMILY.mono[700]), styles.tabular]}>{age}</Text>
              </>
            ) : null}
          </Text>
          {line ? (
            <View style={styles.inline}>
              {variant === 'friend' ? <Icon name="user-check" size={ICON.inline} color={COLOR.textSecondary} /> : null}
              <Text style={[font('meta', bold), { color: quiet }]}>{line}</Text>
            </View>
          ) : null}
          {presence ? (
            <View style={styles.inline}>
              {variant === 'was' ? (
                <Icon name="clock" size={ICON.inline} color={COLOR.textSecondary} />
              ) : variant === 'pre' ? (
                <Icon name="calendar" size={ICON.inline} color={COLOR.textSecondary} />
              ) : (
                <PresenceDot kind="live" testID={id('presence-dot')} />
              )}
              <Text style={[font('caption', bold), { color: quiet }]}>{presence}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {showReasons ? (
        <View testID={id('reasons')} style={[styles.reasons, { backgroundColor: panel }]}>
          {person.reasons!.map((r) => (
            <View key={r} style={styles.reason}>
              <Icon name="check" size={ICON.inline} color={COLOR.textSecondary} />
              <Text style={[font('body', bold), styles.ink, styles.shrink]}>{r}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {!thin && person.overlap?.line ? (
        <OverlapLine
          line={person.overlap.line}
          labels={person.overlap.labels}
          revealed={variant === 'matched' || variant === 'friend'}
          testID={id('overlap')}
        />
      ) : !thin && person.chips?.length ? (
        <View style={styles.chips}>
          {person.chips.map((c) => (
            <InterestChip key={c} label={c} />
          ))}
        </View>
      ) : null}

      <View testID={id('actions')} style={styles.actions}>
        {variant === 'matched' ? (
          <Button label="Say hi" size="md" onPress={onSayHi} style={styles.grow} testID={id('say-hi')} />
        ) : variant === 'here' || variant === 'was' ? (
          isLiked ? (
            <Animated.View
              testID={id('liked')}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Liked"
              accessibilityState={{ selected: true }}
              style={[styles.pill, styles.grow, styles.lit, lit, likedStyle]}
            >
              <Icon name="heart" size={ICON.control} color={sel.glyph} active />
              <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('button', bold), styles.ink]}>
                Liked
              </Text>
            </Animated.View>
          ) : crewLike ? (
            <Button
              label={`Like for ${crewLike.name}`}
              size="md"
              leading={crewLike.emblemSeed ? <CrewEmblem seed={crewLike.emblemSeed} size={ICON.nav} /> : undefined}
              icon={crewLike.emblemSeed ? undefined : 'heart'}
              pressHaptic={false}
              accessibilityHint={`${name} sees ${crewLike.name}, never you, and only if they like back.`}
              onPress={() => {
                H.like()
                crewLike.onPress()
              }}
              style={styles.grow}
              testID={id('like-crew')}
            />
          ) : (
            <Button
              label="Like"
              size="md"
              icon="heart"
              pressHaptic={false}
              accessibilityHint="They’re only told if they like you back."
              onPress={() => {
                H.like()
                onLike?.()
              }}
              style={styles.grow}
              testID={id('like')}
            />
          )
        ) : null}

        {variant === 'here' ? (
          isWaved ? (
            <View testID={id('waved')} accessible accessibilityLabel="Waved" accessibilityState={{ selected: true }} style={[styles.pill, styles.lit, lit]}>
              <Icon name="check" size={ICON.control} color={sel.glyph} active />
              <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('button', bold), styles.ink]}>
                Waved
              </Text>
            </View>
          ) : wavedAtYou && !waveBusy ? (
            <Control
              testID={id('wave-back')}
              radius={RADIUS.capsule}
              onPress={onWave}
              accessibilityRole="button"
              accessibilityLabel={`Wave back at ${name}`}
              style={[styles.pill, { backgroundColor: panel }]}
            >
              <Icon name="hand" size={ICON.control} />
              <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('button', bold), styles.ink]}>
                Wave back
              </Text>
            </Control>
          ) : (
            circle('hand', `Wave at ${name}`, onWave, waveBusy)
          )
        ) : null}

        {variant === 'pre' || variant === 'matched' ? null : isRequested ? (
          <View accessible accessibilityLabel={`Request sent to ${name}`} style={[styles.pill, styles.grow, { backgroundColor: panel }]}>
            <Icon name="check" size={ICON.control} color={COLOR.textSecondary} />
            <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('button', bold), styles.secondary]}>
              Requested
            </Text>
          </View>
        ) : (
          <Button
            label="Message"
            kind="lit"
            size="md"
            icon="message-circle"
            accessibilityHint={variant === 'friend' ? undefined : 'Sends a request, which shows them your name and photo.'}
            onPress={onMessage}
            style={styles.grow}
            testID={id('message')}
          />
        )}

        <View style={styles.end}>{circle('ellipsis', `Block or report ${name}`, onMore)}</View>
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
          <Text style={[font('meta', bold), styles.ink, styles.shrink]}>{refusal.text}</Text>
          {refusal.action ? <TextAction label={refusal.action.label} onPress={refusal.action.onPress} testID={id('refusal-action')} /> : null}
        </View>
      ) : null}

      {note ? <Text style={[font('caption', bold), styles.note, { color: quiet }]}>{note}</Text> : null}

      <View style={styles.center}>
        <TextAction label="View profile" onPress={onViewProfile} testID={id('view-profile')} />
      </View>
    </View>
  )
}

/** #51: a wave's hand rotates ±14° twice over 600 ms, once. Reduce Motion: still. */
const WAVE_DEGREES = 14
const WAVE_MS = 600
const WAVE_TURNS = 2

function WavingHand({ testID }: { testID?: string }) {
  const reduceMotion = useReducedMotion()
  const t = useSharedValue(0)
  useEffect(() => {
    if (!reduceMotion) t.set(withTiming(1, { duration: WAVE_MS, easing: Easing.linear }))
  }, [reduceMotion, t])
  const turn = useAnimatedStyle(() => ({ transform: [{ rotate: `${WAVE_DEGREES * Math.sin(t.get() * Math.PI * 2 * WAVE_TURNS)}deg` }] }))
  return (
    <Animated.View testID={testID} style={turn}>
      <Icon name="hand" size={ICON.control} />
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
      <Text style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.ink]}>{label}</Text>
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
    <Sheet visible={visible} onClose={onClose} onDismissed={onDismissed} detents={['medium', 'tall']} focusRef={head} testID={testID}>
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
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg },
  headText: { flex: 1, minWidth: 0, gap: SPACE.xs },
  inline: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  tabular: { fontVariant: ['tabular-nums'] },
  shrink: { flexShrink: 1 },
  reasons: { borderRadius: RADIUS.rowInCard, paddingVertical: SPACE.xs },
  reason: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: SIZE.targetIos, paddingHorizontal: SPACE.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACE.sm, marginTop: SPACE.sm },
  grow: { flexGrow: 1 },
  end: { marginLeft: 'auto' },
  /** The action row is one height, 48 (`SIZE.control`): the Like and Message buttons at `md`, these pills and circles. */
  circle: { width: SIZE.control, height: SIZE.control, borderRadius: RADIUS.capsule, alignItems: 'center', justifyContent: 'center' },
  pill: {
    height: SIZE.control,
    borderRadius: RADIUS.capsule,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.lg,
  },
  lit: { borderWidth: 1 },
  refusal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md },
  note: { textAlign: 'center' },
  center: { alignItems: 'center' },
  textAction: { justifyContent: 'center', paddingHorizontal: SPACE.lg },
  /** The focus rings sit 4 pt outside the controls: the scroll gives them the room. */
  scroll: { flex: 1, marginHorizontal: -SPACE.xs },
  scrollBody: { paddingHorizontal: SPACE.xs, paddingTop: SPACE.xs, paddingBottom: SPACE.xl },
})
