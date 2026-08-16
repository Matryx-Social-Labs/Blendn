import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'

import type { FeedMediaItem } from '../../lib/feedMedia'
import { pseudonymAvatar } from '../../lib/pseudonymAvatar'
import { EMBER, EMBER_FONTS, EMBER_GRADIENT } from '../../lib/theme'
import OptimizedImage from '../OptimizedImage'
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
/** Frame `1141:5177`: `px-[12px]`, `gap-[64px]`. */
export const PROFILE_GUTTER = 12
export const PROFILE_SECTION_GAP = 64

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
  bottomInset = 0,
}: {
  width: number
  /** Empty when they have not revealed. Never a blurred stand-in — see below. */
  photos: string[]
  /** "Julian Ember, 24", or the pseudonym. */
  title: string
  /** The accent line under it. `work_field`, or occupation on your own. */
  subtitle?: string | null
  /** Seeds the mark when there is no photo. */
  pseudonym: string
  /**
   * Extra clearance under the name.
   *
   * The name is anchored to the bottom of the hero, which is right on
   * `app/user/[id].tsx` -- a full-screen route where the hero *is* the first
   * screen. `app/(tabs)/profile.tsx` has a tab bar over that same edge, and
   * the second line of "Sagar Kishore, 28" rendered underneath it.
   *
   * A prop rather than a lookup inside: the component has no idea which
   * navigator it is in, and `TAB_BAR_CLEARANCE` is the caller's fact.
   */
  bottomInset?: number
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
        colors={['transparent', 'rgba(15,14,14,0.7)', EMBER.bg]}
        locations={[0.45, 0.78, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View
        style={[styles.heroText, bottomInset ? { paddingBottom: 32 + bottomInset } : null]}
        pointerEvents="none"
      >
        {/* Frame `1141:5171`: Plus Jakarta Bold 60/60, tracking -3. */}
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

/** Frame `1141:5180`: Plus Jakarta Bold 16/24, tracking -0.4. */
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
 * `highlightIndex` is the frame's one gradient chip. On an attendee profile it
 * marks a **shared** interest — the server already intersects those — which
 * turns a decorative accent into the most useful thing on the screen: the
 * reason you might talk to them.
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
          <LinearGradient
            key={interest}
            colors={[...EMBER_GRADIENT.colors]}
            start={EMBER_GRADIENT.start}
            end={EMBER_GRADIENT.end}
            style={styles.chip}
          >
            <Text style={styles.chipLabelShared} maxFontSizeMultiplier={1.4}>
              {interest}
            </Text>
          </LinearGradient>
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

/** Frame `1141:5221`: two columns, gap 16, radius 32, 163pt cells. */
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
        <Pressable
          key={`${url}:${i}`}
          onPress={() => onPressPhoto?.(i)}
          accessibilityRole="imagebutton"
          accessibilityLabel={`Photo ${i + 1} of ${photos.length}`}
          style={({ pressed }) => [
            styles.galleryCell,
            { width: columnWidth },
            pressed && styles.pressed,
          ]}
        >
          <OptimizedImage
            source={url}
            recyclingKey={url}
            style={styles.galleryImage as never}
            width={Math.round(columnWidth)}
            height={163}
            contentFit="cover"
          />
        </Pressable>
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
 * Like keeps the gradient here too. The safe, reversible action is the easy one
 * on every surface — a button that publishes your identity should not be the
 * prettiest thing on two different screens.
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
          <Pressable
            onPress={onLike}
            disabled={liked || likeBusy}
            accessibilityRole="button"
            accessibilityLabel={
              liked
                ? `You liked ${name}`
                : `Like ${name}. They are only told if they like you back`
            }
            accessibilityState={{ disabled: !!(liked || likeBusy) }}
            style={({ pressed }) => [
              styles.actionButton,
              liked && styles.actionLiked,
              (pressed || likeBusy) && styles.pressed,
            ]}
          >
            {liked ? (
              <Text style={styles.actionLikedLabel} maxFontSizeMultiplier={1.3}>
                Liked
              </Text>
            ) : (
              <>
                <LinearGradient
                  colors={[...EMBER_GRADIENT.colors]}
                  start={EMBER_GRADIENT.start}
                  end={EMBER_GRADIENT.end}
                  style={StyleSheet.absoluteFill}
                />
                <Text style={styles.actionLabel} maxFontSizeMultiplier={1.3}>
                  Like
                </Text>
              </>
            )}
          </Pressable>
        ) : null}

        <Pressable
          onPress={onPress}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={
            label === 'Connect'
              ? `Connect with ${name}. Sends a message and shows them your name and photo`
              : label
          }
          accessibilityState={{ disabled: !!disabled }}
          accessibilityHint={hint ?? undefined}
          style={({ pressed }) => [
            styles.actionButton,
            styles.actionSecondary,
            (pressed || disabled) && styles.pressed,
          ]}
        >
          <Text style={styles.actionSecondaryLabel} maxFontSizeMultiplier={1.3}>
            {label}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

/**
 * The own-profile close. Frame `1141:5734`.
 *
 * ## Why your own profile ends in a call to action at all
 *
 * An attendee's profile ends in *Connect* — there is somebody to reach. Your
 * own has nobody to reach, and the frame fills that with **"Expand Your
 * Circle"** over an **Edit profile** button, which is the honest thing to put
 * there: the only reason to look at your own profile is to change what other
 * people see.
 *
 * ## Black, not `surface`
 *
 * `1141:5734` is `bg-black` where every other card on this screen is
 * `#141313` or `#211F1F`. It is the one place the page goes darker than its own
 * background, and that inversion is what makes it read as the end of the
 * scroll rather than one more section.
 */
export function ProfileOwnCta({ onEdit }: { onEdit: () => void }) {
  return (
    <View style={styles.ownCta}>
      <Text style={styles.ownCtaTitle} maxFontSizeMultiplier={1.2}>
        Expand Your <Text style={styles.ownCtaAccent}>Circle</Text>
      </Text>

      <Pressable
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel="Edit profile"
        style={({ pressed }) => [styles.ownCtaButton, pressed && styles.ownCtaPressed]}
      >
        <LinearGradient
          colors={[EMBER.gradientFrom, EMBER.gradientTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.ownCtaFill}
        >
          <Text style={styles.ownCtaLabel} maxFontSizeMultiplier={1.2}>
            EDIT PROFILE
          </Text>
        </LinearGradient>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  ownCta: {
    backgroundColor: '#000000',
    borderRadius: 48,
    /*
     * 80 in the frame. Kept, because the whole job of this block is to stop the
     * scroll -- trimmed to a normal card padding it stops reading as an ending
     * and starts reading as a section somebody forgot to fill.
     */
    paddingVertical: 80,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 24,
  },
  ownCtaTitle: {
    fontFamily: EMBER_FONTS.displayExtraBold,
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -1.8,
    color: EMBER.textPrimary,
    textAlign: 'center',
  },
  /*
   * The frame sets "Circle" in gradient-filled text. React Native cannot fill
   * glyphs with a gradient without masking the whole line, which costs a native
   * view and breaks selection -- so the warm end of the gradient as a flat
   * colour, which is what `EMBER.accent` is for.
   */
  ownCtaAccent: { color: EMBER.accent },
  ownCtaButton: { borderRadius: 9999, overflow: 'hidden' },
  ownCtaFill: { paddingHorizontal: 48, paddingVertical: 16, alignItems: 'center' },
  ownCtaPressed: { opacity: 0.85 },
  ownCtaLabel: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0.5,
    color: EMBER.onGradient,
  },

  pressed: { opacity: 0.75 },

  markFill: { alignItems: 'center', justifyContent: 'center' },
  /*
   * Fixed against Dynamic Type: the hero is a fixed height and RN clips a glyph
   * to its `lineHeight`, so a scaled emoji is a cropped one. The name below it
   * scales, which is where the accessibility lives.
   */
  markGlyph: { fontSize: 128, lineHeight: 150 },

  // Frame `1141:5168`: p32, gap 8, anchored to the foot of the hero.
  heroText: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 32, gap: 8 },
  heroTitle: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 60,
    lineHeight: 60,
    letterSpacing: -3,
    color: EMBER.textPrimary,
  },
  // Frame `1141:5176`: Manrope Medium 16/24, accent, tracking 0.4.
  heroSubtitle: {
    fontFamily: EMBER_FONTS.bodyMedium,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0.4,
    color: EMBER.accent,
  },

  headingRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  heading: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: EMBER.textPrimary,
  },
  headingTrailing: {
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 14,
    lineHeight: 20,
    color: EMBER.textSecondary,
  },

  bio: {
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 16,
    // 26, not the 24 every other body line uses. The frame gives the bio more
    // air than the rest because it is the only long-form text on the screen.
    lineHeight: 26,
    color: EMBER.textSecondary,
  },

  // Frame `1141:5187`: px24 py12, radius full, `rgba(45,44,44,0.4)`.
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chip: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 9999,
    overflow: 'hidden',
  },
  chipPlain: { backgroundColor: 'rgba(45,44,44,0.4)' },
  chipLabel: {
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 16,
    lineHeight: 24,
    color: EMBER.textPrimary,
  },
  chipLabelShared: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 16,
    lineHeight: 24,
    color: EMBER.onGradient,
  },

  detailCard: {
    backgroundColor: EMBER.surfaceMedia,
    borderRadius: 32,
    padding: 32,
    gap: 16,
  },
  // Frame `1141:5207`: no fill, a left hairline, `pl-[33px]`.
  detailRuled: {
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(73,71,71,0.1)',
    paddingLeft: 33,
    paddingRight: 32,
    paddingVertical: 32,
    gap: 16,
  },
  detailLabel: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.2,
    color: EMBER.accent,
  },
  detailValue: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 24,
    lineHeight: 32,
    color: EMBER.textPrimary,
  },

  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  galleryCell: {
    height: 163,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: EMBER.surfaceSunken,
  },
  galleryImage: { width: '100%', height: '100%' },

  actionsWrap: { alignItems: 'center' },
  // Frame `1141:5237`: p8, radius full, `rgba(45,44,44,0.4)`.
  actionsPill: {
    flexDirection: 'row',
    gap: 12,
    alignSelf: 'stretch',
    marginHorizontal: PROFILE_GUTTER,
    padding: 8,
    borderRadius: 9999,
    backgroundColor: 'rgba(45,44,44,0.9)',
    shadowColor: EMBER.gradientFrom,
    shadowOpacity: 0.2,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  // Frame `1141:5239`: px32 py16.
  actionButton: {
    flex: 1,
    minHeight: 60,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  actionLabel: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 18,
    lineHeight: 28,
    color: EMBER.onGradient,
    textAlign: 'center',
  },
  actionSecondary: { backgroundColor: EMBER.surface },
  actionSecondaryLabel: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 18,
    lineHeight: 28,
    color: EMBER.textPrimary,
    textAlign: 'center',
  },
  actionLiked: { backgroundColor: EMBER.surfaceSunken },
  actionLikedLabel: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 18,
    lineHeight: 28,
    color: EMBER.accent,
    textAlign: 'center',
  },
})
