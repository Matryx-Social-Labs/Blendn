import { useState, type ReactNode } from 'react'
import { Image as RNImage, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Avatar } from '../../components/ds/Avatar'
import { BroadcastNotice } from '../../components/ds/BroadcastNotice'
import { Button } from '../../components/ds/Button'
import { ChatBubble, type BubbleReaction, type ChatBubbleProps } from '../../components/ds/ChatBubble'
import { type ChatPerson, type Rect } from '../../components/ds/chatShared'
import { CoachMark } from '../../components/ds/CoachMark'
import { Composer, type ComposerProps, type ComposerState } from '../../components/ds/Composer'
import { ContextMenu, LongPressMenu, type MenuItem } from '../../components/ds/ContextMenu'
import { ImageViewer } from '../../components/ds/ImageViewer'
import { PollBubble, type PollBubbleProps } from '../../components/ds/PollBubble'
import { ReactionBar, ReactionPill } from '../../components/ds/ReactionBar'
import { ReceiptMark } from '../../components/ds/ReceiptMark'
import { ReplyPreview } from '../../components/ds/ReplyPreview'
import { SwipeRow, type SwipeAction } from '../../components/ds/SwipeRow'
import { SystemLine, SystemNotice } from '../../components/ds/SystemNotice'
import { TypingIndicator } from '../../components/ds/TypingIndicator'
import { DayPill, UnreadDivider } from '../../components/ds/UnreadDivider'
import type { ChatReaction } from '../../lib/chatReactions'
import { COLOR, RADIUS, SPACE, TYPE } from '../../lib/design/tokens'

/**
 * Every P3 chat and gesture component in every state it draws, on demand
 * (ROUND3 B4; guidelines/components/<Name>.html), and one live room to drive
 * the gestures in.
 *
 * Deep-link `exp+blendn:///preview/ds-p3`. Each cell has a testID
 * (`ds-<component>-<state>`) for a device driver to scroll to and screenshot.
 * The live room (`ds-demo-*`): swipe a bubble right to reply
 * (`ds-demo-bubble-<id>-swipe`), hold one for the menu (`-hold`), tap a
 * reaction, send from the composer (`ds-demo-composer`), tap the photo for the
 * viewer; the Banter row (`ds-demo-swiperow`) slides left.
 *
 * The platform and the accessibility settings are the device's: drive it on
 * iOS and Android, and again with Reduce Motion, Reduce Transparency,
 * Increase Contrast, Bold Text and the largest text size on.
 */
export default function DsP3Preview() {
  const insets = useSafeAreaInsets()
  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + SPACE.xl, paddingBottom: insets.bottom + SPACE.xxl }]}>
        <Text style={styles.display}>P3 · chat and gestures</Text>
        <LiveRoom />
        <Bubbles />
        <Reactions />
        <Menus />
        <Composers />
        <Notices />
        <Polls />
        <Typing />
        <Markers />
        <Replies />
        <Swipes />
        <Coach />
      </ScrollView>
    </View>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <View style={styles.cells}>{children}</View>
    </View>
  )
}

/** A labelled stage; `testID` is the cell's. */
function Cell({ label, testID, children, style }: { label: string; testID: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View testID={testID} style={styles.cell}>
      <Text style={styles.caption}>{label}</Text>
      <View style={[styles.stage, style]}>{children}</View>
    </View>
  )
}

const noop = () => {}
const PANDA: ChatPerson = { name: 'Cosmic Panda' }
const HERON: ChatPerson = { name: 'Quiet Heron' }
const SNAIL: ChatPerson = { name: 'Slow Snail' }
const PHOTO_URI = RNImage.resolveAssetSource(require('../../assets/fixtures/sample-clip-poster.jpg')).uri
/** A public sample clip (the Scene harness's), for the sponsored video. */
const CLIP = 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4'

// ── The live room ───────────────────────────────────────────────────────────

type DemoMessage = {
  id: string
  mine: boolean
  sender: ChatPerson
  text?: string
  photo?: boolean
  time: string
  reactions: BubbleReaction[]
  replyTo?: { name: string; text: string }
  animateIn?: 'send'
}

const SEED: DemoMessage[] = [
  { id: 'a', mine: false, sender: PANDA, text: 'Anyone else here for the B-side argument?', time: '9:38 PM', reactions: [] },
  {
    id: 'b',
    mine: false,
    sender: PANDA,
    text: 'Rumours side two. Fight me.',
    time: '9:38 PM',
    reactions: [
      { emoji: '🔥', count: 3, mine: true },
      { emoji: '😂', count: 1, mine: false },
    ],
  },
  { id: 'c', mine: false, sender: HERON, text: 'set times are up: toit.in/vinyl-night', time: '9:41 PM', reactions: [] },
  { id: 'd', mine: false, sender: HERON, photo: true, time: '9:42 PM', reactions: [] },
  { id: 'e', mine: true, sender: { name: 'You' }, text: 'Tusk. You were right. Don’t tell anyone.', time: '9:44 PM', reactions: [] },
  { id: 'f', mine: false, sender: SNAIL, text: '🔥🔥', time: '9:45 PM', reactions: [] },
]

/** One reaction toggled: yours given or taken back. */
function toggle(reactions: BubbleReaction[], emoji: string): BubbleReaction[] {
  const at = reactions.find((r) => r.emoji === emoji)
  if (!at) return [...reactions, { emoji, count: 1, mine: true }]
  const next = { ...at, mine: !at.mine, count: at.count + (at.mine ? -1 : 1) }
  return next.count ? reactions.map((r) => (r.emoji === emoji ? next : r)) : reactions.filter((r) => r.emoji !== emoji)
}

const textOf = (m: DemoMessage) => (m.photo ? 'Photo' : (m.text ?? ''))

function LiveRoom() {
  const [messages, setMessages] = useState(SEED)
  const [draft, setDraft] = useState('')
  const [reply, setReply] = useState<DemoMessage | null>(null)
  const [menu, setMenu] = useState<{ message: DemoMessage; anchor: Rect } | null>(null)
  const [landed, setLanded] = useState<{ id: string; emoji: string } | null>(null)
  const [viewer, setViewer] = useState<{ message: DemoMessage; from: Rect } | null>(null)
  const [typing, setTyping] = useState(true)

  const react = (id: string, emoji: string) => {
    const was = messages.find((m) => m.id === id)?.reactions.find((r) => r.emoji === emoji)
    setMessages((all) => all.map((m) => (m.id === id ? { ...m, reactions: toggle(m.reactions, emoji) } : m)))
    setLanded(was?.mine ? null : { id, emoji })
  }
  const send = () => {
    const text = draft.trim()
    if (!text) return
    const replyTo = reply ? { name: reply.mine ? 'You' : reply.sender.name, text: textOf(reply) } : undefined
    setMessages((all) => [...all, { id: `m${all.length}`, mine: true, sender: { name: 'You' }, text, time: 'now', reactions: [], replyTo, animateIn: 'send' }])
    setDraft('')
    setReply(null)
  }
  const menuItems = (m: DemoMessage): MenuItem[] =>
    m.mine
      ? [
          { icon: 'reply', label: 'Reply', onPress: () => setReply(m) },
          { icon: 'copy', label: 'Copy', onPress: noop },
        ]
      : [
          { icon: 'user', label: m.sender.name, chevron: true, onPress: noop },
          { icon: 'reply', label: 'Reply', onPress: () => setReply(m) },
          { icon: 'copy', label: 'Copy', onPress: noop },
          { icon: 'flag', label: 'Report…', onPress: noop },
          { icon: 'ban', label: 'Block…', destructive: true, onPress: noop },
        ]
  const bubbleProps = (m: DemoMessage, i: number): ChatBubbleProps => ({
    mine: m.mine,
    sender: m.sender,
    first: messages[i - 1]?.sender.name !== m.sender.name,
    last: messages[i + 1]?.sender.name !== m.sender.name,
    text: m.text,
    photo: m.photo ? { uri: PHOTO_URI, onPress: (from) => setViewer({ message: m, from }) } : undefined,
    replyTo: m.replyTo,
    reactions: m.reactions,
    time: m.time,
  })

  return (
    <Section title="Live room" note="Swipe right to reply · hold for the menu · tap a reaction · send · tap the photo">
      <View testID="ds-demo-feed" style={styles.feed}>
        <DayPill text="Today" />
        {messages.map((m, i) => (
          <ChatBubble
            key={m.id}
            {...bubbleProps(m, i)}
            testID={`ds-demo-bubble-${m.id}`}
            animateIn={m.animateIn}
            landed={landed?.id === m.id ? landed.emoji : undefined}
            onReactionPress={(emoji) => react(m.id, emoji)}
            onReply={() => setReply(m)}
            onLongPress={(anchor) => setMenu({ message: m, anchor })}
            onSenderPress={noop}
            onLinkPress={noop}
            actions={menuItems(m).map(({ label, onPress }) => ({ label, onPress }))}
          />
        ))}
        {typing ? <TypingIndicator people={[SNAIL]} testID="ds-demo-typing" /> : null}
      </View>
      <Composer
        testID="ds-demo-composer"
        value={draft}
        onChangeText={setDraft}
        onSend={send}
        reply={reply ? { name: reply.mine ? 'You' : reply.sender.name, text: textOf(reply) } : null}
        onCancelReply={() => setReply(null)}
      />
      <Button testID="ds-demo-typing-toggle" kind="secondary" size="sm" label={typing ? 'Stop typing' : 'Start typing'} onPress={() => setTyping(!typing)} />
      <LongPressMenu
        testID="ds-demo-menu"
        visible={!!menu}
        anchor={menu?.anchor ?? null}
        side={menu?.message.mine ? 'right' : 'left'}
        items={menu ? menuItems(menu.message) : []}
        reactions={
          menu
            ? {
                mine: menu.message.reactions.filter((r) => r.mine).map((r) => r.emoji),
                onPick: (emoji: ChatReaction) => react(menu.message.id, emoji),
              }
            : undefined
        }
        onClose={() => setMenu(null)}
      >
        {menu ? <ChatBubble {...bubbleProps(menu.message, messages.indexOf(menu.message))} lifted /> : null}
      </LongPressMenu>
      <ImageViewer
        testID="ds-demo-viewer"
        visible={!!viewer}
        uri={PHOTO_URI}
        sender={viewer?.message.sender ?? HERON}
        time={viewer?.message.time ?? ''}
        from={viewer?.from}
        onClose={() => setViewer(null)}
        onMore={noop}
      />
      <Cell label="SwipeRow · drag left" testID="ds-demo-swiperow">
        <SwipeRow actions={ROOM_ACTIONS} onPress={noop} accessibilityLabel="Bass Thursday, Brave Turtle: that drop though, Tuesday">
          <BanterRow title="Bass Thursday" preview="Brave Turtle: that drop though" time="Tue" />
        </SwipeRow>
      </Cell>
    </Section>
  )
}

// ── Every state ─────────────────────────────────────────────────────────────

const BUBBLE_STATES: [string, Partial<ChatBubbleProps>[]][] = [
  ['inbound · a group of two', [{ first: true, last: false, text: 'Anyone else here for the B-side argument?' }, { first: false, text: 'Rumours side two. Fight me.' }]],
  ['yours', [{ mine: true, text: 'Tusk. You were right. Don’t tell anyone.' }]],
  ['a DM · no names, no creature', [{ surface: 'dm', text: 'Still by the stairs? I’m in the green jacket.' }, { surface: 'dm', mine: true, text: 'Coming up, two minutes.', receipt: 'read' }]],
  ['a reply', [{ sender: HERON, text: 'Side one, obviously.', replyTo: { name: 'Cosmic Panda', text: 'Rumours side two. Fight me.' } }]],
  ['reactions · yours outlined', [{ reactions: [{ emoji: '🔥', count: 3, mine: true }, { emoji: '😂', count: 1, mine: false }] }]],
  ['removed · keeps its place', [{ removed: true }]],
  ['a photo', [{ text: undefined, photo: { uri: PHOTO_URI, onPress: noop } }]],
  ['not sent · tap to retry', [{ mine: true, text: 'Coming up, two minutes', failed: true }]],
  ['not sent · the server’s reason', [{ mine: true, text: 'toit.in/vinyl · toit.in/menu · instagram.com/toit', failed: 'Not sent · Two links at most' }]],
  ['waiting for connection', [{ mine: true, surface: 'dm', text: 'On my way', waiting: true }]],
  ['emoji-only · 32 pt', [{ sender: SNAIL, text: '🔥🔥' }]],
  ['a link', [{ sender: HERON, text: 'set times are up: toit.in/vinyl-night', onLinkPress: noop }]],
  ['pressed', [{ previewState: 'pressed' }]],
  ['focused', [{ previewState: 'focused' }]],
]

function Bubbles() {
  return (
    <Section title="ChatBubble" note="Grouping, the tail on the last, the time once; every state">
      {BUBBLE_STATES.map(([label, group], n) => (
        <Cell key={label} label={label} testID={`ds-chatbubble-${n}`}>
          {group.map((props, i) => (
            <ChatBubble key={i} mine={false} sender={PANDA} text="Rumours side two. Fight me." time="9:38 PM" {...props} />
          ))}
        </Cell>
      ))}
      <Cell label="DM receipts · sent, delivered, read" testID="ds-receiptmark-states">
        <ReceiptMark state="sent" />
        <ReceiptMark state="delivered" />
        <ReceiptMark state="read" />
      </Cell>
    </Section>
  )
}

function Reactions() {
  return (
    <Section title="ReactionBar · ReactionPill">
      <Cell label="the bar" testID="ds-reactionbar-default">
        <ReactionBar mine={[]} onPick={noop} />
      </Cell>
      <Cell label="yours · 🔥 on white" testID="ds-reactionbar-yours">
        <ReactionBar mine={['🔥']} onPick={noop} />
      </Cell>
      <Cell label="pressed · ❤️" testID="ds-reactionbar-pressed">
        <ReactionBar mine={[]} onPick={noop} previewPressed={1} />
      </Cell>
      <Cell label="pills · one, a count, yours, landing" testID="ds-reactionpill-states" style={styles.row}>
        <ReactionPill emoji="🔥" count={1} mine={false} onPress={noop} />
        <ReactionPill emoji="🔥" count={3} mine={false} onPress={noop} />
        <ReactionPill emoji="🔥" count={3} mine onPress={noop} />
        <ReactionPill emoji="❤️" count={1} mine landed onPress={noop} />
      </Cell>
    </Section>
  )
}

const MESSAGE_MENU: MenuItem[] = [
  { icon: 'user', label: 'Cosmic Panda', chevron: true, onPress: noop },
  { icon: 'reply', label: 'Reply', onPress: noop },
  { icon: 'copy', label: 'Copy', onPress: noop },
  { icon: 'flag', label: 'Report…', onPress: noop },
  { icon: 'ban', label: 'Block…', destructive: true, onPress: noop },
]
const MENUS: [string, MenuItem[], number?][] = [
  ['theirs, in a room', MESSAGE_MENU],
  ['yours, in a room', MESSAGE_MENU.slice(1, 3)],
  ['still sending', [MESSAGE_MENU[2]]],
  ['a room that refuses writes', [MESSAGE_MENU[2], MESSAGE_MENU[3]]],
  ['theirs, in a DM', MESSAGE_MENU.slice(1, 4)],
  [
    'a Banter row',
    [
      { icon: 'bell-off', label: 'Mute', onPress: noop },
      { icon: 'info', label: 'Room info', onPress: noop },
      { icon: 'log-out', label: 'Leave room', destructive: true, onPress: noop },
    ],
  ],
  ['pressed', MESSAGE_MENU.slice(1, 4), 1],
]

function Menus() {
  return (
    <Section title="ContextMenu" note="R3-D5 5.2: the menu for each kind of message; removed, broadcasts and polls open none">
      {MENUS.map(([label, items, pressed], n) => (
        <Cell key={label} label={label} testID={`ds-contextmenu-${n}`}>
          <ContextMenu items={items} previewPressed={pressed} />
        </Cell>
      ))}
    </Section>
  )
}

const COMPOSERS: [string, Partial<ComposerProps>][] = [
  ['empty', {}],
  ['typing', { value: 'Rumours side two. Fight m' }],
  ['pressed · send', { value: 'Rumours side two. Fight me.', previewState: 'pressed' }],
  ['replying', { reply: { name: 'Cosmic Panda', text: 'Anyone else here for the B-side argument?' } }],
  ['failed', { value: 'Rumours side two. Fight me.', state: 'failed' }],
  ['focused', { previewState: 'focused' }],
  ['the counter · 100 left', { value: 'x'.repeat(900) }],
]
const LOCKED: ComposerState[] = ['muted', 'automuted', 'locked', 'closed', 'ratelimited', 'notcheckedin']

function Composers() {
  const [value, setValue] = useState('')
  return (
    <Section title="Composer" note="Left, ended and banned draw nothing (one line in the feed)">
      {COMPOSERS.map(([label, props]) => (
        <Cell key={label} label={label} testID={`ds-composer-${label.split(' ')[0]}`}>
          <Composer value="" onChangeText={setValue} onSend={noop} onCancelReply={noop} onRetry={noop} {...props} />
        </Cell>
      ))}
      <Cell label="live · type up to five lines" testID="ds-composer-live">
        <Composer value={value} onChangeText={setValue} onSend={() => setValue('')} />
      </Cell>
      {LOCKED.map((state) => (
        <Cell key={state} label={state} testID={`ds-composer-${state}`}>
          <Composer
            value=""
            onChangeText={noop}
            onSend={noop}
            state={state}
            countdown={state === 'ratelimited' ? '0:12' : undefined}
            action={state === 'notcheckedin' ? { label: 'I’m going', onPress: noop } : undefined}
          />
        </Cell>
      ))}
    </Section>
  )
}

function Notices() {
  return (
    <Section title="SystemNotice · SystemLine · BroadcastNotice">
      <Cell label="the thin line" testID="ds-systemline">
        <SystemLine text="Nebula opened the room" />
      </Cell>
      <Cell label="info · with an action" testID="ds-systemnotice-info">
        <SystemNotice icon="shield" text="This room is anonymous. Be kind, keep it safe — people here are real." action={{ label: 'Community guidelines', onPress: noop }} />
      </Cell>
      <Cell label="warn" testID="ds-systemnotice-warn">
        <SystemNotice kind="warn" icon="triangle-alert" text="A message here was taken down. It didn’t meet the community guidelines." />
      </Cell>
      <Cell label="a result for the author" testID="ds-systemnotice-author">
        <SystemNotice icon="flag" text="Your post was taken down. It didn’t meet the community guidelines." action={{ label: 'Write to support', onPress: noop }} />
      </Cell>
      <Cell label="announcement" testID="ds-broadcast-announcement">
        <BroadcastNotice kind="announcement" from="Toit" text="Last call for the terrace: it closes at midnight. The record swap table is by the stairs." time="10:02 PM" />
      </Cell>
      <Cell label="announcement · image" testID="ds-broadcast-announcement-image">
        <BroadcastNotice kind="announcement" from="Toit" text="The record swap table is open by the stairs till 11." time="10:02 PM" media={{ kind: 'image', uri: PHOTO_URI }} />
      </Cell>
      <Cell label="sponsored · text" testID="ds-broadcast-sponsored">
        <BroadcastNotice kind="sponsored" from="Bira 91" text="Two-for-one on the Bira tap till 11. Show the bartender this room." time="10:02 PM" />
      </Cell>
      <Cell label="sponsored · video (tap to play, muted)" testID="ds-broadcast-sponsored-video">
        <BroadcastNotice
          kind="sponsored"
          from="Bira 91"
          text="Two-for-one on the Bira tap till 11."
          time="10:02 PM"
          media={{ kind: 'video', uri: CLIP, poster: PHOTO_URI, duration: '0:10' }}
        />
      </Cell>
      <Cell label="sponsored · video that fails (tap play)" testID="ds-broadcast-sponsored-video-failed">
        <BroadcastNotice kind="sponsored" from="Bira 91" text="Two-for-one on the Bira tap till 11." time="10:02 PM" media={{ kind: 'video', uri: 'https://invalid.example/none.mp4', duration: '0:30' }} />
      </Cell>
    </Section>
  )
}

const OPTIONS = [
  { label: 'One more', votes: 7 },
  { label: 'Call it', votes: 3 },
]
const POLLS: [string, Partial<PollBubbleProps>][] = [
  ['open', {}],
  ['voted', { picked: 0 }],
  ['withheld', { picked: 0, options: OPTIONS.map((o) => ({ ...o, votes: null })) }],
  ['hidden', { picked: 1, options: OPTIONS.map(({ label }) => ({ label })) }],
  ['closed', { picked: 0, closed: true }],
  ['pressed', { previewPressed: 0 }],
]

function Polls() {
  const [picked, setPicked] = useState<number>()
  return (
    <Section title="PollBubble">
      {POLLS.map(([label, props]) => (
        <Cell key={label} label={label} testID={`ds-poll-${label}`}>
          <PollBubble question="Encore: one more or call it?" options={OPTIONS} onVote={noop} {...props} />
        </Cell>
      ))}
      <Cell label="live · vote and change it" testID="ds-poll-live">
        <PollBubble question="Encore: one more or call it?" options={OPTIONS} picked={picked} onVote={setPicked} />
      </Cell>
    </Section>
  )
}

function Typing() {
  return (
    <Section title="TypingIndicator" note="The dots loop while it shows; Reduce Motion holds them">
      <Cell label="one person" testID="ds-typing-one">
        <TypingIndicator people={[PANDA]} />
      </Cell>
      <Cell label="three people" testID="ds-typing-many">
        <TypingIndicator people={[PANDA, HERON, SNAIL]} />
      </Cell>
    </Section>
  )
}

function Markers() {
  return (
    <Section title="UnreadDivider · DayPill">
      <Cell label="the unread divider" testID="ds-unread-default">
        <UnreadDivider />
      </Cell>
      <Cell label="a count" testID="ds-unread-count">
        <UnreadDivider count={3} />
      </Cell>
      <Cell label="day pills" testID="ds-daypill">
        <DayPill text="Today" />
        <DayPill text="Yesterday" />
        <DayPill text="Sat 4 Oct" />
      </Cell>
    </Section>
  )
}

function Replies() {
  return (
    <Section title="ReplyPreview">
      <Cell label="in a bubble" testID="ds-reply-bubble">
        <ReplyPreview name="Cosmic Panda" text="Rumours side two. Fight me." onPress={noop} />
      </Cell>
      <Cell label="a long quote truncates" testID="ds-reply-long">
        <ReplyPreview name="Cosmic Panda" text="Anyone else here for the B-side argument? Because I have opinions and nowhere to put them." />
      </Cell>
      <Cell label="above the composer · ×" testID="ds-reply-composer">
        <ReplyPreview name="Cosmic Panda" text="Anyone else here for the B-side argument?" onCancel={noop} />
      </Cell>
    </Section>
  )
}

const ROOM_ACTIONS: SwipeAction[] = [
  { icon: 'bell-off', label: 'Mute', onPress: noop },
  { icon: 'log-out', label: 'Leave', destructive: true, onPress: noop },
]
const SWIPES: [string, SwipeAction[], boolean][] = [
  ['closed', ROOM_ACTIONS, false],
  ['open · Mute · Leave', ROOM_ACTIONS, true],
  ['a DM · Mark read', [{ icon: 'check-check', label: 'Mark read', onPress: noop }], true],
  ['a match · Unmatch in red', [{ icon: 'heart-off', label: 'Unmatch', destructive: true, onPress: noop }], true],
]

/** A stand-in Banter row (the row itself is the Banter's). */
function BanterRow({ title, preview, time }: { title: string; preview: string; time: string }) {
  return (
    <View style={styles.banter}>
      <Avatar kind="creature" pseudonym={title} size={56} />
      <View style={styles.banterText}>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.banterTitle}>
          {title}
        </Text>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.note}>
          {preview}
        </Text>
      </View>
      <Text style={styles.caption}>{time}</Text>
    </View>
  )
}

function Swipes() {
  return (
    <Section title="SwipeRow" note="H.detent as it crosses halfway; the actions are also the row's accessibility actions">
      {SWIPES.map(([label, actions, open]) => (
        <Cell key={label} label={label} testID={`ds-swiperow-${label.split(' ')[0]}`}>
          <SwipeRow actions={actions} open={open} onPress={noop} accessibilityLabel={`Priya, see you by the stairs?, now`}>
            <BanterRow title="Priya" preview="Priya: see you by the stairs?" time="now" />
          </SwipeRow>
        </Cell>
      ))}
    </Section>
  )
}

function Coach() {
  const [shown, setShown] = useState(true)
  return (
    <Section title="CoachMark" note="One at a time, once; announced, never focused">
      <Cell label="caret top · under a control" testID="ds-coach-top" style={styles.coachStage}>
        <CoachMark text="Hold the button when you’re at the event. It checks you in." caretOffset={SPACE.xxxl} onDismiss={noop} />
      </Cell>
      <Cell label="caret bottom · above a control" testID="ds-coach-bottom">
        <CoachMark text="Swipe a chat left to mute it." caret="bottom" onDismiss={noop} />
      </Cell>
      <Cell label="no action · dismisses on use" testID="ds-coach-noaction" style={styles.coachStage}>
        <CoachMark text="Tap a face to see who’s here." action={false} onDismiss={noop} />
      </Cell>
      <Cell label="live · Got it" testID="ds-coach-live" style={styles.coachStage}>
        {shown ? (
          <CoachMark text="People here can’t see your name or photo until you choose to show them. You decide, per event." onDismiss={() => setShown(false)} />
        ) : (
          <Button kind="secondary" size="sm" label="Show again" onPress={() => setShown(true)} />
        )}
      </Cell>
    </Section>
  )
}

/** The narrowest supported phone (360 dp), so a cell shows what wraps. */
const CELL_WIDTH = 360

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLOR.ink },
  scroll: { paddingHorizontal: SPACE.gutter, gap: SPACE.xxl },
  display: { ...TYPE.display, color: COLOR.textPrimary },
  section: { gap: SPACE.md },
  heading: { ...TYPE.heading, color: COLOR.textPrimary },
  note: { ...TYPE.meta, color: COLOR.textSecondary },
  cells: { gap: SPACE.lg },
  cell: { gap: SPACE.sm, maxWidth: CELL_WIDTH },
  caption: { ...TYPE.label, color: COLOR.textTertiary },
  stage: {
    borderRadius: RADIUS.rowInCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.hairline,
    padding: SPACE.lg,
    gap: SPACE.md,
  },
  feed: { gap: SPACE.md, paddingLeft: SPACE.xl },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs },
  banter: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, padding: SPACE.xs },
  banterText: { flex: 1 },
  banterTitle: { ...TYPE.bodyStrong, color: COLOR.textPrimary },
  coachStage: { paddingTop: SPACE.xl },
})
