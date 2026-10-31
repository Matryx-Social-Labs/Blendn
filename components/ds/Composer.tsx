import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native'

import ScalePress from '../motion/ScalePress'
import { GradientFill } from '../ui/GradientFill'
import { Icon, type IconName } from '../ui/Icon'
import { Material } from '../ui/Material'
import { COLOR, FONT_FAMILY, ICON, MATERIAL, MAX_FONT_SCALE, PRESS, RADIUS, SIZE, SPACE, TYPE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useToastDock } from '../toastDock'
import { Button } from './Button'
import { ReplyPreview } from './ReplyPreview'
import { SystemNotice } from './SystemNotice'
import { CONTROL_FONT_CAP, focusRing, font, IC_HAIRLINE, minTarget, PRESSED_WASH, useBoldText, useIncreaseContrast } from './shared'

/** The server's limit, enforced here so the count that stops you is the one that would refuse you. */
const MAX_LENGTH = 1000
/** R3-D5 5.3: "100 left" from 900 characters. */
const COUNT_FROM = 900
/** R3-D5 5.3: the field grows to five lines (132 pt), then scrolls inside. */
const FIELD_MAX_HEIGHT = 132
/** The locked reason's glyph well: the page's 40 pt circle. */
const WELL = SIZE.control - SPACE.sm
/** R3-D5 5.9: the attach control, 40 pt, narrowing the field by as much. */
const ATTACH = SIZE.control - SPACE.sm

export type ComposerState =
  | 'normal'
  | 'failed'
  | 'muted'
  | 'automuted'
  | 'closed'
  | 'ratelimited'
  | 'notcheckedin'
  | 'notopen'
  | 'hidden'
  | 'banned'
  | 'left'
  | 'ended'

type Locked = Exclude<ComposerState, 'normal' | 'failed' | 'banned' | 'left' | 'ended'>

/** Why it can't post, in the server's words where it has them (ROUND3 C2–C4). No mute says when it lifts (R11). */
const LOCKED: Record<Locked, { icon: IconName; title: string; body?: string }> = {
  muted: { icon: 'mic-off', title: 'Muted', body: 'The organizer has muted you in this room.' },
  automuted: {
    icon: 'mic-off',
    title: 'Muted',
    body: 'You are muted in this room. Your messages have been flagged for policy violations.',
  },
  closed: { icon: 'door-closed', title: 'This chat has closed', body: 'Event chats stay open for 24 hours after the event ends.' },
  ratelimited: { icon: 'timer', title: 'Slow down a moment', body: 'Too many messages.' },
  notcheckedin: { icon: 'map-pin', title: 'RSVP to this event to join the chat' },
  /* R2-D2: the server's CHAT_CLOSED reasons it words apart; the sentence is always the server's. */
  notopen: { icon: 'clock', title: 'Not open yet', body: 'This chat opens 24 hours before the event starts.' },
  hidden: { icon: 'eye-off', title: 'This room is hidden', body: 'This event is no longer available.' },
}

export type ComposerProps = {
  value: string
  onChangeText: (text: string) => void
  /** A message is committed: the composer plays `H.send`; the screen clears it and sends. */
  onSend: () => void
  state?: ComposerState
  /** The message being answered: the quote above the field. */
  reply?: { name: string; text: string } | null
  onCancelReply?: () => void
  /** `failed`: "Not sent · Tap to retry". */
  onRetry?: () => void
  /** A locked state's sentence, verbatim from the server, in place of the default. */
  reason?: string
  /** `ratelimited` only, when the server sends retryAfter: "0:12", ticked by the screen. */
  countdown?: string
  /**
   * A line of advice above the field while the text looks like contact details (5.10): an info row, never a lock,
   * and Send stays enabled. Announced politely as it appears.
   */
  warning?: string | null
  /** `notcheckedin`: the one action (I'm going). */
  action?: { label: string; onPress: () => void; loading?: boolean }
  placeholder?: string
  onFocus?: () => void
  /** R3-D5 5.9: a DM once both have revealed (or are friends) — the 40 pt photo control before the field. */
  onAttach?: () => void
  /** The design gallery only: draws a transient state with no finger or keyboard. */
  previewState?: 'pressed' | 'focused'
  testID?: string
}

/**
 * The chat composer (guidelines/components/Composer.html): one glass bar
 * (Android: the solid tier) with the field at 17 and a 44 pt Send disc that
 * takes the gradient once there is text. Replying adds the quote above the
 * field. The field grows to five lines without a layout animation, then
 * scrolls inside (#34); a counter shows from 900 characters.
 *
 * When you can't post it says why in one line with a glyph, in the server's
 * words (`reason`), never disappearing silently; a rate limit adds the
 * server's countdown in Geist Mono, a mute never does. Left, ended and banned
 * draw nothing: the feed says so in one line.
 *
 * `H.send` when a message is committed (#12's motion is the screen's); `H.error`
 * once as a send fails (not when it mounts already failed); a locked composer
 * plays nothing. A change of state is announced. Nothing says
 * "sending": a sent message appears at once (Flow 5's prototype). Read as
 * "Message, text field" and "Send, button, dimmed" until there is text; a
 * locked reason reads as one element, the countdown as its hint.
 */
export function Composer({
  value,
  onChangeText,
  onSend,
  state = 'normal',
  reply,
  onCancelReply,
  onRetry,
  reason,
  countdown,
  warning,
  action,
  placeholder = 'Say something to the room',
  onFocus,
  onAttach,
  previewState,
  testID,
}: ComposerProps) {
  const contrast = useIncreaseContrast()
  useStateChange(state, reason)
  useAnnounceWarning(warning)
  const gone = state === 'banned' || state === 'left' || state === 'ended'
  // The Android snackbar stands above the composer while it is drawn.
  const [height, setHeight] = useState(0)
  useToastDock(gone ? 0 : height)

  if (gone) return null
  const locked = state !== 'normal' && state !== 'failed'
  const shape: StyleProp<ViewStyle> = [
    styles.bar,
    { borderRadius: reply || locked ? RADIUS.sheet : RADIUS.button },
    contrast && IC_HAIRLINE,
  ]

  return (
    <View testID={testID} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {warning && !locked ? (
        <View accessibilityLiveRegion="polite" style={styles.warning}>
          <SystemNotice text={warning} icon="info" testID={testID && `${testID}-warning`} />
        </View>
      ) : null}
      <Material role="bar" style={shape}>
        {locked ? (
          <LockedRow state={state} reason={reason} countdown={countdown} action={action} />
        ) : (
          <>
            {reply ? <ReplyPreview name={reply.name} text={reply.text} onCancel={onCancelReply ?? (() => {})} /> : null}
            <Field
              value={value}
              onChangeText={onChangeText}
              onSend={onSend}
              placeholder={placeholder}
              onFocus={onFocus}
              onAttach={onAttach}
              pressed={previewState === 'pressed'}
            />
            {state === 'failed' ? <Failed onRetry={onRetry} /> : null}
          </>
        )}
      </Material>
      {previewState === 'focused'
        ? focusRing(reply || locked ? RADIUS.sheet : RADIUS.button).map((ring, i) => <View key={i} pointerEvents="none" style={ring} />)
        : null}
    </View>
  )
}

/** What a change of state says aloud: the reason it can't post, or the failure. */
function spokenState(state: ComposerState, reason?: string) {
  if (state === 'failed') return 'Not sent. Tap to retry'
  if (state === 'normal' || state === 'banned' || state === 'left' || state === 'ended') return null
  const { title, body } = LOCKED[state]
  const said = reason ?? body
  return said ? `${title}. ${said}` : title
}

/**
 * As the state changes (not as it mounts in one): `H.error` once when a send
 * fails, and the new reason announced, since the field it replaces may have
 * had focus. iOS announces; Android reads the rows' polite live regions.
 */
function useStateChange(state: ComposerState, reason?: string) {
  const previous = useRef(state)
  useEffect(() => {
    if (previous.current === state) return
    previous.current = state
    if (state === 'failed') H.error()
    const said = spokenState(state, reason)
    if (said && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(said)
    // On a change of state only; the reason is read as it stood then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])
}

/**
 * The warning appearing is announced (iOS has no live regions; Android reads the row's own): once as it goes from nothing to a
 * sentence, not on every keystroke while it stays, and again if it goes and returns.
 */
function useAnnounceWarning(warning: string | null | undefined) {
  const had = useRef(false)
  useEffect(() => {
    const has = !!warning
    if (has && !had.current && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(warning)
    had.current = has
  }, [warning])
}

function Field({
  value,
  onChangeText,
  onSend,
  placeholder,
  onFocus,
  onAttach,
  pressed,
}: Pick<ComposerProps, 'value' | 'onChangeText' | 'onSend' | 'onFocus' | 'onAttach'> & { placeholder: string; pressed: boolean }) {
  const android = Platform.OS === 'android'
  const bold = useBoldText()
  const [down, setDown] = useState(false)
  const lit = value.trim().length > 0
  const square = android && (down || pressed)

  return (
    <>
      <View style={[styles.row, onAttach && styles.rowAttach]}>
        {onAttach ? (
          <Pressable
            onPress={onAttach}
            hitSlop={(minTarget() - ATTACH) / 2}
            accessibilityRole="button"
            accessibilityLabel="Send a photo"
            style={styles.attach}
          >
            <Icon name="image" size={ICON.control} color={COLOR.textSecondary} />
          </Pressable>
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          multiline
          maxLength={MAX_LENGTH}
          placeholder={placeholder}
          placeholderTextColor={COLOR.textSecondary}
          accessibilityLabel="Message"
          // The field is a control, as a TextField's input is: one line centred on the Send disc, five lines then it scrolls.
          // Uncapped it drew typed text at 53 pt over two lines (RC drive 3 D-B), so it stops at the control cap.
          maxFontSizeMultiplier={CONTROL_FONT_CAP}
          style={[font('body', bold), styles.field]}
        />
        <View style={pressed && !android && styles.pressedIos}>
          <ScalePress
            disabled={!lit}
            onPress={() => {
              H.send()
              onSend()
            }}
            pressedScale={android ? 1 : PRESS.scaleDisc}
            onPressIn={() => setDown(true)}
            onPressOut={() => setDown(false)}
            android_ripple={{ color: PRESSED_WASH.android, foreground: true }}
            hitSlop={(minTarget() - SIZE.circleButton) / 2}
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: !lit }}
            style={[styles.send, { borderRadius: square ? RADIUS.pressedAndroid : RADIUS.circleButton }, !lit && styles.idle]}
          >
            {lit ? <GradientFill style={StyleSheet.absoluteFill} /> : null}
            {square && pressed ? <View style={[StyleSheet.absoluteFill, styles.wash]} /> : null}
            <Icon name="send" size={ICON.control} color={lit ? COLOR.textOnGradient : COLOR.textSecondary} />
          </ScalePress>
        </View>
      </View>
      {value.length >= COUNT_FROM ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} style={[font('caption', bold, FONT_FAMILY.mono[500]), styles.counter]}>{MAX_LENGTH - value.length} left</Text>
      ) : null}
    </>
  )
}

function Failed({ onRetry }: { onRetry?: () => void }) {
  const bold = useBoldText()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Not sent. Tap to retry"
      accessibilityLiveRegion="polite"
      onPress={onRetry}
      style={[styles.failed, { minHeight: minTarget() }]}
    >
      <Icon name="circle-alert" size={ICON.inline} color={COLOR.destructive} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} style={[font('caption', bold), styles.destructive]}>Not sent · Tap to retry</Text>
    </Pressable>
  )
}

function LockedRow({ state, reason, countdown, action }: { state: Locked } & Pick<ComposerProps, 'reason' | 'countdown' | 'action'>) {
  const bold = useBoldText()
  const { icon, title, body: fallback } = LOCKED[state]
  const body = reason ?? fallback
  const clock = state === 'ratelimited' && countdown ? countdown : null

  return (
    <View style={styles.locked}>
      <View
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={body ? `${title}. ${body}` : title}
        accessibilityHint={clock ? `You can post again in ${clock}` : undefined}
        style={styles.reason}
      >
        <View style={styles.well}>
          <Icon name={icon} size={ICON.control} />
        </View>
        <View style={styles.words}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.primary]}>{title}</Text>
          {body ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
              {body}
              {clock ? ' You can post again in ' : null}
              {clock ? <Text style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.primary]}>{clock}</Text> : null}
            </Text>
          ) : null}
        </View>
      </View>
      {state === 'notcheckedin' && action ? (
        <Button kind="lit" size="sm" label={action.label} loading={action.loading} onPress={action.onPress} />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { overflow: 'hidden' },
  warning: { marginBottom: SPACE.sm },
  row: {
    minHeight: SIZE.input,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACE.sm,
    paddingVertical: (SIZE.input - SIZE.circleButton) / 2,
    paddingRight: (SIZE.input - SIZE.circleButton) / 2,
    paddingLeft: SPACE.lg,
  },
  rowAttach: { paddingLeft: SPACE.xs },
  // Centred on the Send disc beside it.
  attach: { width: ATTACH, height: ATTACH, marginBottom: (SIZE.circleButton - ATTACH) / 2, alignItems: 'center', justifyContent: 'center' },
  field: {
    flex: 1,
    color: COLOR.textPrimary,
    maxHeight: FIELD_MAX_HEIGHT,
    // Centred on the Send disc while it is one line.
    paddingTop: (SIZE.circleButton - TYPE.body.lineHeight) / 2,
    paddingBottom: (SIZE.circleButton - TYPE.body.lineHeight) / 2,
  },
  send: {
    width: SIZE.circleButton,
    height: SIZE.circleButton,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  idle: { backgroundColor: MATERIAL.fillOnGlass },
  pressedIos: { transform: [{ scale: PRESS.scaleDisc }] },
  wash: { backgroundColor: PRESSED_WASH.android },
  counter: { alignSelf: 'flex-end', color: COLOR.textSecondary, paddingHorizontal: SPACE.lg, paddingBottom: SPACE.sm },
  failed: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingHorizontal: SPACE.lg },
  locked: {
    minHeight: SIZE.input,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
  },
  reason: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  well: {
    width: WELL,
    height: WELL,
    borderRadius: RADIUS.capsule,
    backgroundColor: MATERIAL.fillOnGlass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  words: { flex: 1 },
  primary: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  destructive: { color: COLOR.destructive },
})
