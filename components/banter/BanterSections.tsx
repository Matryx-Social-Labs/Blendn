import { Ionicons, MaterialIcons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native'

import { OptimizedImage } from '../OptimizedImage'
import { pseudonymAvatar } from '../../lib/pseudonymAvatar'
import { CONTROL, EMBER, EMBER_GRADIENT, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE } from '../../lib/theme'

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

/** The screen gutter, and the design system's gap between sections. */
export const BANTER_PADDING_HORIZONTAL = GUTTER
export const BANTER_SECTION_GAP = SPACE.xxl

/** Frame `1141:5264` — a pinned avatar. `1141:5294` — a conversation's. */
export const PINNED_AVATAR = 64
export const ROW_AVATAR = 56

// Frame: `textSecondary` at half, so a placeholder reads lighter than the text
// that will replace it.
const SEARCH_PLACEHOLDER = 'rgba(174,170,170,0.5)'

/**
 * The search field — frame `1141:5249`.
 *
 * A live input that filters the inbox in place. No `autoFocus`: the keyboard
 * rises only when somebody taps it, so it never covers a list being read.
 * Without `onChangeText` it is the static frame the preview harness draws.
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

/** "Pinned" / "Recent" — frame `1141:5258`, the `heading` role. */
export function BanterHeading({
  title,
  action,
  onAction,
  trailingIcon,
}: {
  title: string
  /** "Mark all read" — `1141:5291`, a text action in the `label` role. */
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
      ) : trailingIcon ? (
        <MaterialIcons name={trailingIcon} size={ICON.sm} color={EMBER.textSecondary} />
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
            <MaterialIcons name="groups" size={ICON.lg} color={EMBER.onGradient} />
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
              size={ICON.md}
              color={EMBER.textSecondary}
            />
          </View>
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

  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: TYPE.heading,
  headingAction: { ...TYPE.label, color: EMBER.textPrimary },

  // Frame `1141:5262`: gap 8 between avatar and name, 24 between items.
  /*
   * Content-width, with a floor of the avatar.
   *
   * Fixed at `PINNED_AVATAR + 8` this truncated "Gala Night" to "Gala Nig…",
   * and the frame's items are content-sized — `1141:5268` is 93pt tall and as
   * wide as its label needs. A pinned row that abbreviates the thing it is
   * pinning is doing the opposite of its job.
   */
  pinned: { alignItems: 'center', gap: SPACE.sm, minWidth: PINNED_AVATAR },
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
  pinnedName: TYPE.bodyStrong,
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
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xxs,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: '#F79EFF',
  },
  eventBadgeText: { ...TYPE.caption, color: '#570066' },

  /*
   * No fill, so no side padding: the avatar lines up with the gutter like the
   * search field and the headings above it.
   */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.lg,
    paddingVertical: SPACE.lg,
    borderRadius: EMBER_RADIUS.card,
  },
  // The unread row is taller — 24 above, 16 below — which is what makes it
  // sit up out of the list rather than needing a fill behind it.
  rowUnread: { paddingTop: SPACE.xl, paddingBottom: SPACE.lg },
  rowAvatar: {
    width: ROW_AVATAR,
    height: ROW_AVATAR,
    borderRadius: ROW_AVATAR / 2,
    backgroundColor: EMBER.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /*
   * Fixed against Dynamic Type — `maxFontSizeMultiplier={1}`.
   *
   * The disc is a fixed 56pt and RN clips a glyph to its `lineHeight`, so a
   * scaled emoji is a cropped emoji rather than a bigger one. The name beside
   * it scales, which is where the accessibility actually lives.
   */
  // design-exception: an emoji glyph sized to fill the 56pt disc, not text
  pseudonymGlyph: { fontSize: 26, lineHeight: 32 },
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

  rowBody: { flex: 1, gap: SPACE.xxs },
  // Only the *read* rows are ruled. The unread one is a card; a border under
  // it would make it look like part of the list it is supposed to leave.
  rowBodyRuled: {
    paddingBottom: SPACE.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(73,71,71,0.1)',
  },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  rowTitle: { ...TYPE.bodyStrong, flex: 1 },
  rowTime: TYPE.meta,
  rowTimeUnread: { color: EMBER.accent },
  rowPreview: { ...TYPE.body, color: EMBER.textSecondary },
  rowPreviewUnread: TYPE.bodyStrong,
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
          <MaterialIcons name="person-add-alt" size={ICON.md} color={EMBER.textSecondary} />
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
            requestStyles.requestAccept,
            (pressed || pending) && styles.pressed,
          ]}
        >
          <Text style={requestStyles.requestAcceptLabel} maxFontSizeMultiplier={1.3}>
            Accept
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const requestStyles = StyleSheet.create({
  // A card — radius 32, p16, gap 16.
  request: { borderRadius: EMBER_RADIUS.card, padding: SPACE.lg, gap: SPACE.lg, backgroundColor: '#1A1818' },
  requestHead: { flexDirection: 'row', gap: SPACE.lg, alignItems: 'center' },
  requestBody: { flex: 1, gap: SPACE.xs },
  requestActions: { flexDirection: 'row', gap: SPACE.md },
  requestButton: {
    flex: 1,
    height: CONTROL.md,
    borderRadius: EMBER_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  requestDecline: { backgroundColor: EMBER.surface },
  requestAccept: { backgroundColor: EMBER.accent },
  requestDeclineLabel: TYPE.button,
  requestAcceptLabel: { ...TYPE.button, color: EMBER.onGradient },
})
