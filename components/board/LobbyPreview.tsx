import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'

import { Avatar } from '../ds/Avatar'
import { Button } from '../ds/Button'
import { monoCaption } from '../ds/MonoFamily'
import { SectionHeader } from '../ds/SectionHeader'
import { font, HueProvider, SELECTION, useBoldText } from '../ds/shared'
import { Icon } from '../ui/Icon'
import { KindPill } from './BoardSections'
import { apiClient } from '../../lib/apiClient'
import { boardMarkSeed } from '../../lib/board'
import { compactCount } from '../../lib/format'
import { badgeCount, countLine, LOBBY_NEWS_PAGE, lobbyNews, postAge, previewReadOnlyLine, previewView, type LobbyPreview } from '../../lib/lobby'
import { lobbySeenAt } from '../../lib/lobbySeen'
import { Logger } from '../../lib/logger'
import { COLOR, FONT_FAMILY, ICON, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'
import { OPACITY, tint } from '../../lib/theme'

/**
 * The Lobby outside the Lobby (SCRUM-1026, `mockups/redesign-2026-11/lobby/`): P-A, the event page's card, which becomes
 * "The room is open" when the doors have opened and nobody posted (4b); and Going's "New in the Lobby" row. Rose is the
 * Lobby's hue; people are their creatures and room names, never a face.
 */

const ROSE = SELECTION.rose
/** `.lpr`: the preview's creatures are 32. */
const PREVIEW_MARK = 32
/** `.stk`: Going's stacked creatures are 24, overlapping by 8, ringed 2 in the row's fill. */
const STACK_MARK = 24
const STACK_RING = 2
/** `.nbg`: the unread badge is a 24 pt capsule. */
const BADGE = 24
/** `.lpc.lroom`: the door glyph is 24, a step over the control's 20. */
const DOOR_GLYPH = 24
// design-exception: the board's room card glows rose from under it (`.lpc.lroom`: 0 18px 50px -24px, 70%), the 4b card's
// one lit object; `glowLead` is ember and larger, so no token holds it.
const ROOM_GLOW = [{ offsetX: 0, offsetY: 18, blurRadius: 50, spreadDistance: -24, color: tint(SELECTION.rose.edge, 0.7) }]
/** The board's hairlines are inset shadows that take no room; ours are borders, so the padding gives theirs back. */
const HAIR = StyleSheet.hairlineWidth
const PILL_ABOVE = 15
const PILL_BELOW = 5
/** The preview shows two posts. */
const PREVIEW_POSTS = 2

const openLobby = (eventId: string, compose = false) =>
  router.push({ pathname: '/board/[eventId]', params: compose ? { eventId, compose: '1' } : { eventId } } as never)

const exact = (n: number) => n.toLocaleString('en-US')

/** Read on every focus, so a post written in the Lobby is on the card when you come back. A refusal draws nothing. */
function usePreview(eventId: string): LobbyPreview | null {
  const [preview, setPreview] = useState<LobbyPreview | null>(null)
  useFocusEffect(
    useCallback(() => {
      let gone = false
      apiClient
        .getBoardPreview(eventId)
        .then((r) => !gone && setPreview(r.success && r.data ? r.data : null))
        .catch((error) => Logger.warn('board', 'preview failed', { eventId, error }))
      return () => {
        gone = true
      }
    }, [eventId])
  )
  return preview
}

/**
 * P-A: "Lobby" and See all, then one card: the counts, the latest two posts and Post something; the counts and how to read
 * it for somebody who has neither saved nor gone; Post something alone before anybody posted; after doors, read-only until
 * the close with Read the Lobby. Live and nobody posted, it is the room's card instead (4b).
 */
export function EventLobbyPreview({ eventId, timeZone, here, onOpenRoom }: { eventId: string; timeZone?: string | null; here: number | null; onOpenRoom: () => void }) {
  const bold = useBoldText()
  const preview = usePreview(eventId)
  if (!preview) return null
  const view = previewView(preview)
  if (view === 'roomOpen') return <RoomOpenCard here={here} onPress={onOpenRoom} />

  const line = countLine(preview.counts)
  const counts = (
    <Text
      testID="lobby-preview-counts"
      accessibilityLabel={`${exact(preview.counts.all)} ${line.postsWord}${line.rides ? `, ${exact(preview.counts.offerRides)} ${line.ridesWord}` : ''}`}
      maxFontSizeMultiplier={MAX_FONT_SCALE.body}
      style={[font('control', bold), styles.secondary]}
    >
      <Text style={[styles.mono, styles.ink]}>{line.posts}</Text> {line.postsWord}
      {line.rides ? (
        <>
          {' · '}
          <Text style={[styles.mono, styles.ink]}>{line.rides}</Text> {line.ridesWord}
        </>
      ) : null}
    </Text>
  )
  const postSomething = <Button kind="lit" size="md" icon="pen" label="Post something" onPress={() => openLobby(eventId, true)} style={styles.act} testID="lobby-preview-post" />
  // The board's notes are the section's body (`.sec4 p`, 17/24, wins over `.bnote`), as The experience under it is.
  const note = (text: string, gap: object) => (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.secondary, gap]}>
      {text}
    </Text>
  )

  let body
  if (view === 'gate') body = [counts, note('Save it or say you’re going to read the Lobby.', styles.gateGap)]
  else if (view === 'empty')
    body = [
      <Text key="t" maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('control', bold), styles.secondary]}>Nobody’s posted yet</Text>,
      note('Offer a ride, or find someone to go with.', styles.noteGap),
      postSomething,
    ]
  else if (view === 'readOnly')
    body = [
      counts,
      note(previewReadOnlyLine(preview.closesAt, timeZone), styles.noteGap),
      <Button key="r" kind="secondary" size="pill" label="Read the Lobby" onPress={() => openLobby(eventId)} style={styles.act} testID="lobby-preview-read" />,
    ]
  else body = [counts, ...preview.latest.slice(0, PREVIEW_POSTS).map((p) => <PreviewPost key={p.id} post={p} eventId={eventId} />), postSomething]

  const seeAll = view === 'posts' || view === 'readOnly'
  return (
    <HueProvider value="rose">
      <View testID="lobby-preview">
        <View style={styles.head}>
          <SectionHeader title="Lobby" action={seeAll ? { label: 'See all', onPress: () => openLobby(eventId) } : undefined} />
        </View>
        <View style={styles.card}>{body.map((part, i) => <View key={i}>{part}</View>)}</View>
      </View>
    </HueProvider>
  )
}

function PreviewPost({ post, eventId }: { post: LobbyPreview['latest'][number]; eventId: string }) {
  const bold = useBoldText()
  return (
    <View testID="lobby-preview-post-row" style={styles.post}>
      <Avatar kind="creature" pseudonym={boardMarkSeed(post.author, eventId, post.id)} size={PREVIEW_MARK} />
      <View style={styles.postText}>
        <View style={styles.byline}>
          <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('control', bold), styles.ink, styles.nameShrink]}>
            {post.author}
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[monoCaption(bold), styles.tertiary]}>{postAge(post.createdAt)}</Text>
        </View>
        <View style={styles.pillLine}>
          <KindPill kind={post.kind} subKind={post.subKind} small />
        </View>
        <Text numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('control', bold, FONT_FAMILY.brand[400]), styles.secondary]}>
          {post.body}
        </Text>
      </View>
    </View>
  )
}

/** 4b on the event page: live, nobody posted in the Lobby, so the room is the place. Here-now in its own slot. */
function RoomOpenCard({ here, onPress }: { here: number | null; onPress: () => void }) {
  const bold = useBoldText()
  return (
    <Pressable
      testID="lobby-preview-room"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={here === null ? 'The room is open' : `The room is open, ${exact(here)} here now`}
      style={({ pressed }) => [styles.room, pressed && styles.pressed]}
    >
      <Icon name="door-open" size={DOOR_GLYPH} color={ROSE.glyph} />
      <View style={styles.shrink}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('group', bold), styles.ink]}>The room is open</Text>
        {here === null ? null : (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
            <Text style={[styles.mono, styles.ink]}>{compactCount(here)}</Text> here now
          </Text>
        )}
      </View>
      <Icon name="chevron-right" size={ICON.control} color={COLOR.textSecondary} />
    </Pressable>
  )
}

/**
 * Going's Next up: "New in the Lobby" with the three newest creatures and a badge capped at 9+, only when others posted
 * since you last opened it (`lobbyNews`). One page of the newest posts, read on every focus.
 */
export function NewInLobbyRow({ eventId, style }: { eventId: string; style?: StyleProp<ViewStyle> }) {
  const bold = useBoldText()
  const [news, setNews] = useState<ReturnType<typeof lobbyNews> | null>(null)
  useFocusEffect(
    useCallback(() => {
      let gone = false
      Promise.all([apiClient.getBoard(eventId, { limit: String(LOBBY_NEWS_PAGE) }), lobbySeenAt(eventId)])
        .then(([board, seen]) => !gone && setNews(board.success && board.data ? lobbyNews(board.data.posts, seen) : null))
        .catch((error) => Logger.warn('board', 'news failed', { eventId, error }))
      return () => {
        gone = true
      }
    }, [eventId])
  )
  if (!news || news.count === 0) return null
  const badge = badgeCount(news.count)
  return (
    <Pressable
      testID="going-lobby-new"
      onPress={() => openLobby(eventId)}
      accessibilityRole="button"
      accessibilityLabel={`New in the Lobby, ${badge} new ${news.count === 1 ? 'post' : 'posts'}`}
      style={({ pressed }) => [styles.news, style, pressed && styles.pressed]}
    >
      <View style={styles.stack} importantForAccessibility="no-hide-descendants">
        {news.authors.map((a, i) => (
          <View key={a.id} style={[styles.stackRing, i > 0 && styles.stackOverlap]}>
            <Avatar kind="creature" pseudonym={boardMarkSeed(a.author, eventId, a.id)} size={STACK_MARK} />
          </View>
        ))}
      </View>
      <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('control', bold), styles.ink, styles.shrink]}>
        New in the Lobby
      </Text>
      <View style={styles.badge}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('note', bold, FONT_FAMILY.mono[700]), styles.ink]}>{badge}</Text>
      </View>
      <Icon name="chevron-right" size={ICON.inline + 2} color={ROSE.glyph} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  tertiary: { color: COLOR.textTertiary },
  mono: { fontFamily: FONT_FAMILY.mono[500] },
  shrink: { flex: 1, minWidth: 0 },
  pressed: { opacity: OPACITY.pressed },

  // `.lpc`: the Lobby's 24 pt card, a hairline, 14 16 16.
  // `.lpv .shd`: 10 under the header.
  head: { marginBottom: SPACE.sm + SPACE.xxs },
  card: { backgroundColor: COLOR.surface, borderRadius: RADIUS.sheet, borderWidth: StyleSheet.hairlineWidth, borderColor: COLOR.hairline, paddingTop: SPACE.md + SPACE.xxs - HAIR, paddingHorizontal: SPACE.lg, paddingBottom: SPACE.lg - HAIR },
  gateGap: { marginTop: SPACE.sm },
  noteGap: { marginTop: SPACE.xs + SPACE.xxs },
  act: { marginTop: SPACE.md + SPACE.xxs, alignSelf: 'stretch' },

  // `.lpr`: 10 between the creature and the words, 12 above and below, a hairline under.
  post: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm + SPACE.xxs, paddingTop: SPACE.md, paddingBottom: SPACE.md - HAIR, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLOR.hairline },
  postText: { flex: 1, minWidth: 0 },
  // `.lpr`: the pill sits in its own line box on the board, 15 over it and 5 under (pA-rest `previewPost` 126 tall).
  pillLine: { paddingTop: PILL_ABOVE, paddingBottom: PILL_BELOW },
  nameShrink: { flexShrink: 1, minWidth: 0 },
  byline: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs + SPACE.xxs },

  // `.lpc.lroom`: a rose rim and its glow; 14 between the door, the words and the chevron.
  room: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md + SPACE.xxs,
    padding: SPACE.lg,
    borderRadius: RADIUS.sheet,
    backgroundColor: COLOR.surface,
    borderWidth: 1,
    borderColor: tint(ROSE.edge, 0.6),
    boxShadow: ROOM_GLOW,
  },

  // `.nlb`: rose fill, a hairline rose rim, 16 pt corners, 10 12.
  news: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm + SPACE.xxs, paddingVertical: SPACE.sm + SPACE.xxs, paddingHorizontal: SPACE.md, borderRadius: RADIUS.rowInCard, backgroundColor: ROSE.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: ROSE.edge },
  stack: { flexDirection: 'row' },
  // `.stk .crt`: the 2 pt ring is a shadow on the board, outside the box, so it gives its room back.
  stackRing: { borderRadius: RADIUS.capsule, borderWidth: STACK_RING, borderColor: ROSE.fill, margin: -STACK_RING },
  stackOverlap: { marginLeft: -SPACE.sm - STACK_RING },
  badge: { minWidth: BADGE, height: BADGE, paddingHorizontal: SPACE.xs + 3, borderRadius: BADGE / 2, backgroundColor: ROSE.edge, alignItems: 'center', justifyContent: 'center' },
})
