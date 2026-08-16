import { Ionicons, MaterialIcons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'

import OptimizedImage from '../OptimizedImage'
import { EMBER, EMBER_FONTS, EMBER_GRADIENT, EMBER_RADIUS, EMBER_TYPE } from '../../lib/theme'

/**
 * The Banter's pieces — frame `1141:5247`.
 *
 * ## One inbox, not two tabs
 *
 * The screen this replaces splits `personal` and `group` into tabs. The frame
 * has a single **Recent** list carrying both, and tells them apart by the
 * avatar: a photograph for a person, a `#211F1F` disc with a glyph for a room.
 *
 * That is the better shape. A tab split asks you to know which *kind* of
 * conversation you are looking for before you can look for it — and the answer
 * is usually "the one that just buzzed", which is a property of neither tab.
 * The existing screen's data loading, caching and message-request handling all
 * survive; only the presentation merges.
 *
 * ## Faces are fine here, and this is not the `interestedPreview` case
 *
 * These are people you are already in a conversation with. The leak that was
 * closed (blendn-admin #229) exposed *strangers'* faces, harvestable by topic
 * — favourite an event, ask, collect everyone else interested. A person you
 * have an open thread with is not a stranger, and their photograph is already
 * the thing every chat client shows.
 */

/** Frame `1141:5248` — `Main` is `px-[12px]`, `gap-[32px]`. */
export const BANTER_PADDING_HORIZONTAL = 12
export const BANTER_SECTION_GAP = 32

/** Frame `1141:5264` — a pinned avatar. `1141:5294` — a conversation's. */
export const PINNED_AVATAR = 64
export const ROW_AVATAR = 56

/**
 * The search field — frame `1141:5249`.
 *
 * Named "Search Bar Placeholder (Reveals on tap in real app)" in the frame, so
 * it is a *button* that opens search rather than a live input. Rendered as one:
 * a `TextInput` here would take focus, raise the keyboard and cover the list
 * somebody is still reading.
 */
export function BanterSearch({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="search"
      accessibilityLabel="Search conversations"
      style={({ pressed }) => [styles.search, pressed && styles.pressed]}
    >
      <Ionicons name="search" size={18} color={EMBER.textSecondary} />
      <Text style={styles.searchPlaceholder} maxFontSizeMultiplier={1.4} numberOfLines={1}>
        Search conversations...
      </Text>
    </Pressable>
  )
}

/** "Pinned" / "Recent" — frame `1141:5258`, Plus Jakarta Bold 16/24, -0.4. */
export function BanterHeading({
  title,
  action,
  onAction,
  trailingIcon,
}: {
  title: string
  /** "Mark all read" — `1141:5291`, accent, Manrope Bold. */
  action?: string
  onAction?: () => void
  trailingIcon?: React.ComponentProps<typeof MaterialIcons>['name']
}) {
  return (
    <View style={styles.headingRow}>
      <Text style={styles.heading} maxFontSizeMultiplier={1.4}>
        {title}
      </Text>
      {action ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.headingAction} maxFontSizeMultiplier={1.4}>
            {action}
          </Text>
        </Pressable>
      ) : trailingIcon ? (
        <MaterialIcons name={trailingIcon} size={16} color={EMBER.textSecondary} />
      ) : null}
    </View>
  )
}

export interface PinnedItem {
  id: string
  name: string
  /** A photograph, or nothing for an event room. */
  avatarUrl?: string | null
  /** An event room rather than a person — drawn as the gradient disc. */
  isEvent?: boolean
  /** Somebody is online. Frame `1141:5265`: 16pt `#FF6D8D`, 2pt page-colour ring. */
  online?: boolean
  /** Dimmed to 80% with a muted name — the frame's read state. */
  muted?: boolean
}

/**
 * A pinned conversation — frame `1141:5262`.
 *
 * The frame gives four treatments in four items, which is the whole vocabulary:
 * an unread person (accent ring + presence dot), an **event** (gradient disc
 * with an `EVENT` badge, no photograph because a room has no face), and two
 * read people at 80% with `#AEAAAA` names.
 */
export function BanterPinned({ item, onPress }: { item: PinnedItem; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        item.isEvent ? `${item.name}, event room` : `${item.name}${item.online ? ', online' : ''}`
      }
      style={({ pressed }) => [styles.pinned, pressed && styles.pressed]}
    >
      <View style={item.muted ? styles.pinnedMuted : undefined}>
        {item.isEvent ? (
          <LinearGradient
            colors={[...EMBER_GRADIENT.colors]}
            start={EMBER_GRADIENT.start}
            end={EMBER_GRADIENT.end}
            style={styles.pinnedAvatar}
          >
            <MaterialIcons name="groups" size={24} color={EMBER.onGradient} />
          </LinearGradient>
        ) : (
          <OptimizedImage
            source={item.avatarUrl ?? ''}
            recyclingKey={item.avatarUrl ?? undefined}
            style={[styles.pinnedAvatar, !item.muted && styles.pinnedRing] as never}
            width={PINNED_AVATAR}
            height={PINNED_AVATAR}
            contentFit="cover"
          />
        )}

        {/*
          The `EVENT` badge — `1141:5274`. Violet on deep violet, which is the
          amenity tiles' pair rather than the accent: an accent badge on an
          accent disc would disappear into it.
        */}
        {item.isEvent ? (
          <View style={styles.eventBadge} pointerEvents="none">
            <Text style={styles.eventBadgeText} maxFontSizeMultiplier={1.2}>
              EVENT
            </Text>
          </View>
        ) : null}

        {item.online ? <View style={styles.presence} pointerEvents="none" /> : null}
      </View>

      <Text
        style={[styles.pinnedName, item.muted && styles.pinnedNameMuted]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {item.name}
      </Text>
    </Pressable>
  )
}

export interface ConversationItem {
  id: string
  title: string
  preview: string
  /** Already formatted — "2m ago", "Yesterday". The screen owns time. */
  timeLabel: string
  avatarUrl?: string | null
  /** A room rather than a person: a `#211F1F` disc with a glyph. */
  kind?: 'direct' | 'event' | 'group'
  unread?: boolean
}

/**
 * One row in **Recent** — frames `1141:5292` (unread) and `1141:5304` (read).
 *
 * ## Unread is three changes, not a badge
 *
 * The frame carries no unread *count* on a row. Instead: a 12pt accent dot on
 * the avatar, the preview goes from `#AEAAAA` Regular to **white SemiBold**,
 * and the timestamp goes from `#AEAAAA` to accent Bold. So the row reads as
 * unread from across the screen rather than by finding a number on it — and
 * the count that does matter, the total, is on the bell.
 *
 * The read rows also carry a hairline bottom border and the unread one does
 * not, which is what makes an unread row look like a card and the rest like a
 * list.
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
      }`}
      style={({ pressed }) => [
        styles.row,
        item.unread && styles.rowUnread,
        pressed && styles.pressed,
        style,
      ]}
    >
      <View>
        {isRoom ? (
          <View style={styles.roomAvatar}>
            <MaterialIcons
              name={item.kind === 'event' ? 'event' : 'groups'}
              size={20}
              color={EMBER.accent}
            />
          </View>
        ) : (
          <OptimizedImage
            source={item.avatarUrl ?? ''}
            recyclingKey={item.avatarUrl ?? undefined}
            style={styles.rowAvatar as never}
            width={ROW_AVATAR}
            height={ROW_AVATAR}
            contentFit="cover"
          />
        )}
        {item.unread ? (
          <View style={styles.unreadRing} pointerEvents="none">
            <View style={styles.unreadDot} />
          </View>
        ) : null}
      </View>

      <View style={[styles.rowBody, !item.unread && styles.rowBodyRuled]}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle} numberOfLines={1} maxFontSizeMultiplier={1.4}>
            {item.title}
          </Text>
          <Text
            style={[styles.rowTime, item.unread && styles.rowTimeUnread]}
            maxFontSizeMultiplier={1.3}
          >
            {item.timeLabel}
          </Text>
        </View>
        <Text
          style={[styles.rowPreview, item.unread && styles.rowPreviewUnread]}
          numberOfLines={2}
          maxFontSizeMultiplier={1.4}
        >
          {item.preview}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },

  // Frame `1141:5249`: #211F1F, radius 48, px 20 / py 12, gap 12.
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 48,
    backgroundColor: EMBER.surfaceSunken,
  },
  searchPlaceholder: {
    flex: 1,
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 16,
    // Frame: `rgba(174,170,170,0.5)` — `textSecondary` at half, so a
    // placeholder reads as lighter than the text that will replace it.
    color: 'rgba(174,170,170,0.5)',
  },

  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: EMBER.textPrimary,
  },
  headingAction: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 16,
    lineHeight: 24,
    color: EMBER.accent,
  },

  // Frame `1141:5262`: gap 8 between avatar and name, 24 between items.
  /*
   * Content-width, with a floor of the avatar.
   *
   * Fixed at `PINNED_AVATAR + 8` this truncated "Gala Night" to "Gala Nig…",
   * and the frame's items are content-sized — `1141:5268` is 93pt tall and as
   * wide as its label needs. A pinned row that abbreviates the thing it is
   * pinning is doing the opposite of its job.
   */
  pinned: { alignItems: 'center', gap: 8, minWidth: PINNED_AVATAR },
  pinnedMuted: { opacity: 0.8 },
  pinnedAvatar: {
    width: PINNED_AVATAR,
    height: PINNED_AVATAR,
    borderRadius: PINNED_AVATAR / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: EMBER.surfaceSunken,
  },
  // Frame: `shadow-[0_0_0_2px_#ff906d]` — a ring, drawn as a border because RN
  // has no spread-only shadow.
  pinnedRing: { borderWidth: 2, borderColor: EMBER.accent },
  pinnedName: {
    fontFamily: EMBER_FONTS.bodyMedium,
    fontSize: 16,
    lineHeight: 24,
    color: EMBER.textPrimary,
  },
  pinnedNameMuted: { color: EMBER.textSecondary },

  // Frame `1141:5265`: 16pt, #FF6D8D, 2pt page-colour ring, bottom-right.
  presence: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: EMBER.gradientTo,
    borderWidth: 2,
    borderColor: EMBER.bg,
  },
  // Frame `1141:5274`.
  eventBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: '#F79EFF',
  },
  eventBadgeText: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 10,
    lineHeight: 15,
    color: '#570066',
  },

  // Frame `1141:5292` / `1141:5304`: radius 32, p 16, gap 16.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 32,
  },
  // The unread row is taller — `pt-[28px] pb-[16px]` — which is what makes it
  // sit up out of the list rather than needing a fill behind it.
  rowUnread: { paddingTop: 28, paddingBottom: 16 },
  rowAvatar: {
    width: ROW_AVATAR,
    height: ROW_AVATAR,
    borderRadius: ROW_AVATAR / 2,
    backgroundColor: EMBER.surfaceSunken,
  },
  // Frame `1141:5306`: a room has no face, so it gets a surface disc + glyph.
  roomAvatar: {
    width: ROW_AVATAR,
    height: ROW_AVATAR,
    borderRadius: ROW_AVATAR / 2,
    backgroundColor: EMBER.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Frame `1141:5295`: 12pt accent, 2pt page-colour ring, top-right.
  /*
   * The unread dot — frame `1141:5295` / `1141:5296`.
   *
   * ## Why this is two views
   *
   * The frame's ring is `shadow: 0 0 0 2px #0F0E0E` — **outset**. RN has no
   * outset border: `borderWidth` grows inwards, so writing it as a 12pt circle
   * with `borderWidth: 2` leaves an 8pt accent core inside a 12pt footprint.
   *
   * That is not a cosmetic difference. The dot sits at the *bounding box's*
   * top-right corner, and the avatar is a circle, so the corner is empty space.
   * Measured from the 56pt avatar's centre, the dot's centre is
   * `√(22² + 22²) = 31.1` away against a radius of 28 — the dot is centred
   * outside the photograph and only its inner edge reaches back in. With an
   * 8pt core that inner edge lands at 27.1, grazing the rim by 0.9pt, and the
   * dot reads as floating in the corner. With the frame's 12pt core it lands at
   * 25.1 and bites 2.9pt into the photograph, which is what makes it read as
   * attached to the avatar rather than hovering beside it.
   *
   * So: a 16pt `bg`-coloured ring holding a 12pt accent circle, offset -2 on
   * both axes so the *accent* — not the ring — lands where the frame puts it.
   */
  unreadRing: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: EMBER.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: EMBER.accent,
  },

  rowBody: { flex: 1, gap: 2 },
  // Only the *read* rows are ruled. The unread one is a card; a border under
  // it would make it look like part of the list it is supposed to leave.
  rowBodyRuled: {
    paddingBottom: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(73,71,71,0.1)',
  },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: {
    flex: 1,
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 16,
    lineHeight: 24,
    color: EMBER.textPrimary,
  },
  rowTime: {
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 11,
    lineHeight: 16.5,
    color: EMBER.textSecondary,
  },
  rowTimeUnread: { fontFamily: EMBER_FONTS.bodyBold, color: EMBER.accent },
  rowPreview: {
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 16,
    lineHeight: 24,
    color: EMBER.textSecondary,
  },
  rowPreviewUnread: { fontFamily: EMBER_FONTS.bodySemiBold, color: EMBER.textPrimary },
})

/**
 * A message request — someone who is not yet a conversation.
 *
 * The frame has no slot for these. It cannot: a request is the one row in the
 * inbox that is not openable, because tapping it has to mean *accept* or
 * *decline* and not "read". Dropping it to match the frame would have deleted
 * working functionality, so it is built from the frame's own parts — the same
 * 32-radius card, the same avatar, the same two lines — with the two buttons
 * the frame never had to draw.
 *
 * Recorded in `docs/BANTER.md` as an addition, not an interpretation.
 */
export function BanterRequest({
  name,
  message,
  pending,
  onAccept,
  onDecline,
}: {
  name: string
  message: string
  pending?: boolean
  onAccept: () => void
  onDecline: () => void
}) {
  return (
    <View style={requestStyles.request}>
      <View style={requestStyles.requestHead}>
        <View style={styles.roomAvatar}>
          <MaterialIcons name="person-add-alt" size={20} color={EMBER.accent} />
        </View>
        <View style={requestStyles.requestBody}>
          <Text style={styles.rowTitle} numberOfLines={1} maxFontSizeMultiplier={1.4}>
            {name}
          </Text>
          <Text style={styles.rowPreview} numberOfLines={2} maxFontSizeMultiplier={1.4}>
            {message}
          </Text>
        </View>
      </View>

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
          style={({ pressed }) => [
            requestStyles.requestButton,
            (pressed || pending) && styles.pressed,
          ]}
        >
          <LinearGradient
            colors={[...EMBER_GRADIENT.colors]}
            start={EMBER_GRADIENT.start}
            end={EMBER_GRADIENT.end}
            style={StyleSheet.absoluteFill}
          />
          <Text style={requestStyles.requestAcceptLabel} maxFontSizeMultiplier={1.3}>
            Accept
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const requestStyles = StyleSheet.create({
  // The conversation row's own card — radius 32, p16, gap 16.
  request: { borderRadius: 32, padding: 16, gap: 16, backgroundColor: '#1A1818' },
  requestHead: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  requestBody: { flex: 1, gap: 4 },
  requestActions: { flexDirection: 'row', gap: 12 },
  requestButton: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  requestDecline: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  requestDeclineLabel: {
    ...EMBER_TYPE.cardEyebrow,
    color: EMBER.textPrimary,
  },
  requestAcceptLabel: {
    ...EMBER_TYPE.cardEyebrow,
    color: EMBER.onGradient,
  },
})
