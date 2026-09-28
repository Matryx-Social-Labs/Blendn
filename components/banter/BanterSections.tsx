import { Ionicons, MaterialIcons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native'

import { OptimizedImage } from '../OptimizedImage'
import { DayHeading } from '../ui/DayHeading'
import { initialsOf } from '../../lib/initials'
import { pseudonymAvatar } from '../../lib/pseudonymAvatar'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, OPACITY, SPACE, TYPE } from '../../lib/theme'
import { liveRoomMeta } from './inbox'

/**
 * The Banter's pieces.
 *
 * ## One inbox, not two tabs
 *
 * People and rooms share one list and are told apart by the avatar: a person
 * is round (a photograph, or the generated mark before they reveal), a room is
 * its event's cover in a square. A tab split asks you to know which *kind* of
 * conversation you are looking for before you can look for it — and the answer
 * is usually "the one that just buzzed", which is a property of neither tab.
 *
 * ## Faces are fine here, and this is not the `interestedPreview` case
 *
 * These are people you are already in a conversation with. The leak that was
 * closed (blendn-admin #229) exposed *strangers'* faces, harvestable by topic
 * — favourite an event, ask, collect everyone else interested. A person you
 * have an open thread with is not a stranger, and their photograph is already
 * the thing every chat client shows.
 */

/** The screen gutter, and the design system's gap between sections. */
export const BANTER_PADDING_HORIZONTAL = GUTTER
export const BANTER_SECTION_GAP = SPACE.xxl

/** Every avatar in the inbox — people, rooms, requests, live rooms. */
export const ROW_AVATAR = 56
/** A conversation row: the avatar plus `SPACE.md` above and below. Read or unread, the same. */
export const ROW_HEIGHT = ROW_AVATAR + SPACE.md * 2

const UNREAD_DOT = 10
const LIVE_DOT = 8

// The system placeholder grey, so a placeholder reads apart from the text that
// will replace it.
const SEARCH_PLACEHOLDER = EMBER.textPlaceholder

/**
 * The search field.
 *
 * A live input that filters the inbox in place. No `autoFocus`: the keyboard
 * rises only when somebody taps it, so it never covers a list being read.
 * Without `onChangeText` it is the static field the preview harness draws.
 */
export function BanterSearch({
  value,
  onChangeText,
}: {
  value?: string
  onChangeText?: (text: string) => void
}) {
  if (!onChangeText) {
    return (
      <View style={styles.search}>
        <Ionicons name="search" size={ICON.md} color={EMBER.textSecondary} />
        <Text style={styles.searchPlaceholder} maxFontSizeMultiplier={1.4} numberOfLines={1}>
          Search conversations...
        </Text>
      </View>
    )
  }
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={ICON.md} color={EMBER.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Search conversations..."
        placeholderTextColor={SEARCH_PLACEHOLDER}
        accessibilityLabel="Search conversations"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        maxFontSizeMultiplier={1.4}
        style={styles.searchInput}
      />
    </View>
  )
}

/** "Live now" / "Requests" — the `heading` role, with an optional count beside it. */
export function BanterHeading({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.headingRow} accessibilityRole="header">
      <Text style={styles.heading} maxFontSizeMultiplier={1.4}>
        {title}
      </Text>
      {detail ? (
        <Text style={styles.headingDetail} maxFontSizeMultiplier={1.4}>
          {detail}
        </Text>
      ) : null}
    </View>
  )
}

/**
 * "Today" / "This week" / "Earlier" over the conversations, with the list's
 * one text action ("MARK ALL READ", `label` in `textPrimary`) on the right of
 * the first one.
 */
export function BanterBucketHeading({
  title,
  action,
  onAction,
}: {
  title: string
  action?: string
  onAction?: () => void
}) {
  return (
    <View style={styles.bucketRow}>
      <DayHeading title={title} />
      {action ? (
        // 16pt of text + 14 above and below is the 44pt minimum, without
        // growing the heading row.
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
        >
          <Text style={styles.headingAction} maxFontSizeMultiplier={1.4}>
            {action.toUpperCase()}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

/**
 * A room you are standing in — one full-width row per room under "Live now".
 *
 * A room you are checked into is a different object from the rest of the
 * inbox: temporary, anonymous, and only useful while you are there. It gets a
 * sunken panel rather than a list row so it reads as *where you are*, and a
 * still `success` dot — presence is a status, never motion and never the
 * accent (docs/DESIGN_SYSTEM.md).
 */
export function BanterLiveRoom({
  title,
  coverUrl,
  memberCount,
  muted = false,
  onPress,
}: {
  title: string
  coverUrl?: string | null
  memberCount?: number | null
  /** You muted its notifications. */
  muted?: boolean
  onPress?: () => void
}) {
  const meta = liveRoomMeta(memberCount)
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, live room. ${meta}${muted ? '. Muted' : ''}`}
      style={({ pressed }) => [styles.liveRow, pressed && styles.pressed]}
    >
      {/* `surface` under the cover: one step up from the panel it sits on. */}
      <RoomCover url={coverUrl} />
      <View style={styles.liveBody}>
        <View style={styles.rowLine}>
          <Text style={[styles.rowTitle, muted && styles.rowTitleMuted]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
            {title}
          </Text>
          {muted ? <MutedMark /> : null}
        </View>
        <View style={styles.liveMetaLine}>
          <View style={styles.liveDot} />
          <Text style={styles.liveMeta} numberOfLines={1} maxFontSizeMultiplier={1.4}>
            {meta}
          </Text>
        </View>
      </View>
    </Pressable>
  )
}

export interface ConversationItem {
  id: string
  title: string
  /** Already prefixed — "You: …", "Mika: …". The screen owns who said it. */
  preview: string
  /** Already formatted — "5m", "Yesterday". The screen owns time. */
  timeLabel: string
  /** A person's photograph, or a room's event cover. */
  avatarUrl?: string | null
  /** A room rather than a person: a square cover instead of a round face. */
  kind?: 'direct' | 'event' | 'group'
  unread?: boolean
  /** You muted this room's notifications: a bell with a slash after the title. */
  muted?: boolean
  /**
   * The preview is news in itself — "Asked to reveal names" — and is drawn in
   * `textPrimary` even when the row is read.
   */
  previewEmphasis?: boolean
  /**
   * They have not revealed yet, so `title` is a pseudonym and there is no
   * photograph to draw.
   *
   * Not the same as "has no photo". A revealed person with no picture gets the
   * ordinary empty avatar; an unrevealed one gets the generated mark, because
   * the absence is the product working rather than a gap.
   */
  pseudonymous?: boolean
}

/**
 * One conversation.
 *
 * ## Unread is three changes, not a badge — and never a height change
 *
 * No count on a row. Unread turns the preview from `textSecondary` Regular to
 * `textPrimary` SemiBold, the time to `textPrimary`, and puts a 10pt
 * `textPrimary` dot under the time. The dot's slot is there on a read row too,
 * empty, so a row does not grow, shrink or shift when it is read — the list
 * holds still under your thumb while you work through it. No hairlines: rows
 * are separated by their padding, the way Messages and Telegram do it.
 */
export function BanterConversation({
  item,
  onPress,
  style,
}: {
  item: ConversationItem
  onPress?: () => void
  style?: StyleProp<ViewStyle>
}) {
  const isRoom = item.kind === 'event' || item.kind === 'group'
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.preview}. ${item.timeLabel}${
        item.unread ? '. Unread' : ''
      }${item.muted ? '. Muted' : ''}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, style]}
    >
      {isRoom ? (
        <RoomCover url={item.avatarUrl} />
      ) : item.pseudonymous ? (
        /*
         * A match who has not revealed.
         *
         * The server sends the pseudonym as the name and `null` for the
         * photo, so drawing `avatarUrl` here renders an empty grey circle —
         * which reads as a broken row rather than as anonymity working.
         *
         * `pseudonymAvatar` is the mark the Scene's attendee discs and the
         * room already use, seeded on the **pseudonym**: the same person is
         * the same colour and the same creature everywhere they appear under
         * that name. Never seed it with a user id — that is stable forever
         * and would rebuild the cross-surface identity the pseudonyms exist
         * to prevent.
         */
        <PseudonymDisc pseudonym={item.title} />
      ) : item.avatarUrl ? (
        <OptimizedImage
          source={item.avatarUrl}
          recyclingKey={item.avatarUrl}
          style={styles.rowAvatar as never}
          width={ROW_AVATAR}
          height={ROW_AVATAR}
          contentFit="cover"
        />
      ) : (
        // No photo set: their initials, the same the conversation header
        // draws. This was an empty source, which spun for ever (SCRUM-404).
        <View style={styles.rowAvatar}>
          <Text style={styles.rowInitials} maxFontSizeMultiplier={1.2}>
            {initialsOf(item.title)}
          </Text>
        </View>
      )}

      <View style={styles.rowBody}>
        <View style={styles.rowLine}>
          <Text style={[styles.rowTitle, item.muted && styles.rowTitleMuted]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
            {item.title}
          </Text>
          {item.muted ? <MutedMark /> : null}
          <Text
            style={[styles.rowTime, item.unread && styles.rowTimeUnread]}
            maxFontSizeMultiplier={1.3}
          >
            {item.timeLabel}
          </Text>
        </View>
        <View style={styles.rowLine}>
          <Text
            style={[
              styles.rowPreview,
              item.previewEmphasis && styles.rowPreviewEmphasis,
              item.unread && styles.rowPreviewUnread,
            ]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
          >
            {item.preview}
          </Text>
          <View style={styles.unreadSlot}>
            {item.unread ? <View style={styles.unreadDot} /> : null}
          </View>
        </View>
      </View>
    </Pressable>
  )
}

/**
 * Muted, as a still mark: the bell with a slash, in `textTertiary` — the same
 * glyph the room's own header shows. Not a word, because "Muted" in this list
 * already means the organiser stopped you posting (`roomStateLine`).
 */
function MutedMark() {
  return <Ionicons name="notifications-off-outline" size={ICON.sm} color={EMBER.textTertiary} />
}

/** A room's avatar: its event's cover in a small square, or a glyph on `surface`. */
function RoomCover({ url }: { url?: string | null }) {
  if (!url) {
    return (
      <View style={styles.roomCover}>
        <MaterialIcons name="groups" size={ICON.lg} color={EMBER.textSecondary} />
      </View>
    )
  }
  return (
    <OptimizedImage
      source={url}
      recyclingKey={url}
      style={styles.roomCover as never}
      width={ROW_AVATAR}
      height={ROW_AVATAR}
      contentFit="cover"
    />
  )
}

const styles = StyleSheet.create({
  pressed: { opacity: OPACITY.pressed },

  // A search field: `CONTROL.md` tall, a pill on `EMBER.surface`.
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    height: CONTROL.md,
    paddingHorizontal: SPACE.lg,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
  },
  searchPlaceholder: { ...TYPE.body, flex: 1, color: SEARCH_PLACEHOLDER },
  searchInput: { ...TYPE.body, flex: 1, padding: 0 },

  headingRow: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.sm },
  heading: TYPE.heading,
  headingDetail: TYPE.meta,
  bucketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headingAction: { ...TYPE.label, color: EMBER.textPrimary },

  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.lg,
    padding: SPACE.lg,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surfaceSunken,
  },
  liveBody: { flex: 1, gap: SPACE.xxs },
  liveMetaLine: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  liveDot: {
    width: LIVE_DOT,
    height: LIVE_DOT,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.success,
  },
  liveMeta: { ...TYPE.meta, flex: 1 },

  /*
   * No fill, so no side padding: the avatar lines up with the gutter like the
   * search field and the headings above it.
   */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.lg,
    paddingVertical: SPACE.md,
    minHeight: ROW_HEIGHT,
  },
  rowAvatar: {
    width: ROW_AVATAR,
    height: ROW_AVATAR,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInitials: { ...TYPE.bodyStrong, color: EMBER.textSecondary },
  /*
   * Fixed against Dynamic Type — `maxFontSizeMultiplier={1}`.
   *
   * The disc is a fixed 56pt and RN clips a glyph to its `lineHeight`, so a
   * scaled emoji is a cropped emoji rather than a bigger one. The name beside
   * it scales, which is where the accessibility actually lives.
   */
  // design-exception: an emoji glyph sized to fill the 56pt disc, not text
  pseudonymGlyph: { fontSize: 26, lineHeight: 32 },
  // A room is square, which is what tells it from a person at a glance.
  roomCover: {
    width: ROW_AVATAR,
    height: ROW_AVATAR,
    borderRadius: EMBER_RADIUS.sm,
    backgroundColor: EMBER.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  rowBody: { flex: 1, gap: SPACE.xxs },
  rowLine: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  rowTitle: { ...TYPE.bodyStrong, flex: 1 },
  // Shrinks to fit the mark after it rather than pushing it off the row.
  rowTitleMuted: { flex: 0, flexShrink: 1, marginRight: 'auto' },
  rowTime: TYPE.meta,
  rowTimeUnread: { color: EMBER.textPrimary },
  rowPreview: { ...TYPE.body, flex: 1, color: EMBER.textSecondary },
  rowPreviewEmphasis: { color: EMBER.textPrimary },
  rowPreviewUnread: { ...TYPE.bodyStrong, color: EMBER.textPrimary },
  // Reserved on every row so read and unread line up to the pixel.
  unreadSlot: {
    width: UNREAD_DOT,
    height: UNREAD_DOT,
  },
  // Unread is neutral, like everything on a populated inbox.
  unreadDot: {
    width: UNREAD_DOT,
    height: UNREAD_DOT,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.textPrimary,
  },
})

/** The generated mark for an unrevealed match, at the row's avatar size. */
function PseudonymDisc({ pseudonym }: { pseudonym: string }) {
  const { colors, character } = pseudonymAvatar(pseudonym)
  return (
    <LinearGradient colors={colors} style={styles.rowAvatar}>
      <Text style={styles.pseudonymGlyph} maxFontSizeMultiplier={1}>
        {character}
      </Text>
    </LinearGradient>
  )
}

/**
 * A message request — someone who is not yet a conversation.
 *
 * Drawn as a conversation row, because that is what it becomes: the sender's
 * face, name and time on the first line, their opening message under it. The
 * one difference is that it cannot be opened — tapping it has to mean
 * *accept* or *decline*, not *read* — so the two answers sit under the
 * message instead of the row being a button.
 *
 * The face and the name open the sender's profile, so "who is this" can be
 * answered before answering them. "More" holds Block and Report: declining
 * is not the answer to somebody who should not be able to ask again.
 *
 * Accept is a `textPrimary` fill with `bg` text — the design system's
 * strong-neutral, not the accent. A list of three requests drew three orange
 * pills, and with the empty state's "Explore events" and the tab bar that was
 * too much orange for one screen (docs/DESIGN_SYSTEM.md: at most one thing).
 * White on the dark page still reads as the affirmative answer beside
 * Decline's `surface`.
 */
export function BanterRequest({
  name,
  avatarUrl,
  timeLabel,
  message,
  pending,
  onAccept,
  onDecline,
  onOpenProfile,
  onMore,
}: {
  name: string
  avatarUrl?: string | null
  timeLabel?: string
  message: string
  pending?: boolean
  onAccept: () => void
  onDecline: () => void
  onOpenProfile?: () => void
  onMore?: () => void
}) {
  return (
    <View style={requestStyles.request}>
      <Pressable
        onPress={onOpenProfile}
        disabled={!onOpenProfile}
        accessibilityRole="button"
        accessibilityLabel={`${name}'s profile`}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
      {avatarUrl ? (
        <OptimizedImage
          source={avatarUrl}
          recyclingKey={avatarUrl}
          style={styles.rowAvatar as never}
          width={ROW_AVATAR}
          height={ROW_AVATAR}
          contentFit="cover"
        />
      ) : (
        <View style={requestStyles.glyphAvatar}>
          <MaterialIcons name="person" size={ICON.lg} color={EMBER.textSecondary} />
        </View>
      )}
      </Pressable>

      <View style={requestStyles.requestBody}>
        <View style={styles.rowLine}>
          <Text
            style={styles.rowTitle}
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
            onPress={onOpenProfile}
            // The avatar above is the labelled button; this is the same target.
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            {name}
          </Text>
          {timeLabel ? (
            <Text style={styles.rowTime} maxFontSizeMultiplier={1.3}>
              {timeLabel}
            </Text>
          ) : null}
        </View>
        <Text style={requestStyles.requestMessage} numberOfLines={2} maxFontSizeMultiplier={1.4}>
          {message}
        </Text>

        <View style={requestStyles.requestActions}>
          {/*
            Decline first, accept last. The destructive one is not the one your
            thumb lands on, and accept is the affirmative so it carries the fill.
          */}
          <Pressable
            onPress={onDecline}
            disabled={pending}
            accessibilityRole="button"
            accessibilityLabel={`Decline the request from ${name}`}
            accessibilityState={{ disabled: !!pending }}
            hitSlop={REQUEST_HIT_SLOP}
            style={({ pressed }) => [
              requestStyles.requestButton,
              requestStyles.requestDecline,
              (pressed || pending) && styles.pressed,
            ]}
          >
            <Text style={requestStyles.requestDeclineLabel} maxFontSizeMultiplier={1.3}>
              Decline
            </Text>
          </Pressable>
          <Pressable
            onPress={onAccept}
            disabled={pending}
            accessibilityRole="button"
            accessibilityLabel={`Accept the request from ${name}`}
            accessibilityState={{ disabled: !!pending }}
            hitSlop={REQUEST_HIT_SLOP}
            style={({ pressed }) => [
              requestStyles.requestButton,
              requestStyles.requestAccept,
              (pressed || pending) && styles.pressed,
            ]}
          >
            <Text style={requestStyles.requestAcceptLabel} maxFontSizeMultiplier={1.3}>
              Accept
            </Text>
          </Pressable>
          {onMore ? (
            // Last, and out of the way of the two answers.
            <Pressable
              onPress={onMore}
              disabled={pending}
              accessibilityRole="button"
              accessibilityLabel={`More options for the request from ${name}`}
              // A 32pt disc, so 8 all round: the pills' slop left it 40 wide.
              hitSlop={SPACE.sm}
              style={({ pressed }) => [
                requestStyles.requestMore,
                (pressed || pending) && styles.pressed,
              ]}
            >
              <Ionicons name="ellipsis-horizontal" size={ICON.sm} color={EMBER.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  )
}

// 32pt pills + 6 above and below reach the 44pt minimum without a taller row.
export const REQUEST_HIT_SLOP = { top: 6, bottom: 6, left: 4, right: 4 }

const requestStyles = StyleSheet.create({
  // The conversation row's geometry, top-aligned because the body runs longer.
  request: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE.lg,
    paddingVertical: SPACE.md,
  },
  glyphAvatar: {
    width: ROW_AVATAR,
    height: ROW_AVATAR,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestBody: { flex: 1, gap: SPACE.xxs },
  requestMessage: { ...TYPE.body, color: EMBER.textSecondary },
  requestActions: { flexDirection: 'row', gap: SPACE.md, marginTop: SPACE.sm },
  requestButton: {
    height: CONTROL.sm,
    paddingHorizontal: SPACE.lg,
    borderRadius: EMBER_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // Secondary + primary: the one row where two fills may differ.
  requestDecline: { backgroundColor: EMBER.surface },
  // One row, one height: a 32pt disc beside the two 32pt pills.
  requestMore: {
    width: CONTROL.sm,
    height: CONTROL.sm,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Strong-neutral, not the accent: see the component's note.
  requestAccept: { backgroundColor: EMBER.textPrimary },
  requestDeclineLabel: { ...TYPE.button, color: EMBER.textSecondary },
  requestAcceptLabel: { ...TYPE.button, color: EMBER.bg },
})
