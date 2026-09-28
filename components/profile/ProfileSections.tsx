import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { LayoutAnimationConfig } from 'react-native-reanimated'

import type { FeedMediaItem } from '../../lib/feedMedia'
import { pseudonymAvatar } from '../../lib/pseudonymAvatar'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, OPACITY, SPACE, TYPE, tint } from '../../lib/theme'
import { fadeInFast, fadeOutFast } from '../motion/presence'
import ScalePress from '../motion/ScalePress'
import { OptimizedImage } from '../OptimizedImage'
import { SceneHeroMedia } from '../scene/SceneHeroMedia'

/**
 * A profile, in pieces — frame `1141:5163` (attendee) and `1141:5633` (own).
 *
 * Presentational only. Every one takes formatted values and draws them; the
 * screens keep the fetching, the permissions and the handlers.
 *
 * ## The screen has three states and only the server knows which
 *
 * `app/api/mobile/profiles/[userId]` gates on `maySeeIdentity`, and the split it
 * makes is not "show less" — it is a different set of facts:
 *
 *   unrevealed   age, interests, location, work_field
 *   revealed     ...and name, photo, bio, occupation, education, gallery
 *   self         ...and email, and the dating fields
 *
 * `work_field` sits *outside* the gate deliberately, and the route says why:
 * "works in design" is an attribute; "Principal Designer at Swiggy" is an
 * address. So an unrevealed profile is not an empty one — it carries the same
 * facts the grid card showed, which is the point of the reveal being worth
 * something.
 *
 * Nothing here re-derives any of that. A missing field is simply not drawn, and
 * never drawn as a fault: "no bio" and "not allowed to see the bio" look
 * identical in the payload by design, and inventing a distinction in the UI
 * would leak the one the server withheld.
 */

/** Frame `1141:5165`: 751 on a 390 artboard. */
export const PROFILE_HERO_ASPECT = 751 / 390

/**
 * The hero: their media, cycling, under a gradient with the name on it.
 *
 * `SceneHeroMedia` rather than a new pager — it already does exactly what this
 * needs, including the rule that matters: it advances on its own until the first
 * manual swipe and then never again for the life of the screen. Resuming after a
 * pause moves the thing you are looking at out from under you.
 *
 * With no photo to show — an unrevealed profile — it draws the generated mark
 * instead. Same mark as the grid card, the match sheet and the Banter row, so
 * one person is one colour and one creature everywhere they appear under that
 * pseudonym.
 */
export function ProfileHero({
  width,
  photos,
  title,
  subtitle,
  pseudonym,
  blurred = false,
  onPressMedia,
}: {
  width: number
  /** Empty when they have not revealed. Never a blurred stand-in — see below. */
  photos: string[]
  /** "Julian Ember, 24", or the pseudonym. */
  title: string
  /** The line under it. `work_field`, or occupation on your own. */
  subtitle?: string | null
  /** Seeds the mark when there is no photo. */
  pseudonym: string
  /**
   * Show the photo blurred rather than the generated mark.
   *
   * Requires the server to send a **blurred derivative**. Blurring client-side
   * would be theatre: the original travels in the payload and lands in the
   * device cache, so a proxy, a network inspector or a rooted device has the
   * unblurred file — the same leak `#229` closed, with a cosmetic layer on top.
   *
   * Today `profile_photos` is empty for anyone unrevealed, so nothing reaches
   * this path in the real app; it renders in the fixture harness so the look can
   * be judged before the server work is decided. See `docs/PROFILE.md`.
   */
  blurred?: boolean
  onPressMedia?: (index: number) => void
}) {
  const height = Math.round(width * PROFILE_HERO_ASPECT)
  const playlist: FeedMediaItem[] = photos.map((url) => ({ kind: 'image', url }))
  const mark = pseudonymAvatar(pseudonym)

  return (
    <View style={{ width, height }}>
      {blurred && photos.length > 0 ? (
        /*
         * One still, not the pager. Cycling blurred photographs is motion with
         * no information in it -- you cannot tell the frames apart, so it reads
         * as a rendering fault rather than as a gallery.
         */
        <Image
          source={{ uri: photos[0] }}
          style={{ width, height }}
          contentFit="cover"
          blurRadius={60}
          accessibilityLabel="Blurred photo, hidden until they reveal"
        />
      ) : playlist.length > 0 ? (
        <SceneHeroMedia
          playlist={playlist}
          width={width}
          height={height}
          onPress={onPressMedia}
        />
      ) : (
        /*
         * No photograph, and nothing derived from one.
         *
         * `rankMatches` sends no `profile_photos` for anyone unrevealed, so
         * there is nothing here to blur even if blurring were acceptable --
         * `lib/pseudonymAvatar.ts` records why it is not: in-app blur leaves the
         * original in the payload and the device cache, and server-side blur
         * still carries skin tone, hair colour and build.
         */
        <LinearGradient colors={mark.colors} style={[styles.markFill, { width, height }]}>
          <Text style={styles.markGlyph} maxFontSizeMultiplier={1}>
            {mark.character}
          </Text>
        </LinearGradient>
      )}

      {/*
        Frame `1141:5167`. The name sits on the picture, so the picture has to
        stop competing with it — without this the type lands on whatever the
        bottom of the photograph happens to be.
      */}
      <LinearGradient
        colors={[EMBER.bgClear, tint(EMBER.bg, 0.7), EMBER.bg]}
        locations={[0.45, 0.78, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.heroText} pointerEvents="none">
        <Text style={styles.heroTitle} maxFontSizeMultiplier={1.2} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.heroSubtitle} maxFontSizeMultiplier={1.3}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

/** A section heading, `TYPE.heading`. */
export function ProfileHeading({ title, trailing }: { title: string; trailing?: string | null }) {
  return (
    <View style={styles.headingRow}>
      <Text style={styles.heading} maxFontSizeMultiplier={1.4} accessibilityRole="header">
        {title}
      </Text>
      {trailing ? (
        <Text style={styles.headingTrailing} maxFontSizeMultiplier={1.3}>
          {trailing}
        </Text>
      ) : null}
    </View>
  )
}

/** Frame `1141:5182`: Manrope Regular 16/**26**, `#AEAAAA`. The 26 is the frame's. */
export function ProfileBio({ text }: { text: string }) {
  return (
    <Text style={styles.bio} maxFontSizeMultiplier={1.6}>
      {text}
    </Text>
  )
}

/**
 * The interests bento — frame `1141:5186`.
 *
 * The frame absolutely-positions five chips into a fixed 168pt box. Built as a
 * wrapping row instead: the frame's arrangement only holds for those five
 * strings, and a real person's interests are any number of any length. Same
 * chip, same gaps, same highlight rule.
 *
 * A **shared** interest — the server already intersects those — gets a
 * hairline edge the plain chips do not, which marks the most useful thing on
 * the screen: the reason you might talk to them.
 */
export function ProfileInterests({
  interests,
  sharedInterests,
}: {
  interests: string[]
  /** Lower-cased for comparison by the caller. Empty on your own profile. */
  sharedInterests?: string[]
}) {
  const shared = new Set((sharedInterests ?? []).map((s) => s.toLowerCase()))

  return (
    <View style={styles.chipWrap}>
      {interests.map((interest) => {
        const isShared = shared.has(interest.toLowerCase())
        return isShared ? (
          <View key={interest} style={[styles.chip, styles.chipShared]}>
            <Text style={styles.chipLabelShared} maxFontSizeMultiplier={1.4}>
              {interest}
            </Text>
          </View>
        ) : (
          <View key={interest} style={[styles.chip, styles.chipPlain]}>
            <Text style={styles.chipLabel} maxFontSizeMultiplier={1.4}>
              {interest}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

/**
 * Occupation and education — frames `1141:5199` and `1141:5207`.
 *
 * Asymmetric on purpose: the first is a filled `#141313` card at radius 32, the
 * second is a bare block with a left hairline. Keeping that asymmetry is what
 * stops two adjacent facts reading as a table.
 *
 * One line, not the frame's two. `profiles.occupation` and `profiles.education`
 * are each a single string; the frame splits them into role/employer and
 * subject/institution, which is two more nullable columns and an onboarding
 * change. Recorded in `docs/PROFILE.md`.
 */
export function ProfileDetail({
  label,
  value,
  variant = 'card',
}: {
  label: string
  value: string
  variant?: 'card' | 'ruled'
}) {
  return (
    <View style={variant === 'card' ? styles.detailCard : styles.detailRuled}>
      <Text style={styles.detailLabel} maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
      <Text style={styles.detailValue} maxFontSizeMultiplier={1.4}>
        {value}
      </Text>
    </View>
  )
}

/** Two columns, gap 16, 163pt cells. */
export function ProfileGallery({
  photos,
  columnWidth,
  onPressPhoto,
}: {
  photos: string[]
  columnWidth: number
  onPressPhoto?: (index: number) => void
}) {
  return (
    <View style={styles.galleryGrid}>
      {photos.map((url, i) => (
        <ScalePress
          key={`${url}:${i}`}
          onPress={() => onPressPhoto?.(i)}
          haptic={false}
          accessibilityRole="imagebutton"
          accessibilityLabel={`Photo ${i + 1} of ${photos.length}`}
          style={[styles.galleryCell, { width: columnWidth }]}
        >
          <OptimizedImage
            source={url}
            recyclingKey={url}
            style={styles.galleryImage as never}
            width={Math.round(columnWidth)}
            height={163}
            contentFit="cover"
          />
        </ScalePress>
      ))}
    </View>
  )
}

/**
 * The two actions — frame `1141:5237`, at the foot of the page rather than
 * floating over it.
 *
 * ## Why it does not float
 *
 * The frame calls it a "Floating Actions Container", and built that way it
 * collided with the hero: the hero is `751/390` of the width, so on a 956pt
 * screen it is 847 tall and its name block lands exactly where the pill sits.
 * The first version needed 100pt of clearance inside the hero purely to hold the
 * button off the name — a whole prop existing to serve the float.
 *
 * Floating also costs ~100pt of every scroll position, permanently, on a screen
 * whose entire job is reading.
 *
 * And it buys nothing here. A floating CTA is right when the decision is urgent
 * — the Scene's "Blend in" floats because you are standing at the venue and the
 * event is now. Connecting to a person is considered, which is the whole reason
 * this screen exists. **The fast path already exists**: the grid card carries a
 * like, so anyone who does not need to read can act without ever opening this.
 * Reaching the bottom of a profile *is* the signal that you read enough.
 *
 * ## Two, but not the frame's two
 *
 * The frame has **Connect** and **Appreciate**. Nothing appreciates a profile,
 * so that one is not built (`docs/PROFILE.md`). What takes the second slot is
 * the same pair the Grid card carries, because they are the same two things and
 * arriving here should not change what they mean:
 *
 *   Like     private, symmetric, stays pseudonymous
 *   Connect  a message request, and it reveals your name and photo
 *
 * Like keeps the accent here too. The safe, reversible action is the easy one
 * on every surface — a button that publishes your identity should not be the
 * loudest thing on two different screens. Once liked it drops to a `surface`
 * pill, so it still reads against the sunken tray.
 *
 * **Like needs an event.** `event_likes` is keyed on one, so it is offered only
 * when the caller knows which room you met in. Opened from a notification or the
 * Banter there is no such context, and the button is absent rather than broken.
 */
export function ProfileActions({
  name,
  label,
  onPress,
  disabled,
  hint,
  liked,
  likeBusy,
  onLike,
  style,
}: {
  /** Theirs, as the server resolved it. Used in the spoken labels. */
  name: string
  /** Connect, Requested, or Message — the relationship. */
  label: string
  onPress: () => void
  disabled?: boolean
  /** The line under it — "Request pending", "You are connected". */
  hint?: string | null
  liked?: boolean
  likeBusy?: boolean
  /** Absent when there is no event to like within. */
  onLike?: () => void
  style?: StyleProp<ViewStyle>
}) {
  return (
    <View style={[styles.actionsWrap, style]}>
      <View style={styles.actionsPill}>
        {onLike ? (
          <ScalePress
            onPress={onLike}
            haptic={false}
            disabled={liked || likeBusy}
            accessibilityRole="button"
            accessibilityLabel={
              liked
                ? `You liked ${name}`
                : `Like ${name}. They are only told if they like you back`
            }
            accessibilityState={{ disabled: !!(liked || likeBusy) }}
            style={[
              styles.actionButton,
              liked ? styles.actionLiked : styles.actionPrimary,
              likeBusy && styles.pressed,
            ]}
          >
            {liked ? (
              <Text style={styles.actionLikedLabel} maxFontSizeMultiplier={1.3}>
                Liked
              </Text>
            ) : (
              <Text style={styles.actionLabel} maxFontSizeMultiplier={1.3}>
                Like
              </Text>
            )}
          </ScalePress>
        ) : null}

        <ScalePress
          onPress={onPress}
          haptic={false}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={
            label === 'Connect'
              ? `Connect with ${name}. Sends a message and shows them your name and photo`
              : label
          }
          accessibilityState={{ disabled: !!disabled }}
          accessibilityHint={hint ?? undefined}
          style={[styles.actionButton, styles.actionSecondary, disabled && styles.pressed]}
        >
          {/*
            Connect → Requested (or Message) crossfades rather than jumps:
            keyed on the label, so the change is an exit and an entrance.
            `skipEntering` keeps the first paint still; only a change while
            the page is open animates.
          */}
          <LayoutAnimationConfig skipEntering skipExiting>
            <Animated.Text
              key={label}
              entering={fadeInFast}
              exiting={fadeOutFast}
              style={styles.actionSecondaryLabel}
              maxFontSizeMultiplier={1.3}
            >
              {label}
            </Animated.Text>
          </LayoutAnimationConfig>
        </ScalePress>
      </View>
    </View>
  )
}


const styles = StyleSheet.create({


  pressed: { opacity: OPACITY.pressed },

  markFill: { alignItems: 'center', justifyContent: 'center' },
  /*
   * Fixed against Dynamic Type: the hero is a fixed height and RN clips a glyph
   * to its `lineHeight`, so a scaled emoji is a cropped one. The name below it
   * scales, which is where the accessibility lives.
   */
  markGlyph: { fontSize: 128, lineHeight: 150 }, // design-exception: emoji hero sized to fill the portrait, not text

  // Anchored to the foot of the hero, on the screen gutter.
  heroText: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: GUTTER, paddingVertical: SPACE.xxl, gap: SPACE.sm },
  heroTitle: { ...TYPE.display },
  heroSubtitle: { ...TYPE.body, color: EMBER.textSecondary },

  headingRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  heading: { ...TYPE.heading },
  headingTrailing: { ...TYPE.meta },

  bio: { ...TYPE.body, color: EMBER.textSecondary },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md },
  chip: {
    minHeight: CONTROL.md,
    justifyContent: 'center',
    paddingHorizontal: SPACE.lg,
    borderRadius: EMBER_RADIUS.pill,
    overflow: 'hidden',
  },
  chipPlain: { backgroundColor: EMBER.surface },
  // A primary outline, not a hairline: `separator` vanishes against the fill.
  chipShared: {
    backgroundColor: EMBER.surface,
    borderWidth: 1,
    borderColor: EMBER.textPrimary,
  },
  chipLabel: { ...TYPE.bodyStrong },
  chipLabelShared: { ...TYPE.bodyStrong, color: EMBER.textPrimary },

  detailCard: {
    backgroundColor: EMBER.surfaceMedia,
    borderRadius: EMBER_RADIUS.card,
    padding: SPACE.xl,
    gap: SPACE.lg,
  },
  // No fill, a left hairline.
  detailRuled: {
    borderLeftWidth: 1,
    borderLeftColor: EMBER.separator,
    paddingHorizontal: SPACE.xl,
    paddingVertical: SPACE.xl,
    gap: SPACE.lg,
  },
  detailLabel: { ...TYPE.label },
  detailValue: { ...TYPE.title },

  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.lg },
  galleryCell: {
    height: 163,
    borderRadius: EMBER_RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: EMBER.surfaceSunken,
  },
  galleryImage: { width: '100%', height: '100%' },

  actionsWrap: { alignItems: 'center' },
  /*
   * A flat tray, no lift. `surfaceSunken`, not `surface`: the secondary button
   * inside it is `surface`, and on a `surface` tray it would have no edge.
   */
  actionsPill: {
    flexDirection: 'row',
    gap: SPACE.sm,
    alignSelf: 'stretch',
    padding: SPACE.sm,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surfaceSunken,
  },
  actionButton: {
    flex: 1,
    minHeight: CONTROL.lg,
    paddingHorizontal: SPACE.xl,
    paddingVertical: SPACE.lg,
    borderRadius: EMBER_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  actionPrimary: { backgroundColor: EMBER.accent },
  actionLabel: { ...TYPE.button, color: EMBER.onGradient, textAlign: 'center' },
  actionSecondary: { backgroundColor: EMBER.surface },
  actionSecondaryLabel: { ...TYPE.button, textAlign: 'center' },
  actionLiked: { backgroundColor: EMBER.surface },
  actionLikedLabel: { ...TYPE.button, color: EMBER.textSecondary, textAlign: 'center' },
})
