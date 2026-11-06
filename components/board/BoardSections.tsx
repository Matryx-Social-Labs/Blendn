import { Ionicons } from '@expo/vector-icons'
import { memo, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text as RNText, View } from 'react-native'

import { Avatar } from '../ds/Avatar'
import { Button } from '../ds/Button'
import { GlyphWell } from '../ds/StateScreen'
import { RadioCard } from '../ds/RadioCard'
import { Sheet } from '../ds/Sheet'
import { Stepper } from '../ds/Stepper'
import { TextArea } from '../ds/TextField'
import { monoCaption } from '../ds/MonoFamily'
import { CONTROL_FONT_CAP, font, minTarget, SELECTION, useBoldText } from '../ds/shared'
import { Icon, type IconName } from '../ui/Icon'
import { Text } from '../ui/Text'
import { BOARD_MAX_POST_LENGTH, boardMarkSeed } from '../../lib/board'
import { asksWords, isFull, kindGlyph, kindWords, postAction, postAge, spotsWords } from '../../lib/lobby'
import { Label } from './LobbyParts'
import { PostPhoto } from './PostPhoto'
import type { BoardPostView } from '../../lib/chatPaging'
import { COLOR, FONT_FAMILY, ICON as DS_ICON, RADIUS, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { ICON, OPACITY, tint } from '../../lib/theme'

/**
 * The board's pieces (Flow 4 Board, flow4.js `post` and `board`). The rules
 * docs/PLACEHOLDER_SCREENS.md §6 set still hold: pseudonyms only, two shapes
 * with one accent, the counter never the only difference, no confirm on Ask.
 */

/** Every post's mark is 40 (L-A `.lp .ph`). */
const MARK = 40
/** `.lp`: 24 pt cards. */
const CARD_RADIUS = RADIUS.sheet
/** `.lp .mo`: the ⋯ is drawn 32 wide; its slop brings the target to 44 (48 on Android). */
const MORE_WIDTH = 32
const MORE_SLOP = { left: (minTarget() - MORE_WIDTH) / 2, right: (minTarget() - MORE_WIDTH) / 2 }
/** `.kt`: the kind pill's glyph is 14, a step under the inline 16, so the pill holds the words at 13. */
const PILL_GLYPH = 14
/** `.kt` / `.ks`: the kind and spots pills. */
const PILL_HEIGHT = 26

/** Up to this many spaces on an offer — the server's own bound. */
export const MAX_SPACES = 20

/** The server's zod `max(500)` counts UTF-16 units, so the counter and the cap do too. */
const utf16Length = (value: string) => value.length

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
export function BoardMark({ seed, size = MARK }: { seed: string; size?: number }) {
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
      accessibilityLabel="The Lobby. Going alone? See who’s looking for company, or offer a spot."
      style={({ pressed }) => [styles.entry, pressed && styles.pressed]}
    >
      <Ionicons name="people-outline" size={ICON.lg} color={COLOR.textPrimary} />
      <View style={styles.entryText}>
        <Text variant="bodyStrong">The Lobby</Text>
        <Text variant="meta">Going alone? See who’s looking for company, or offer a spot.</Text>
      </View>
      <Ionicons name="chevron-forward" size={ICON.md} color={COLOR.textSecondary} />
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
 * One post (L-A, lobby.css `.lp`): the creature and the room name, how old it is, the kind pill and the spots pill, the
 * words, its one photo, and one action — "Ask to join" on an offer, "Say hi" on a search, none on Just saying.
 *
 * Creatures for everyone (decided): the Lobby is pseudonymous, so a face would hand identity over before anybody said
 * yes. Yours is ringed in violet and says You; its action is how many asked and the way to them.
 *
 * Memoised: a post and its ask state are stable objects, so one card's spinner does not redraw the rest of the Lobby.
 */
export const BoardPostCard = memo(function BoardPostCard({
  post,
  eventId,
  ask,
  readOnly = false,
  onAsk,
  onTakeDown,
  onMore,
  onSeeAsks,
  onWriteNew,
}: {
  post: BoardPostView
  eventId: string
  ask: AskState
  /** After doors: read, never asked. */
  readOnly?: boolean
  onAsk: (post: BoardPostView) => void
  onTakeDown: (post: BoardPostView) => void
  /** Report or block the author — anybody's post but yours. */
  onMore: (post: BoardPostView) => void
  onSeeAsks?: () => void
  /** From a post that was taken down: the composer. */
  onWriteNew?: () => void
}) {
  const bold = useBoldText()
  // Yours, and moderation took it down (SV9): the card says so and why, in place of the post.
  if (post.mine && post.takenDown) return <TakenDownCard onWriteNew={onWriteNew} />
  const spots = spotsWords(post)
  const full = isFull(post)

  let footer: ReactNode = null
  if (post.mine) {
    footer = <MineFooter count={post.requestCount} onSeeAsks={onSeeAsks} />
  } else if (ask.kind === 'settled') {
    footer = <FooterLine line={ask.line} live />
  } else if (!readOnly && full) {
    footer = <FooterLine line="No spots left" />
  } else if (!readOnly) {
    const action = postAction(post.kind)
    footer = action ? <AskFooter ask={ask} label={action.label} icon={action.icon} author={post.author} onAsk={() => void onAsk(post)} /> : null
  }

  return (
    <View testID="lobby-post" style={[styles.card, post.mine && styles.mineCard]}>
      <View style={styles.byline}>
        <BoardMark seed={boardMarkSeed(post.author, eventId, post.id)} />
        <View style={styles.bylineText}>
          <RNText testID="lobby-post-name" numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('rowTitle', bold), styles.ink]}>{post.author}</RNText>
          <RNText maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[monoCaption(bold), styles.secondary]}>{postAge(post.createdAt)}</RNText>
        </View>
        {post.mine ? <Label text="You" fill={SELECTION.violet.fill} ink={SELECTION.violet.glyph} /> : null}
        <Pressable
          onPress={() => (post.mine ? onTakeDown(post) : onMore(post))}
          accessibilityRole="button"
          accessibilityLabel={post.mine ? 'Take down your post' : `More options for ${post.author}’s post`}
          testID="lobby-post-more"
          hitSlop={MORE_SLOP}
          style={({ pressed }) => [styles.more, pressed && styles.pressed]}
        >
          <Icon name="ellipsis" size={DS_ICON.control} color={COLOR.textSecondary} />
        </Pressable>
      </View>
      <View style={styles.pills}>
        <View testID="lobby-post-kind" style={[styles.pill, post.kind === 'offer' ? styles.kindOffer : styles.kindOther]}>
          <Icon name={kindGlyph(post.kind, post.subKind)} size={PILL_GLYPH} color={post.kind === 'offer' ? SELECTION.rose.glyph : COLOR.textPrimary} />
          <RNText maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('note', bold, FONT_FAMILY.brand[500]), styles.ink]}>{kindWords(post.kind, post.subKind)}</RNText>
        </View>
        {spots ? (
          <View testID="lobby-post-spots" style={styles.pill}>
            <RNText maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('note', bold, FONT_FAMILY.mono[500]), styles.tabular, full ? styles.secondary : styles.spots]}>{spots}</RNText>
          </View>
        ) : null}
      </View>
      <RNText testID="lobby-post-body" maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.ink]}>{post.body}</RNText>
      <PostPhoto post={post} />
      {footer}
    </View>
  )
})

function FooterLine({ line, live }: { line: string; live?: boolean }) {
  const bold = useBoldText()
  return (
    <RNText maxFontSizeMultiplier={MAX_FONT_SCALE.meta} accessibilityLiveRegion={live ? 'polite' : undefined} style={[font('meta', bold), styles.secondary, styles.footerTop]}>
      {line}
    </RNText>
  )
}

/** Yours: how many asked, and the way to answer them (the Banter's requests). */
function MineFooter({ count, onSeeAsks }: { count: number; onSeeAsks?: () => void }) {
  const bold = useBoldText()
  return (
    <View style={styles.footer}>
      <RNText maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary, styles.footerLine]}>{asksWords(count)}</RNText>
      {onSeeAsks ? <Button label="See asks" kind="lit" size="md" onPress={onSeeAsks} style={styles.askButton} testID="lobby-post-action" /> : null}
    </View>
  )
}

/**
 * The one lit action, then the answer in place. No confirm: an ask is the moment somebody feels most exposed, and an
 * "Are you sure?" says it is dangerous. No press haptic; `H.success` when the server records it (the screen's). A
 * refusal is the server's sentence, and the button stays for another try.
 */
function AskFooter({ ask, label, icon, author, onAsk }: { ask: AskState; label: string; icon: IconName; author: string; onAsk: () => void }) {
  const bold = useBoldText()
  return (
    <View style={styles.footer}>
      {ask.kind === 'refused' ? (
        <RNText maxFontSizeMultiplier={MAX_FONT_SCALE.meta} accessibilityLiveRegion="polite" style={[font('meta', bold), styles.refused, styles.footerLine]}>
          {ask.line}
        </RNText>
      ) : null}
      <Button
        label={label}
        kind="lit"
        size="md"
        icon={icon}
        pressHaptic={false}
        loading={ask.kind === 'asking'}
        onPress={onAsk}
        // The visible words first, so voice control's "tap Ask to join" works (WCAG 2.5.3).
        accessibilityLabel={`${label}, ${author}`}
        style={styles.askButton}
        testID="lobby-post-action"
      />
    </View>
  )
}


/**
 * "Your post was taken down." (Flow 4 · 4.10 frame 36): a solid card with the 56 pt well, the reason, and one text
 * action that opens the composer. No haptic, nothing said to anybody who asked: their row just goes. Drawn from the
 * server's `takenDown` list on the board's first page (lib/chatPaging.ts `goneFrom`): yours alone, so the card never draws for
 * anybody else's post, and on a server that sends none it never draws.
 */
function TakenDownCard({ onWriteNew }: { onWriteNew?: () => void }) {
  const bold = useBoldText()
  return (
    <View testID="board-taken-down" accessibilityLiveRegion="polite" style={styles.takenDown}>
      <GlyphWell icon="shield" />
      <View style={styles.takenDownText}>
        <RNText maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.ink]}>Your post was taken down.</RNText>
        <RNText maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>It didn’t meet the community guidelines.</RNText>
        {onWriteNew ? (
          <Pressable
            testID="board-taken-down-write"
            onPress={onWriteNew}
            accessibilityRole="button"
            accessibilityLabel="Write a new post"
            hitSlop={(minTarget() - SPACE.xl) / 2}
            style={({ pressed }) => [styles.takenDownAction, pressed && styles.pressed]}
          >
            <RNText maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.ink]}>
              Write a new post
            </RNText>
          </Pressable>
        ) : null}
      </View>
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
  { value: 'offer', title: 'I have spots', hint: 'You’re offering a ride or a table.', icon: 'car' },
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
  initialKind = 'offer',
}: {
  /** Where the sheet opens: a start card's kind. */
  initialKind?: ComposeKind
  visible: boolean
  posting: boolean
  refusal: string | null
  onPost: (draft: BoardDraft) => void
  onCancel: () => void
}) {
  const bold = useBoldText()
  const [kind, setKind] = useState<ComposeKind>(initialKind)
  const [body, setBody] = useState('')
  const [spaces, setSpaces] = useState(1)
  const empty = body.trim().length === 0
  // UTF-16 units, as the server's zod `max(500)` counts them (an emoji is two).
  const tooLong = utf16Length(body.trim()) > BOARD_MAX_POST_LENGTH

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
          measure={utf16Length}
          minHeight={COMPOSER_MIN_HEIGHT}
          error={refusal ?? undefined}
          placeholder={kind === 'offer' ? 'Driving over from Indiranagar at 8 — room for two.' : 'Going alone. Anyone heading over from Koramangala?'}
        />
        {kind === 'offer' ? (
          <View style={styles.spacesRow}>
            <RNText maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.ink, styles.footerLine]}>Spots</RNText>
            <Stepper label="Spots" value={spaces} onChange={setSpaces} min={1} max={MAX_SPACES} onGlass={Platform.OS === 'ios'} disabled={posting} />
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
    borderRadius: RADIUS.rowInCard,
    backgroundColor: COLOR.surfaceSunken,
  },
  entryText: { flex: 1, gap: SPACE.xxs },

  // lobby.css `.lp`: one card for every kind, 24 pt, a hairline; yours ringed in violet.
  card: {
    gap: SPACE.sm + SPACE.xxs,
    paddingTop: SPACE.md + SPACE.xxs,
    paddingHorizontal: SPACE.lg,
    paddingBottom: SPACE.lg,
    borderRadius: CARD_RADIUS,
    backgroundColor: COLOR.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.hairline,
  },
  mineCard: { borderWidth: 1, borderColor: tint(SELECTION.violet.edge, 0.55) },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs + SPACE.xxs },
  pill: { minHeight: PILL_HEIGHT, paddingHorizontal: SPACE.sm + SPACE.xxs, borderRadius: RADIUS.capsule, backgroundColor: COLOR.chipFillOnGlass, flexDirection: 'row', alignItems: 'center', gap: SPACE.xs + SPACE.xxs },
  kindOffer: { backgroundColor: SELECTION.rose.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: SELECTION.rose.edge },
  kindOther: { borderWidth: StyleSheet.hairlineWidth, borderColor: COLOR.hairlineStrong },
  spots: { color: SELECTION.rose.glyph },

  takenDown: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.lg, padding: SPACE.lg, borderRadius: RADIUS.card, backgroundColor: COLOR.surface },
  takenDownText: { flex: 1, gap: SPACE.xs },
  takenDownAction: { alignSelf: 'flex-start', marginTop: SPACE.xs },

  byline: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm + SPACE.xxs },
  bylineText: { flex: 1 },
  // A menu is a target, not an icon.
  // `.lp .mo`: 32 wide, a target's height, hanging 10 into the padding; the slop makes the target whole.
  more: { width: MORE_WIDTH, height: minTarget(), alignItems: 'center', justifyContent: 'center', marginRight: -(SPACE.sm + SPACE.xxs) },

  footer: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: SPACE.md, marginTop: SPACE.xxs },
  footerTop: { marginTop: SPACE.xxs },
  footerLine: { flex: 1 },
  askButton: { marginLeft: 'auto' },

  composer: { gap: SPACE.lg },
  kinds: { flexDirection: 'row', gap: SPACE.md },
  spacesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
})
