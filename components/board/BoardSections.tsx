import { memo, type ReactNode } from 'react'
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text as RNText, View } from 'react-native'

import { Avatar } from '../ds/Avatar'
import { Button } from '../ds/Button'
import { GlyphWell } from '../ds/StateScreen'
import { monoCaption } from '../ds/MonoFamily'
import { CONTROL_FONT_CAP, font, minTarget, SELECTION, useBoldText } from '../ds/shared'
import { Icon, type IconName } from '../ui/Icon'
import { boardMarkSeed } from '../../lib/board'
import { asksWords, isFull, kindGlyph, kindWords, postAction, postAge, spotsWords } from '../../lib/lobby'
import { Label } from './LobbyParts'
import { PostPhoto } from './PostPhoto'
import type { BoardPostView } from '../../lib/chatPaging'
import { COLOR, FONT_FAMILY, ICON as DS_ICON, RADIUS, SPACE, MAX_FONT_SCALE, TYPE } from '../../lib/design/tokens'
import { OPACITY, tint } from '../../lib/theme'
import { Swap } from '../motion/Swap'

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
/** `.lpr .kt`: the preview's pill is 22. */
const PILL_SMALL = 22

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

/** The kind pill (`.kt`): rose on an offer. `small` is the event page's preview (`.lpr .kt`: 22 tall, 12 pt). */
export function KindPill({ kind, subKind, small = false }: { kind: BoardPostView['kind']; subKind?: BoardPostView['subKind']; small?: boolean }) {
  const bold = useBoldText()
  const offer = kind === 'offer'
  return (
    <View testID="lobby-post-kind" style={[styles.pill, offer ? styles.kindOffer : styles.kindOther, small && styles.pillSmall]}>
      <Icon name={kindGlyph(kind, subKind)} size={PILL_GLYPH} color={offer ? SELECTION.rose.glyph : COLOR.textPrimary} />
      <RNText maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[small ? font('caption', bold) : font('note', bold, FONT_FAMILY.brand[500]), styles.ink]}>{kindWords(kind, subKind)}</RNText>
    </View>
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
  // The ask settling into its answer is one part fading into the next (motion audit M27).
  const footerId = post.mine ? 'mine' : ask.kind === 'settled' ? 'settled' : full ? 'full' : 'ask'

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
        <KindPill kind={post.kind} subKind={post.subKind} />
        {spots ? (
          <View testID="lobby-post-spots" style={styles.pill}>
            <RNText maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('note', bold, FONT_FAMILY.mono[500]), styles.tabular, full ? styles.secondary : styles.spots]}>{spots}</RNText>
          </View>
        ) : null}
      </View>
      <RNText testID="lobby-post-body" maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.ink]}>{post.body}</RNText>
      <PostPhoto post={post} />
      <Swap id={footerId}>{footer}</Swap>
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
      <Swap style={styles.footerLine}>
        {ask.kind === 'refused' ? (
          <RNText maxFontSizeMultiplier={MAX_FONT_SCALE.meta} accessibilityLiveRegion="polite" style={[font('meta', bold), styles.refused]}>
            {ask.line}
          </RNText>
        ) : null}
      </Swap>
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
            hitSlop={(minTarget() - TYPE.meta.lineHeight) / 2}
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

const styles = StyleSheet.create({
  pressed: { opacity: OPACITY.pressed },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  refused: { color: COLOR.destructive },
  tabular: { fontVariant: ['tabular-nums'] },


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
  pillSmall: { minHeight: PILL_SMALL, paddingHorizontal: SPACE.sm, alignSelf: 'flex-start' },
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

})
