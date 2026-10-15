import { Image } from 'expo-image'
import { memo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { FadeOut } from 'react-native-reanimated'

import { COLOR, DURATION, RADIUS, SPACE } from '../../lib/design/tokens'
import type { PrivateMessage } from '../../lib/directThread'
import { chatClock } from '../../lib/time'
import { Avatar } from '../ds/Avatar'
import { Button } from '../ds/Button'
import { ChatBubble } from '../ds/ChatBubble'
import type { Rect } from '../ds/chatShared'
import type { Face } from '../ds/Facepile'
import type { Receipt } from '../ds/ReceiptMark'
import { font, useBoldText } from '../ds/shared'
import { Sheet } from '../ds/Sheet'
import { TextField } from '../ds/TextField'

/** The photo preview's height (R3-D5 5.9 #32). */
const PREVIEW_HEIGHT = 280
/** The opener's two faces, 44 pt, overlapping by 10. */
const OPENER_FACE = 44
const OPENER_OVERLAP = SPACE.sm + SPACE.xxs

/**
 * The match opener (Flow 5 DM #09): a permanent header above the oldest
 * message — you and them, "You both said yes." — seen by both, whoever types
 * first, scrolling away as the conversation grows.
 */
export function MatchOpenerCard({ you, them, title, body }: { you: Face; them: Face; title: string; body: string }) {
  const bold = useBoldText()
  return (
    <View testID="dm-opener" style={styles.opener}>
      <View style={styles.faces}>
        <Avatar size={OPENER_FACE} ring={COLOR.surface} {...you} />
        <View style={styles.overlap}>
          <Avatar size={OPENER_FACE} ring={COLOR.surface} {...them} />
        </View>
      </View>
      <Text accessibilityRole="header" style={[font('heading', bold), styles.ink, styles.centre]}>
        {title}
      </Text>
      <Text style={[font('meta', bold), styles.secondary, styles.centre]}>{body}</Text>
    </View>
  )
}

/** An empty thread (Flow 5 DM #10): "Say hi to {name}." and Say hi, which sends at once. */
export function SayHi({ line, onPress }: { line: string | null; onPress: () => void }) {
  const bold = useBoldText()
  return (
    <Animated.View exiting={FadeOut.duration(DURATION.quick)} style={styles.sayHi}>
      {line ? <Text style={[font('meta', bold), styles.secondary]}>{line}</Text> : null}
      <Button kind="secondary" size="md" label="Say hi" onPress={onPress} accessibilityHint="Sends “Hey 👋”" testID="dm-say-hi" />
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
        { label: 'Send', kind: 'primary', onPress: () => onSend(caption.trim()) },
        { label: 'Cancel', kind: 'tertiary', onPress: onClose },
      ]}
      testID="dm-photo-preview"
    >
      {uri || shownFor ? <Image source={{ uri: (uri || shownFor) as string }} contentFit="cover" style={styles.preview} accessibilityLabel="The photo you picked" /> : null}
      <TextField value={caption} onChangeText={setCaption} placeholder="Add a caption" />
      <Text style={[font('meta', bold), styles.secondary]}>Re-encoded on your phone before upload: no location data leaves it.</Text>
    </Sheet>
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
  /** Your own send, rising from the composer (#12). */
  animate: boolean
  handlers: DmRowHandlers
}) {
  const photoUri = item.localUri || item.mediaUrl
  const text = item.text ?? ''
  const shared = {
    surface: 'dm' as const,
    mine,
    sender: { name: mine ? 'You' : name },
    time: chatClock(item.createdAt),
    removed: item.removed,
    failed: item.failed ? item.failedLine || true : false,
    onRetry: () => handlers.retry(item),
    onReply: item.failed || item.removed || item.waiting || item.id.startsWith('local-') ? undefined : () => handlers.reply(item),
    onLongPress: item.removed ? undefined : (anchor: Rect) => handlers.menu(item, anchor),
    animateIn: animate ? ('send' as const) : undefined,
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
  opener: {
    marginBottom: SPACE.lg,
    padding: SPACE.lg,
    gap: SPACE.sm,
    borderRadius: RADIUS.sheet,
    backgroundColor: COLOR.surface,
    alignItems: 'center',
  },
  faces: { flexDirection: 'row' },
  overlap: { marginLeft: -OPENER_OVERLAP },
  sayHi: { alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.xl },
  preview: { height: PREVIEW_HEIGHT, borderRadius: RADIUS.rowInCard, backgroundColor: COLOR.surface },
  runStart: { marginTop: SPACE.lg },
  inRun: { marginTop: SPACE.xs },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  centre: { textAlign: 'center' },
})
