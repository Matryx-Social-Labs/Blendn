import { Image } from 'expo-image'
import { memo, useCallback, useRef, useState, type ComponentProps } from 'react'
import { Pressable, StyleSheet, Text, View, type AccessibilityActionEvent, type GestureResponderEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Svg, { Circle } from 'react-native-svg'
import Animated, {
  Easing,
  FadeInUp,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { Icon } from '../ui/Icon'
import { COLOR, EASING, ICON, MAX_FONT_SCALE, PRESS, RADIUS, SIZE, SPACE, SPRING, TYPE } from '../../lib/design/tokens'
import { MonoRun } from './MonoFamily'
import { H } from '../../lib/haptics'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { tint } from '../../lib/theme'
import { measureAnchor } from './anchor'
import { Avatar } from './Avatar'
import { CHAT_REACTIONS } from '../../lib/chatReactions'
import { avatarOf, BUBBLE, emojiOnly, linkHost, linkParts, reactionName, REPLY_SWIPE, replyOffset, timeFont, type ChatPerson, type Rect, type TextPart } from './chatShared'
import { ReactionPill } from './ReactionBar'
import { RECEIPT_WORD, ReceiptMark, type Receipt } from './ReceiptMark'
import { ReplyPreview } from './ReplyPreview'
import { CONTROL_FONT_CAP, focusRing, font, IC_HAIRLINE, minTarget, useBoldText, useIncreaseContrast } from './shared'

/** #36: the hold that opens the menu. */
const HOLD_MS = 400
const PRESS_SPRING = { ...SPRING.press, reduceMotion: ReduceMotion.Never }
/** The bubble squashes only for a touch that stays: a scroll's first touch-down ends sooner than this. */
export const PRESS_DELAY_MS = 120
/** The page's not-sent bubble at 70%. */
const FAILED_OPACITY = 0.7
/** R3-D5 5.11: one to three emoji alone at 32 pt, no bubble. */
// design-exception: emoji drawn by the system at the page's 32 pt, not a type role
const EMOJI_ONLY_TYPE = { fontSize: 32, lineHeight: 40 }
/** The page's photo in a bubble. */
const PHOTO = { width: 220, height: 160 }
/** R3-D5 5.9: a 44 pt ring with a 3 pt stroke; the veil is the photo dimmed to 65%. */
const RING = { size: SIZE.circleButton, stroke: 3 }
const VEIL_ALPHA = 0.35
/** #12: the new bubble starts at the composer's field and travels to its slot over 300 ms. */
const SEND = { from: SIZE.input, ms: 300 }
/** The reply glyph sits off the bubble's leading edge and comes in with the drag. */
const GLYPH_OFFSET = ICON.control + SPACE.sm

export type BubbleReaction = { emoji: string; count: number; mine: boolean }

export type ChatBubbleProps = {
  mine: boolean
  sender: ChatPerson
  /** `dm` drops names and creatures (one other person) and allows the receipt. */
  surface?: 'room' | 'dm'
  /** Its place in a run from one sender: the name on the first (rooms); the creature, the time and the tail on the last. */
  first?: boolean
  last?: boolean
  text?: string
  /** A photo message: tapping it opens the viewer from the bubble's frame. `progress` (0–1) while it uploads: a determinate ring, never a spinner (R3-D5 5.9). */
  photo?: { uri: string; onPress: (from: Rect) => void; progress?: number }
  replyTo?: { name: string; text: string; onPress?: () => void }
  reactions?: BubbleReaction[]
  onReactionPress?: (emoji: string) => void
  /** Your reaction that has just landed: its pill pops (#37). */
  landed?: string
  /** Shown under the last; always read. */
  time: string
  /** Your last message in a DM. Never in a room. */
  receipt?: Receipt
  /** Offline: "Waiting for connection" with a clock, never a spinner (R3-D5 5.8). */
  waiting?: boolean
  /** Removed by moderation: keeps its place, dashed; no menu, no swipe. */
  removed?: boolean
  /** Not sent: `true` for "Not sent · Tap to retry", or the line the server's reason gives. */
  failed?: boolean | string
  onRetry?: () => void
  /** Swipe right to reply (#35), and a screen reader's Reply. Absent: it does not move. */
  onReply?: () => void
  /** The hold (#36): the menu opens at the bubble's frame. Absent: no menu (broadcasts, polls, removed). */
  onLongPress?: (anchor: Rect) => void
  /** The creature or the name: their PersonCard (R3-D5 5.1). */
  onSenderPress?: () => void
  /** A link: the screen's domain sheet, never a preview. */
  onLinkPress?: (url: string) => void
  /** Extra screen-reader actions. The menu itself is "More options" (whenever `onLongPress` is set), so its items need not be repeated here. */
  actions?: { label: string; onPress: () => void }[]
  /** Only for a message that has just landed in front of you, never history. */
  animateIn?: 'send' | 'arrive'
  /** The copy LongPressMenu lifts: the bubble alone, at the width it is given, no gestures. */
  lifted?: boolean
  /** The design gallery only: draws a transient state with no finger or keyboard. */
  previewState?: 'pressed' | 'focused'
  testID?: string
}

/** #12 send, #13 arrive. Under Reduce Motion both fade in place. */
function entering(kind: 'send' | 'arrive', reduceMotion: boolean) {
  const m = motionTokens(reduceMotion)
  const send = kind === 'send' && !reduceMotion
  const [x1, y1, x2, y2] = send ? EASING.sendVertical : EASING.entrance
  return FadeInUp.duration(send ? SEND.ms : m.duration.base)
    .easing(Easing.bezier(x1, y1, x2, y2))
    .withInitialValues({ opacity: 0, transform: [{ translateY: send ? SEND.from : m.rise.message }] })
    .reduceMotion(ReduceMotion.Never)
}

/**
 * One message (guidelines/components/ChatBubble.html). Messages group by
 * sender; the screen passes `first` and `last`: the name once on top (rooms
 * only), the creature on the last bubble, the time once under the group, a
 * 6 pt tail on the sender's side of the last. Inbound is `surfaceSunken`,
 * yours `surfaceRaised`; nothing is coloured, the gradient never touches a
 * bubble. Inside: a reply quote, the text at 17 (links tappable, never a
 * preview; one to three emoji alone at 32 pt with no bubble) or a photo; under
 * it, reactions; "Not sent · Tap to retry"; a removed message keeps its place,
 * dashed. Never "edited" (ROUND3 C6).
 *
 * Gestures, on the UI thread: a 400 ms hold presses it to 0.97 and plays
 * `H.longPress`, handing the menu its frame (#36); a drag right tracks 1:1 to
 * 56 pt, arms with `H.threshold` (Medium) once per crossing, rubber-bands to
 * 96 and replies on release, springing back on `M.fling` (#35, kept under
 * Reduce Motion). A tap retries a failed one (`H.send`) or opens a photo. No
 * haptic on arrival. Android: no ripple on a bubble.
 *
 * Read as one element per message, "{name}, {text}, {time}", the reply as its
 * hint; Reply, "More options" (the same menu the hold opens, at the bubble's
 * frame), "View profile" (the creature's card), the reactions and each link
 * are its accessibility actions, so no gesture is the only way. The name is a
 * button to their card.
 * Text scales freely; the width holds. Increase Contrast: the 50% hairline.
 */
/**
 * The bubble's gestures, on the UI thread: the hold (#36) and the swipe to
 * reply (#35), with the press scale, the drag and the reply glyph they draw.
 */
function useBubbleGestures({ onLongPress, onReply, removed, failed, testID }: Pick<ChatBubbleProps, 'onLongPress' | 'onReply' | 'removed' | 'failed' | 'testID'>) {
  const size = useSharedValue({ width: 0, height: 0 })
  const press = useSharedValue(1)
  const dx = useSharedValue(0)
  const armed = useSharedValue(false)

  const openMenu = useCallback(
    (anchor: Rect) => {
      H.longPress()
      onLongPress?.(anchor)
    },
    [onLongPress]
  )
  const arm = useCallback(() => H.threshold({ swipeToReply: true }), [])
  const reply = useCallback(() => onReply?.(), [onReply])

  const hold = Gesture.LongPress()
    .enabled(!!onLongPress && !removed)
    .minDuration(HOLD_MS)
    // A hold shows in time; a flick's touch-down is gone (onFinalize) before it, so a scrolling thumb never squashes a bubble.
    .onBegin(() => press.set(withDelay(PRESS_DELAY_MS, withSpring(PRESS.scale, PRESS_SPRING))))
    .onStart((e) => {
      const { width, height } = size.get()
      scheduleOnRN(openMenu, { x: e.absoluteX - e.x, y: e.absoluteY - e.y, width, height })
    })
    .onFinalize(() => press.set(withSpring(1, PRESS_SPRING)))
  const swipe = Gesture.Pan()
    .enabled(!!onReply && !removed && !failed)
    .activeOffsetX(SPACE.md)
    .failOffsetY([-SPACE.sm, SPACE.sm])
    .onUpdate((e) => {
      const x = replyOffset(e.translationX)
      dx.set(x)
      const past = x >= REPLY_SWIPE.trigger
      if (past && !armed.get()) scheduleOnRN(arm)
      armed.set(past)
    })
    .onEnd((e, success) => {
      // A cancelled drag (a system interrupt) springs back and replies to nothing.
      if (success && armed.get()) scheduleOnRN(reply)
      armed.set(false)
      dx.set(withSpring(0, { ...SPRING.fling, velocity: e.velocityX }))
    })
  if (testID) {
    hold.withTestId(`${testID}-hold`)
    swipe.withTestId(`${testID}-swipe`)
  }

  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.get() }] }))
  const swipeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: dx.get() }] }))
  // The glyph rides in the dragged group, so only its own fade and growth are here.
  const glyphStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dx.get(), [0, REPLY_SWIPE.trigger / 2], [0, 1], 'clamp'),
    transform: [{ scale: interpolate(dx.get(), [0, REPLY_SWIPE.trigger], [0.6, 1], 'clamp') }],
  }))
  return { hold, swipe, size, pressStyle, swipeStyle, glyphStyle, openMenu }
}

function ChatBubbleBase(props: ChatBubbleProps) {
  const { mine, sender, surface = 'room', first = true, last = true, text = '', photo, replyTo, removed = false } = props
  const { failed = false, onSenderPress, previewState, lifted, testID } = props
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const reduceMotion = useReducedMotion()
  const [focused, setFocused] = useState(false)
  const { hold, swipe, size, pressStyle, swipeStyle, glyphStyle, openMenu } = useBubbleGestures(props)
  const holdArea = useRef<View>(null)
  // A screen reader's "More options": the hold's own path, measured from the bubble rather than from a finger.
  const onMore = props.onLongPress && !removed ? () => measureAnchor(holdArea.current, openMenu) : undefined

  const room = surface === 'room' && !mine
  const emoji = !removed && !photo && !replyTo && emojiOnly(text)
  const indent = room ? { paddingLeft: BUBBLE.avatar + SPACE.sm } : null
  const tail = last && !emoji ? BUBBLE.tail : BUBBLE.radius
  const bubble = (
    <Message
      {...props}
      onMore={onMore}
      emoji={emoji}
      size={() => size.get()}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        styles.bubble,
        emoji && styles.bare,
        photo && styles.photoBubble,
        removed && styles.removed,
        { backgroundColor: removed || emoji ? 'transparent' : mine ? COLOR.surfaceRaised : COLOR.surfaceSunken },
        mine ? { borderBottomRightRadius: tail } : { borderBottomLeftRadius: tail },
        failed && styles.failedBubble,
        contrast && !removed && !emoji && IC_HAIRLINE,
      ]}
    />
  )
  // The copy LongPressMenu lifts: the bubble alone, at the width it is given.
  if (lifted) return bubble

  return (
    <Animated.View
      testID={testID}
      entering={props.animateIn ? entering(props.animateIn, reduceMotion) : undefined}
      style={[styles.group, mine && styles.end]}
    >
      <GestureDetector gesture={swipe}>
        <Animated.View style={[styles.group, mine && styles.end, swipeStyle]}>
          {room && first ? (
            <Pressable
              accessibilityRole={onSenderPress ? 'button' : 'text'}
              onPress={onSenderPress}
              hitSlop={{ top: (minTarget() - TYPE.meta.lineHeight) / 2, bottom: (minTarget() - TYPE.meta.lineHeight) / 2 }}
              style={indent}
            >
              <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
                {sender.name}
              </Text>
            </Pressable>
          ) : null}
          <View style={[styles.line, { maxWidth: BUBBLE.maxWidth[surface] }, mine && styles.reverse]}>
            <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.glyph, glyphStyle]}>
              <Icon name="reply" size={ICON.control} color={COLOR.textSecondary} />
            </Animated.View>
            {room ? <SenderAvatar sender={sender} last={last} onPress={onSenderPress} testID={testID && `${testID}-avatar`} /> : null}
            <GestureDetector gesture={hold}>
              <Animated.View
                ref={holdArea}
                testID={testID && `${testID}-hold-area`}
                onLayout={(e) => size.set({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
                style={[styles.shrink, previewState === 'pressed' ? styles.pressed : pressStyle]}
              >
                {bubble}
                {focused || previewState === 'focused'
                  ? focusRing(BUBBLE.radius).map((ring, i) => <View key={i} pointerEvents="none" style={ring} />)
                  : null}
              </Animated.View>
            </GestureDetector>
          </View>
          <Under {...props} indent={indent} />
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  )
}

/**
 * Memoised for a list: a room being typed in re-renders on every keystroke.
 * It only bites when the screen keeps its object and callback props stable
 * (`useCallback`, ids rather than inline arrays); the gallery doesn't bother.
 */
export const ChatBubble = memo(ChatBubbleBase)

/** The 32 pt creature beside an inbound room group, on its last bubble; a button to their card (a screen reader uses the name). */
function SenderAvatar({ sender, last, onPress, testID }: { sender: ChatPerson; last: boolean; onPress?: () => void; testID?: string }) {
  if (!last) return <View style={styles.avatarSpace} />
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      hitSlop={(minTarget() - BUBBLE.avatar) / 2}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Avatar {...avatarOf(sender, BUBBLE.avatar)} />
    </Pressable>
  )
}

/** The bubble itself: the one accessible element per message. */
function Message({
  mine,
  sender,
  text = '',
  photo,
  replyTo,
  removed = false,
  failed = false,
  time,
  receipt,
  waiting,
  onRetry,
  onReply,
  onLinkPress,
  reactions = [],
  onReactionPress,
  actions = [],
  onMore,
  onSenderPress,
  testID,
  emoji,
  size,
  onFocus,
  onBlur,
  style,
}: ChatBubbleProps & {
  /** "More options": the hold's menu, for a screen reader. */
  onMore?: () => void
  emoji: boolean
  size: () => { width: number; height: number }
  onFocus: () => void
  onBlur: () => void
  style: ComponentProps<typeof Pressable>['style']
}) {
  const bold = useBoldText()
  const parts = removed || photo ? [] : linkParts(text)
  const links = onLinkPress ? parts.filter((p): p is TextPart & { url: string } => !!p.url) : []

  // The room frame's words (Flow 5 #11): it was moderation, and it says so.
  const content = removed ? 'This message was removed by moderation.' : photo ? 'Photo' : text
  const label = `${failed ? 'Not sent' : mine ? 'You' : sender.name}${failed ? ':' : ','} ${content}, ${time}${
    receipt ? `, ${RECEIPT_WORD[receipt]}` : ''
  }${waiting ? ', waiting for connection' : ''}`
  /*
   * Everything the gestures offer, as actions: Reply, the hold's menu (Report,
   * Block, Copy, their card: a safety path, so never gesture-only), the
   * creature's card, the six reactions (the bar is behind a hold), each link.
   * A removed message offers nothing; one not sent offers no Reply.
   */
  const yours = new Set(reactions.filter((r) => r.mine).map((r) => r.emoji))
  const named: [string, () => void][] = removed
    ? []
    : [
        ...(onReply && !failed ? [['Reply', onReply] as [string, () => void]] : []),
        ...(onMore ? [['More options', onMore] as [string, () => void]] : []),
        ...(onSenderPress ? [['View profile', onSenderPress] as [string, () => void]] : []),
        ...(onReactionPress && !failed
          ? CHAT_REACTIONS.map((e): [string, () => void] => [
              `${yours.has(e) ? 'Take back' : 'React,'} ${reactionName(e)}`,
              () => {
                if (!yours.has(e)) H.reaction('land')
                onReactionPress(e)
              },
            ])
          : []),
        ...actions.map((a): [string, () => void] => [a.label, a.onPress]),
        ...links.map((l): [string, () => void] => [`Open ${linkHost(l.url)}`, () => onLinkPress?.(l.url)]),
      ]
  const onAction = (e: AccessibilityActionEvent) => named.find(([name]) => name === e.nativeEvent.actionName)?.[1]()
  const tap = (e: GestureResponderEvent) => {
    if (failed) {
      H.send()
      onRetry?.()
      return
    }
    const { pageX, pageY, locationX, locationY } = e.nativeEvent
    photo?.onPress({ x: pageX - locationX, y: pageY - locationY, ...size() })
  }

  return (
    <Pressable
      testID={testID && `${testID}-bubble`}
      accessibilityRole={failed || photo ? 'button' : 'text'}
      accessibilityLabel={label}
      accessibilityHint={replyTo ? `Replying to ${replyTo.name}: ${replyTo.text}` : failed ? 'Retries sending' : undefined}
      accessibilityActions={named.map(([name]) => ({ name, label: name }))}
      onAccessibilityAction={onAction}
      onPress={failed || photo ? tap : undefined}
      onFocus={onFocus}
      onBlur={onBlur}
      style={style}
    >
      {replyTo && !removed ? <ReplyPreview name={replyTo.name} text={replyTo.text} onPress={replyTo.onPress} /> : null}
      {photo && !removed ? (
        <View>
          <Image source={{ uri: photo.uri }} style={styles.photo} contentFit="cover" accessible={false} />
          {photo.progress !== undefined ? <UploadRing progress={photo.progress} /> : null}
        </View>
      ) : (
        <Text
          // Reading text grows to body's cap; a 32 pt emoji-only message is already large, so it stops at display's.
          maxFontSizeMultiplier={emoji ? MAX_FONT_SCALE.display : MAX_FONT_SCALE.body}
          style={[emoji ? EMOJI_ONLY_TYPE : font('body', bold), removed ? styles.removedText : styles.primary]}
        >
          {removed
            ? content
            : parts.map(({ text: words, url }, i) =>
                url ? (
                  <Text key={i} onPress={() => onLinkPress?.(url)} maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={styles.link}>
                    {words}
                  </Text>
                ) : (
                  words
                )
              )}
        </Text>
      )}
    </Pressable>
  )
}

/**
 * The upload's determinate ring over a 35% veil (R3-D5 5.9 #33): a fraction, read as a percentage. A photo message's, and the
 * onboarding photo tile's (`label`: what a screen reader says it is doing).
 */
export function UploadRing({ progress, label = 'Sending photo' }: { progress: number; label?: string }) {
  const r = (RING.size - RING.stroke) / 2
  const around = 2 * Math.PI * r
  const done = Math.max(0, Math.min(1, progress))
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(done * 100) }}
      style={[StyleSheet.absoluteFill, styles.veil]}
    >
      <Svg width={RING.size} height={RING.size}>
        <Circle cx={RING.size / 2} cy={RING.size / 2} r={r} stroke={COLOR.hairlineStrong} strokeWidth={RING.stroke} fill="none" />
        <Circle
          cx={RING.size / 2}
          cy={RING.size / 2}
          r={r}
          stroke={COLOR.textPrimary}
          strokeWidth={RING.stroke}
          fill="none"
          strokeDasharray={`${around * done} ${around}`}
          strokeLinecap="round"
          rotation={-90}
          origin={`${RING.size / 2}, ${RING.size / 2}`}
        />
      </Svg>
    </View>
  )
}

/** Under the bubble: reactions, the not-sent line, and on the last the time (or "Waiting for connection") and the receipt. */
function Under({
  mine,
  surface = 'room',
  last = true,
  reactions,
  onReactionPress,
  landed,
  failed,
  onRetry,
  time,
  receipt,
  waiting,
  indent,
}: ChatBubbleProps & { indent: { paddingLeft: number } | null }) {
  const bold = useBoldText()
  return (
    <>
      {reactions?.length ? (
        <View style={[styles.reactions, indent, mine && styles.end]}>
          {reactions.map((r) => (
            <ReactionPill
              key={r.emoji}
              emoji={r.emoji}
              count={r.count}
              mine={r.mine}
              landed={landed === r.emoji}
              onPress={onReactionPress && (() => onReactionPress(r.emoji))}
            />
          ))}
        </View>
      ) : null}
      {failed ? (
        <Pressable
          onPress={() => {
            H.send()
            onRetry?.()
          }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          hitSlop={{ top: (minTarget() - TYPE.caption.lineHeight) / 2, bottom: (minTarget() - TYPE.caption.lineHeight) / 2 }}
          style={[styles.meta, indent]}
        >
          <Icon name="circle-alert" size={ICON.inline} color={COLOR.destructive} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} style={[font('caption', bold), styles.destructive]}>{typeof failed === 'string' ? failed : 'Not sent · Tap to retry'}</Text>
        </Pressable>
      ) : null}
      {last && !failed ? (
        // Read with the message.
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.meta, indent]}>
          {waiting ? (
            <>
              <Icon name="clock" size={ICON.inline} color={COLOR.textTertiary} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} style={[font('caption', bold), styles.tertiary]}>
                Waiting for connection
              </Text>
            </>
          ) : (
            <>
              {/* A tag, as Banter's time: it stops where a control does (C31). */}
              <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={timeFont(bold)}>
                <MonoRun text={time} />
              </Text>
              {mine && surface === 'dm' && receipt ? <ReceiptMark state={receipt} /> : null}
            </>
          )}
        </View>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  group: { gap: SPACE.xs, alignItems: 'flex-start', alignSelf: 'stretch' },
  end: { alignItems: 'flex-end' },
  // Off the line's leading edge (the creature, or your bubble), where the drag opens a gap.
  glyph: { position: 'absolute', left: -GLYPH_OFFSET, top: 0, bottom: 0, justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.sm },
  reverse: { flexDirection: 'row-reverse' },
  avatarSpace: { width: BUBBLE.avatar },
  shrink: { flexShrink: 1 },
  pressed: { transform: [{ scale: PRESS.scale }] },
  bubble: { borderRadius: BUBBLE.radius, paddingVertical: SPACE.sm, paddingHorizontal: SPACE.md },
  bare: { paddingVertical: 0, paddingHorizontal: 0 },
  photoBubble: { padding: SPACE.xs },
  removed: { borderWidth: 1, borderStyle: 'dashed', borderColor: COLOR.textTertiary },
  failedBubble: { opacity: FAILED_OPACITY },
  photo: { width: PHOTO.width, height: PHOTO.height, borderRadius: RADIUS.rowInCard, backgroundColor: COLOR.surface },
  veil: { borderRadius: RADIUS.rowInCard, backgroundColor: tint(COLOR.ink, VEIL_ALPHA), alignItems: 'center', justifyContent: 'center' },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  link: { color: COLOR.link, textDecorationLine: 'underline' },
  primary: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  tertiary: { color: COLOR.textTertiary },
  destructive: { color: COLOR.destructive },
  removedText: { color: COLOR.textSecondary, fontStyle: 'italic' },
})
