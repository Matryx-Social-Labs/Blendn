import { Ionicons } from '@expo/vector-icons'
import { memo, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text as RNText, View } from 'react-native'

import { Avatar } from '../ds/Avatar'
import { Button } from '../ds/Button'
import { RadioCard } from '../ds/RadioCard'
import { Sheet } from '../ds/Sheet'
import { Stepper } from '../ds/Stepper'
import { TextArea } from '../ds/TextField'
import { CONTROL_FONT_CAP, font, minTarget, useBoldText } from '../ds/shared'
import { Icon } from '../ui/Icon'
import { Text } from '../ui/Text'
import { BOARD_MAX_POST_LENGTH, boardMarkSeed, spacesLabel, type BoardPost } from '../../lib/board'
import { COLOR, FONT_FAMILY, ICON as DS_ICON, RADIUS, SPACE } from '../../lib/design/tokens'
import { EMBER, EMBER_RADIUS, ICON, OPACITY } from '../../lib/theme'

/**
 * The board's pieces (Flow 4 Board, flow4.js `post` and `board`). The rules
 * docs/PLACEHOLDER_SCREENS.md §6 set still hold: pseudonyms only, two shapes
 * with one accent, the counter never the only difference, no confirm on Ask.
 */

/** An offer's mark is 40; a seeking's is quieter (the frame's 28, on the Avatar scale's 32). */
const MARK = { offer: 40, seeking: 32 } as const

/** Up to this many spaces on an offer — the server's own bound. */
export const MAX_SPACES = 20

/** The composer's text box: the frame's 112, not the TextArea's 160 default. */
const COMPOSER_MIN_HEIGHT = 112

/**
 * Say it aloud on iOS. Android reads `accessibilityLiveRegion`; iOS has none,
 * so a result that appears where the finger is not is otherwise silent.
 */
export function announce(text: string) {
  if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(text)
}

/**
 * A person on the board, drawn as their creature (the ds Avatar).
 *
 * Seeded on the handle (`boardMarkSeed`), never a user id — the board does not
 * send one — and never a photo: the board is pseudonymous, and a face would be
 * the one place identity is handed over before anybody agreed to it.
 *
 * Decorative: the handle beside it is what identifies somebody.
 */
export function BoardMark({ seed, size = MARK.offer }: { seed: string; size?: number }) {
  return <Avatar kind="creature" pseudonym={seed} size={size} />
}

/**
 * The way in, on the event screen. Before doors only — after them the room is
 * the place, and the board is closed.
 */
export function BoardEntry({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="The Board. Going alone? See who is looking for company, or offer a space."
      style={({ pressed }) => [styles.entry, pressed && styles.pressed]}
    >
      <Ionicons name="people-outline" size={ICON.lg} color={EMBER.textPrimary} />
      <View style={styles.entryText}>
        <Text variant="bodyStrong">The Board</Text>
        <Text variant="meta">Going alone? See who&apos;s looking for company — or offer a space.</Text>
      </View>
      <Ionicons name="chevron-forward" size={ICON.md} color={EMBER.textSecondary} />
    </Pressable>
  )
}

/** What a card you did not write shows where its action goes. */
export type AskState =
  | { kind: 'idle' }
  | { kind: 'asking' }
  /** A state, never an error: "Waiting on them", "They said yes", "Closed". */
  | { kind: 'settled'; line: string }
  /** The server said no, and said which gate. Shown with the button still there. */
  | { kind: 'refused'; line: string }

export const IDLE: AskState = { kind: 'idle' }

/**
 * One post (flow4.js `post`).
 *
 * ## Two shapes, one accent
 *
 * An **offer** is a solid card (surface, radius 32) with its spaces as the
 * loudest thing on it, the count in Geist Mono: the board's one real-time
 * signal. A **seeking** (and a `chat`) is words first with no panel and a
 * smaller mark. The kind is also said in words ("Offering", "Looking"), so the
 * counter is never the only thing telling them apart.
 *
 * Memoised: a post and its ask state are stable objects, so a keystroke or one
 * card's spinner does not redraw the rest of the board.
 */
export const BoardPostCard = memo(function BoardPostCard({
  post,
  eventId,
  ask,
  onAsk,
  onTakeDown,
  onMore,
}: {
  post: BoardPost
  eventId: string
  ask: AskState
  onAsk: (post: BoardPost) => void
  onTakeDown: (post: BoardPost) => void
  /** Report or block the author — anybody's post but yours. */
  onMore: (post: BoardPost) => void
}) {
  const bold = useBoldText()
  const offer = post.kind === 'offer'
  const spaces = offer ? spacesLabel(post.spacesLeft) : null
  const kindWord = offer ? 'Offering' : post.kind === 'seeking' ? 'Looking' : 'Saying'
  const full = offer && post.spacesLeft !== null && post.spacesLeft <= 0

  const byline = (
    <View style={styles.byline}>
      <BoardMark seed={boardMarkSeed(post.author, eventId, post.id)} size={offer ? MARK.offer : MARK.seeking} />
      <View style={styles.bylineText}>
        <RNText style={[font('bodyStrong', bold), styles.ink]}>{post.author}</RNText>
        <RNText style={[font('meta', bold), styles.secondary]}>{post.mine ? `${kindWord} · yours` : kindWord}</RNText>
      </View>
      {post.mine ? null : (
        <Pressable
          onPress={() => onMore(post)}
          accessibilityRole="button"
          accessibilityLabel={`More options for ${post.author}'s post`}
          style={({ pressed }) => [styles.more, pressed && styles.pressed]}
        >
          <Icon name="ellipsis" size={DS_ICON.control} color={COLOR.textSecondary} />
        </Pressable>
      )}
    </View>
  )

  let footer: ReactNode = null
  if (post.mine) {
    footer = <MineFooter count={post.requestCount} onTakeDown={() => void onTakeDown(post)} />
  } else if (post.kind !== 'chat' || ask.kind === 'settled') {
    // A `chat` post asks nothing of anybody, so it offers nothing to ask.
    footer = <AskFooter ask={ask} full={full} author={post.author} onAsk={() => void onAsk(post)} />
  }

  return (
    <View style={offer ? styles.offer : styles.seeking}>
      {offer ? byline : null}
      {spaces ? <SpacesLine spacesLeft={post.spacesLeft} label={spaces} full={full} /> : null}
      <RNText style={[font('body', bold), styles.ink]}>{post.body}</RNText>
      {offer ? null : byline}
      {footer}
    </View>
  )
})

/** "2 spaces left": the count in Geist Mono at the title's size, the words in the title; "Full" in textSecondary. */
function SpacesLine({ spacesLeft, label, full }: { spacesLeft: number | null; label: string; full: boolean }) {
  const bold = useBoldText()
  if (full || spacesLeft === null) return <RNText style={[font('title', bold), styles.secondary]}>{label}</RNText>
  const count = String(spacesLeft)
  return (
    <RNText style={[font('title', bold), styles.ink]}>
      <RNText style={[font('title', bold, FONT_FAMILY.mono[700]), styles.tabular]}>{count}</RNText>
      {label.slice(count.length)}
    </RNText>
  )
}

function MineFooter({ count, onTakeDown }: { count: number; onTakeDown: () => void }) {
  const bold = useBoldText()
  return (
    <View style={styles.footer}>
      <RNText style={[font('meta', bold), styles.secondary, styles.footerLine]}>
        {count === 0 ? 'Nobody has asked yet' : `${count} asked. Answer in the Banter.`}
      </RNText>
      <Pressable
        onPress={onTakeDown}
        accessibilityRole="button"
        accessibilityLabel="Take down your post"
        hitSlop={(minTarget() - SPACE.xl) / 2}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <RNText maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.ink]}>
          Take down
        </RNText>
      </Pressable>
    </View>
  )
}

/**
 * Ask, then the answer in place.
 *
 * No confirm dialog: the ask is the moment somebody feels most exposed, and a
 * "Are you sure?" says it is dangerous. A strong neutral (white), not the
 * gradient; no press haptic, `H.success` when the ask is recorded (the
 * screen's). The button holds a spinner while the request is out, then the
 * card says what happened. A refusal is the server's sentence, destructive.
 */
function AskFooter({ ask, full, author, onAsk }: { ask: AskState; full: boolean; author: string; onAsk: () => void }) {
  const bold = useBoldText()
  if (ask.kind === 'settled') {
    return (
      <RNText accessibilityLiveRegion="polite" style={[font('meta', bold), styles.secondary]}>
        {ask.line}
      </RNText>
    )
  }
  if (full) return <RNText style={[font('meta', bold), styles.secondary]}>No spaces left</RNText>

  return (
    <View style={styles.footer}>
      {ask.kind === 'refused' ? (
        <RNText accessibilityLiveRegion="polite" style={[font('meta', bold), styles.refused, styles.footerLine]}>
          {ask.line}
        </RNText>
      ) : null}
      <Button
        label="Ask to join"
        kind="strong"
        size="md"
        pressHaptic={false}
        loading={ask.kind === 'asking'}
        onPress={onAsk}
        // The visible words first, so voice control's "tap Ask to join" works (WCAG 2.5.3).
        accessibilityLabel={`Ask to join, ${author}`}
        style={styles.askButton}
      />
    </View>
  )
}

export type ComposeKind = 'offer' | 'seeking'
export interface BoardDraft {
  kind: ComposeKind
  body: string
  spacesLeft?: number
}

const KINDS = [
  { value: 'offer', title: 'I have space', hint: 'You’re offering a ride or a table.', icon: 'car' },
  { value: 'seeking', title: 'I’m looking', hint: 'You want to join someone’s.', icon: 'hand' },
] as const

/**
 * Write a post: an L3 sheet (flow4.js board `composer-*`, A61). The kind is two
 * RadioCards in the glyph form (a glyph well and the consequence line), the
 * text with its n/500 counter, the spaces stepper (1–20) for an offer, then
 * Post and Cancel.
 *
 * Owns its draft, so typing redraws this and not the board under it. The
 * screen closes it on success, which drops the draft; on a refusal it stays
 * open with every word kept, and the server's sentence stays under the field
 * until the next try — a toast is gone before somebody has read which gate
 * they missed.
 */
export function BoardComposer({
  visible,
  posting,
  refusal,
  onPost,
  onCancel,
}: {
  visible: boolean
  posting: boolean
  refusal: string | null
  onPost: (draft: BoardDraft) => void
  onCancel: () => void
}) {
  const bold = useBoldText()
  const [kind, setKind] = useState<ComposeKind>('offer')
  const [body, setBody] = useState('')
  const [spaces, setSpaces] = useState(1)
  const empty = body.trim().length === 0
  const tooLong = [...body].length > BOARD_MAX_POST_LENGTH

  return (
    <Sheet
      visible={visible}
      onClose={onCancel}
      title="Write a post"
      actions={[
        {
          label: 'Post',
          kind: 'primary',
          loading: posting,
          disabled: empty || tooLong,
          onPress: () => onPost({ kind, body: body.trim(), ...(kind === 'offer' ? { spacesLeft: spaces } : {}) }),
        },
        { label: 'Cancel', kind: 'tertiary', onPress: onCancel },
      ]}
      testID="board-composer"
    >
      <View style={styles.composer}>
        <View style={styles.kinds} accessibilityRole="radiogroup">
          {KINDS.map((k) => (
            <RadioCard
              key={k.value}
              title={k.title}
              hint={k.hint}
              icon={k.icon}
              selected={kind === k.value}
              onPress={() => setKind(k.value)}
              testID={`board-kind-${k.value}`}
            />
          ))}
        </View>
        <TextArea
          label="Your post"
          value={body}
          onChangeText={setBody}
          limit={BOARD_MAX_POST_LENGTH}
          minHeight={COMPOSER_MIN_HEIGHT}
          error={refusal ?? undefined}
          placeholder={kind === 'offer' ? 'Driving over from Indiranagar at 8 — room for two.' : 'Going alone. Anyone heading over from Koramangala?'}
        />
        {kind === 'offer' ? (
          <View style={styles.spacesRow}>
            <RNText style={[font('bodyStrong', bold), styles.ink, styles.footerLine]}>Spaces</RNText>
            <Stepper label="Spaces" value={spaces} onChange={setSpaces} min={1} max={MAX_SPACES} onGlass={Platform.OS === 'ios'} disabled={posting} />
          </View>
        ) : null}
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  pressed: { opacity: OPACITY.pressed },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  refused: { color: COLOR.destructive },
  tabular: { fontVariant: ['tabular-nums'] },

  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.lg,
    padding: SPACE.lg,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surfaceSunken,
  },
  entryText: { flex: 1, gap: SPACE.xxs },

  // An offer: a solid card, the counter loud.
  offer: { gap: SPACE.sm + SPACE.xxs, padding: SPACE.lg, borderRadius: RADIUS.card, backgroundColor: COLOR.surface },
  // A seeking: no panel, words first.
  seeking: { gap: SPACE.sm + SPACE.xxs, paddingVertical: SPACE.xs, paddingHorizontal: SPACE.sm },

  byline: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm + SPACE.xxs },
  bylineText: { flex: 1 },
  // A menu is a target, not an icon.
  more: { width: minTarget(), height: minTarget(), alignItems: 'center', justifyContent: 'center', marginRight: -SPACE.md },

  footer: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: SPACE.md, marginTop: SPACE.xs },
  footerLine: { flex: 1 },
  askButton: { marginLeft: 'auto' },

  composer: { gap: SPACE.lg },
  kinds: { flexDirection: 'row', gap: SPACE.md },
  spacesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
})
