import { Image } from 'expo-image'
import { memo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { FadeOut } from 'react-native-reanimated'

import { revealConfirmation } from '../../lib/conversationReveal'
import { COLOR, DURATION, ICON, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'
import type { PrivateMessage } from '../../lib/directThread'
import { clockTime } from '../../lib/time'
import { Avatar } from '../ds/Avatar'
import { Button } from '../ds/Button'
import { ChatBubble } from '../ds/ChatBubble'
import type { Rect } from '../ds/chatShared'
import type { Face } from '../ds/Facepile'
import type { Receipt } from '../ds/ReceiptMark'
import { monoCaption } from '../ds/MonoFamily'
import { CONTROL_FONT_CAP, font, useBoldText } from '../ds/shared'
import { Sheet } from '../ds/Sheet'
import { TextField } from '../ds/TextField'
import { Icon } from '../ui/Icon'

/** The photo preview's height (R3-D5 5.9 #32). */
const PREVIEW_HEIGHT = 280
/** `.xopen .k`: the mono label tracks out 0.4. */
const QUESTION_LABEL_TRACKING = 0.4
/** `.xsys`: the matched line stops at 300 and wraps, centred. */
const SYS_LINE_MAX = 300
/** The confirm's faces: your creature, then your face, 56 each. */
const CONFIRM_FACE = 56
// design-exception: the opener card's radius is 18 (`.xopen`), between rowInCard (16) and tile (20)
const OPENER_RADIUS = 18
// design-exception: the opener card is 10 in vertically (`.xopen` padding 10 14), off the SPACE scale
const OPENER_PAD_V = 10
// design-exception: and 14 at the sides
const OPENER_PAD_H = 14

/**
 * The thread's opener (Flow 5 D-A, dm.html `xThread`): a permanent header above the oldest message, seen by both,
 * whoever types first — "You matched in the room · Tonight · 7:42 PM", then tonight's question when the room asks one,
 * so neither of you starts from nothing. It scrolls away as the conversation grows.
 */
export function MatchOpenerCard({ line, question }: { line: string; question: string | null }) {
  const bold = useBoldText()
  return (
    <View testID="dm-opener" style={styles.opener}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[monoCaption(bold), styles.secondary, styles.sysLine]}>
        {line}
      </Text>
      {question ? (
        <View testID="dm-opener-question" accessible accessibilityLabel={`Tonight’s question: ${question}`} style={styles.question}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[monoCaption(bold), styles.secondary, styles.questionLabel]}>
            TONIGHT’S QUESTION
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('rowTitle', bold), styles.ink]}>
            {question}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

/** An empty thread (Flow 5 DM #10): "Say hi to {name}." and Say hi, which sends at once. */
export function SayHi({ line, onPress }: { line: string | null; onPress: () => void }) {
  const bold = useBoldText()
  return (
    <Animated.View exiting={FadeOut.duration(DURATION.quick)} style={styles.sayHi}>
      {line ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>{line}</Text> : null}
      <Button kind="lit" size="md" icon="hand" label="Say hi" onPress={onPress} accessibilityHint="Sends “Hey 👋”" testID="dm-say-hi" />
    </Animated.View>
  )
}

/**
 * A photo before it goes (R3-D5 5.9 #32): the picked photo, a caption, and the
 * promise that it is re-encoded on the phone first. Send is the screen's
 * primary (`H.send` follows on the composer's rule); Cancel puts it away.
 */
export function PhotoPreviewSheet({
  uri,
  name,
  onSend,
  onClose,
}: {
  uri: string | null
  name: string
  onSend: (caption: string) => void
  onClose: () => void
}) {
  const bold = useBoldText()
  const [caption, setCaption] = useState('')
  const [shownFor, setShownFor] = useState(uri)
  // A new photo starts without the last one's caption (adjusted in render).
  if (uri && uri !== shownFor) {
    setShownFor(uri)
    setCaption('')
  }
  return (
    <Sheet
      visible={!!uri}
      onClose={onClose}
      title={`Send to ${name}`}
      actions={[
        // H.send is the send's own (the composer's rule), so no press haptic on top.
        { label: 'Send', kind: 'primary', onPress: () => onSend(caption.trim()), pressHaptic: false, testID: 'dm-photo-send' },
        { label: 'Cancel', kind: 'tertiary', onPress: onClose },
      ]}
      testID="dm-photo-preview"
    >
      {uri || shownFor ? <Image source={{ uri: (uri || shownFor) as string }} contentFit="cover" style={styles.preview} accessibilityLabel="The photo you picked" /> : null}
      <TextField value={caption} onChangeText={setCaption} placeholder="Add a caption" />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>Re-encoded on your phone before upload: no location data leaves it.</Text>
    </Sheet>
  )
}

/** The header's reveal line (Flow 5 DM #01–#05): an eye (seen) or eye-off and the sentence. */
export function RevealLine({ seen, text }: { seen: boolean; text: string }) {
  const bold = useBoldText()
  return (
    <>
      <Icon name={seen ? 'eye' : 'eye-off'} size={ICON.inline} color={COLOR.textSecondary} />
      {/* In the header's capsule, a box of fixed height: it stops at the control cap, as the name above it does (RC drive 2 D-3). */}
      <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold), styles.secondary, styles.shrink]}>
        {text}
      </Text>
    </>
  )
}

/** "{name} asked to know who you are", under the bar (Flow 5 DM #02). */
export function NudgeLine({ text }: { text: string }) {
  const bold = useBoldText()
  return <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.ink, styles.centre]}>{text}</Text>
}

/**
 * Showing them who you are (Flow 5 D-A, dm.html `xConfirm`): the one confirm, and it says it can't be undone before
 * the tap. Who sees what, then the change itself (your creature, then your face), then Show them (the screen's one
 * gradient) and Not now. The press is silent: the haptic is the server's H.success. Refused for want of a photo, Not
 * yet says the server's sentence.
 */
export function RevealSheets({
  name,
  sheet,
  busy,
  you,
  yourPhoto,
  onShow,
  onClose,
  onAddPhoto,
}: {
  name: string
  sheet: 'confirm' | { notYet: string } | null
  busy: boolean
  /** Your side as they see it now: your creature. */
  you: Face
  /** What they will see: your photo, or your creature when there is none yet (the server then says Not yet). */
  yourPhoto: Face
  onShow: () => void
  onClose: () => void
  onAddPhoto: () => void
}) {
  const copy = revealConfirmation(name)
  return (
    <>
      <Sheet
        visible={sheet === 'confirm'}
        onClose={onClose}
        title={copy.title}
        body={copy.body}
        actions={[
          { label: copy.confirm, kind: 'primary', onPress: onShow, loading: busy, pressHaptic: false },
          { label: 'Not now', kind: 'secondary', onPress: onClose },
        ]}
        testID="dm-reveal-sheet"
      >
        <View style={styles.change} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Avatar size={CONFIRM_FACE} {...you} testID="dm-reveal-sheet-from" />
          <Icon name="chevron-right" size={ICON.control} color={COLOR.textSecondary} />
          <Avatar size={CONFIRM_FACE} {...yourPhoto} testID="dm-reveal-sheet-to" />
        </View>
      </Sheet>
      <Sheet
        visible={!!sheet && sheet !== 'confirm'}
        onClose={onClose}
        icon="image"
        title="Not yet"
        body={sheet && sheet !== 'confirm' ? sheet.notYet : undefined}
        actions={[
          { label: 'Add a photo', kind: 'lit', onPress: onAddPhoto },
          { label: 'Close', kind: 'tertiary', onPress: onClose },
        ]}
        testID="dm-not-yet"
      />
    </>
  )
}

export type DmRowHandlers = {
  menu: (m: PrivateMessage, anchor: Rect) => void
  retry: (m: PrivateMessage) => void
  reply: (m: PrivateMessage) => void
  photo: (m: PrivateMessage, from: Rect) => void
  link: (url: string) => void
}

/**
 * One DM message (Flow 5 DM frames): no names, no faces, no reactions — one
 * other person. A photo is its own bubble, its caption the next; the receipt
 * sits under your last message only. Memoised for the keystroke re-render.
 */
export const DmMessageRow = memo(function DmMessageRow({
  item,
  mine,
  name,
  first,
  last,
  receipt,
  animate,
  handlers,
}: {
  item: PrivateMessage
  mine: boolean
  /** Theirs as the server names them; yours is "You". */
  name: string
  first: boolean
  last: boolean
  receipt?: Receipt | null
  /** Rises into place: your own send (#12), or somebody's that arrived while you were at the bottom (#13). */
  animate: boolean
  handlers: DmRowHandlers
}) {
  const photoUri = item.localUri || item.mediaUrl
  const text = item.text ?? ''
  const shared = {
    surface: 'dm' as const,
    mine,
    sender: { name: mine ? 'You' : name },
    time: clockTime(item.createdAt),
    removed: item.removed,
    failed: item.failed ? item.failedLine || true : false,
    onRetry: () => handlers.retry(item),
    onReply: item.failed || item.removed || item.waiting || item.id.startsWith('local-') ? undefined : () => handlers.reply(item),
    onLongPress: item.removed ? undefined : (anchor: Rect) => handlers.menu(item, anchor),
    // Yours rise from the composer (#12); theirs arrive with a 12 pt rise and a fade (#13, opacity only under Reduce Motion).
    animateIn: animate ? (mine ? ('send' as const) : ('arrive' as const)) : undefined,
  }
  // A photo removed by moderation, as its sender sees it (round 4 #37): the photo-sized dashed frame, never a text pill.
  // Its caption went with it.
  if (item.removed && (photoUri || item.mediaType === 'image')) {
    return (
      <View style={first ? styles.runStart : styles.inRun}>
        <ChatBubble {...shared} removed="photo" testID={`dm-photo-${item.id}`} first={first} last={last} receipt={receipt ?? undefined} />
      </View>
    )
  }
  return (
    <View style={first ? styles.runStart : styles.inRun}>
      {photoUri && !item.removed ? (
        <ChatBubble
          {...shared}
          testID={`dm-photo-${item.id}`}
          first={first}
          last={last && !text}
          photo={{ uri: photoUri, progress: item.progress, onPress: (from) => handlers.photo(item, from) }}
          receipt={!text && receipt ? receipt : undefined}
          waiting={!text && item.waiting}
        />
      ) : null}
      {text || !photoUri || item.removed ? (
        <View style={photoUri && !item.removed ? styles.inRun : undefined}>
          <ChatBubble
            {...shared}
            testID={`dm-bubble-${item.id}`}
            first={first && !photoUri}
            last={last}
            text={item.removed ? '' : text}
            replyTo={item.replyTo ? { name: item.replyTo.senderName, text: quoteText(item.replyTo) } : undefined}
            receipt={receipt ?? undefined}
            waiting={item.waiting}
            onLinkPress={handlers.link}
          />
        </View>
      ) : null}
    </View>
  )
})

/** A reply's quote as the bubble draws it. */
export function quoteText(q: NonNullable<PrivateMessage['replyTo']>): string {
  if (q.unavailable) return 'Message unavailable'
  return q.text ?? (q.mediaType === 'image' ? 'Photo' : q.mediaType === 'video' ? 'Video' : '')
}

const styles = StyleSheet.create({
  opener: { alignItems: 'center', marginBottom: SPACE.xs },
  /** `.xsys`: 14 above, 2 under, centred, 300 at most. */
  sysLine: { marginTop: SPACE.md + SPACE.xxs, marginBottom: SPACE.xxs, textAlign: 'center', maxWidth: SYS_LINE_MAX },
  /** `.xopen`: 12 under the line, 8 in from the 16 gutter. */
  question: {
    alignSelf: 'stretch',
    marginTop: SPACE.md,
    marginHorizontal: SPACE.sm,
    borderRadius: OPENER_RADIUS,
    paddingVertical: OPENER_PAD_V,
    paddingHorizontal: OPENER_PAD_H,
    backgroundColor: COLOR.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.hairlineStrong,
    gap: SPACE.xs,
  },
  questionLabel: { letterSpacing: QUESTION_LABEL_TRACKING },
  change: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.md, paddingVertical: SPACE.xs + SPACE.xxs },
  sayHi: { alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.xl },
  preview: { height: PREVIEW_HEIGHT, borderRadius: RADIUS.rowInCard, backgroundColor: COLOR.surface },
  runStart: { marginTop: SPACE.lg },
  inRun: { marginTop: SPACE.xs },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  centre: { textAlign: 'center' },
  shrink: { flexShrink: 1 },
})
