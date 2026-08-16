import { MaterialIcons } from '@expo/vector-icons'
import { BlurView } from 'expo-blur'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

import type { FeedMediaItem } from '../../lib/feedMedia'
import { avatarStack, pseudonymAvatar } from '../../lib/pseudonymAvatar'
import { staticMapUrl } from '../../lib/staticMap'
import { EMBER, EMBER_FONTS, EMBER_TYPE } from '../../lib/theme'

/**
 * The Scene's body sections — frame `1141:4875` and `1227:2903`.
 *
 * Presentational only: every one of these takes formatted strings and draws
 * them. The screen keeps the data, the permissions and the handlers, which is
 * what lets these be rendered in `__preview` with fixtures and no auth — the
 * only way anyone has ever actually *looked* at this design rendered.
 *
 * ## Layout constants, straight off the frame
 *
 * The content grid is inset 12 and stacks with a 64pt gap between the major
 * blocks and 48 inside the right-hand column. On a 390 frame those are absolute
 * — no scaling, same rule as the type.
 */
export const SCENE_PADDING_HORIZONTAL = 12
export const SCENE_SECTION_GAP = 64
/** Frame `1141:4910`: the map band inside the Location card. */
export const MAP_HEIGHT = 256
/**
 * Frame `1227:2903`: the floating CTA's own band, and its inset.
 *
 * The node is named **"Floating CTA"** and is a *sibling* of `Main`, not a child
 * — it lives outside the scrolling content. Built inside the ScrollView it
 * became the last thing on a ~1900pt page, which put the only action this
 * screen has as far from the reader as the layout allows.
 *
 * `SCENE_CTA_INSET` is 24 rather than the content grid's 12: the frame gives the
 * CTA its own gutter, wider than the sections behind it, which is what stops a
 * full-width pill reading as another card in the stack.
 *
 * ## 58, not the frame's 74 — a deliberate deviation
 *
 * The frame's pill is 74 because it holds a **40pt** icon (`1227:2912`), and a
 * 40pt icon beside a 28pt line of text sets the height on its own. Docked, that
 * 74 sits on top of a 24pt dock gutter and an ~88pt tab bar: **186pt of
 * permanent chrome**, better than a fifth of a 874pt screen, on a page whose
 * whole job is to show you an event.
 *
 * The frame measured the CTA floating over a scroll, where it was the only
 * thing at the bottom. It is not — the tab bar is under it. So the icon drops
 * to 26, which is the size at which it stops driving the height and the label
 * does, and the pill lands at 58. The dock gutter goes 12/12 → 10/10.
 *
 * Total saving: 24pt, chrome down to ~162pt. Recorded in `docs/SCENE.md` so the
 * frame and the build disagreeing here is a decision and not drift.
 */
export const SCENE_CTA_HEIGHT = 58
export const SCENE_CTA_INSET = 24

/** The CTA's icon. Sized here, not at the call site, because it sets the pill's height. */
export const SCENE_CTA_ICON = 26

/** A gallery tile. Square, and sized so a second one is partly visible. */
export const GALLERY_TILE = 160

/** "The Experience", "Attendees", "LOCATION". Frame: 16/24, Plus Jakarta. */
export function SceneHeading({ children }: { children: string }) {
  return <Text style={styles.heading}>{children}</Text>
}

/**
 * The prose under a heading. Frame: Manrope 16/26 on #AEAAAA.
 *
 * The frame accents the event's own name inside the paragraph in #FF906D. That
 * is a *designed* sentence, not something derivable from an arbitrary
 * organiser's description, so it is not reproduced by pattern-matching the
 * title into the body — which would highlight the word "The" in
 * "The Warehouse" and read as a rendering fault. `accent` exists for when a
 * caller genuinely has a phrase to lift.
 */
export function SceneBody({ children }: { children: React.ReactNode }) {
  return <Text style={styles.body}>{children}</Text>
}

export function SceneBodyAccent({ children }: { children: string }) {
  return <Text style={styles.bodyAccent}>{children}</Text>
}

/**
 * Attendees — a heading, and a count.
 *
 * ## The faces are not coming back
 *
 * The frame draws two photographs and "+121". `GET /events` used to return
 * exactly that — `interestedPreview`, real photographs of everyone who had
 * favourited an event, to any authenticated caller with no identity gate — and
 * it was removed as a security fix (blendn-admin #229, SCRUM-25). A face is
 * identity, and it was harvestable by topic: favourite an event, ask, collect
 * the faces of everyone else interested in that category.
 *
 * The stack stays; the **faces** do not. Each disc is a generated mark from
 * `pseudonymAvatar`, seeded by the event and the position, so the row keeps the
 * composition the frame is reaching for while encoding nothing about who is
 * attending. It is the same treatment the room already uses for anonymous
 * participants, so it reads as a deliberate convention rather than as missing
 * photographs.
 *
 * Real faces come back only with the friend graph (deferred), where "people you
 * have matched with" is a set the viewer is already entitled to see.
 */
/**
 * Who is here, or who says they will be.
 *
 * The heading is a prop because the number means two different things either
 * side of the doors. Before an event nobody has checked in, so "Attendees: —"
 * is the screen reporting emptiness for a night that has not happened; the
 * honest figure then is how many people said they are coming. Once it starts,
 * the interesting number is who actually turned up.
 */
export function SceneAttendees({
  count,
  seed,
  label = 'Attendees',
}: {
  count: number
  seed: string
  label?: string
}) {
  const { shown, remainder } = avatarStack(count)
  return (
    <View style={styles.attendeesSection}>
      <View style={styles.attendees}>
        <SceneHeading>{label}</SceneHeading>
        <Text style={styles.attendeeCount}>{count > 0 ? `${count}+` : '—'}</Text>
      </View>
      {shown > 0 ? (
        /*
          One image node, not three creatures.
          A screen reader walking this row unlabelled announces the emoji —
          "butterfly", "turtle", "fox" — which is worse than silence: it is
          confidently wrong about what is on the screen. The discs carry no
          information a blind user needs; the *count* beside them is the whole
          message, and it is already in the heading above.
        */
        <View
          style={styles.stack}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${count} people interested`}
        >
          {Array.from({ length: shown }, (_, i) => {
            /*
             * Seeded by the event and the position — deliberately *not* by any
             * attendee.
             *
             * These are marks meaning "people are going", not portraits of
             * particular ones, and the payload does not carry the identities to
             * draw them from even if we wanted to. Seeding this way keeps them
             * stable across renders (so the row does not reshuffle on every
             * scroll) while encoding nothing about who is attending.
             *
             * ## A creature, not a letter
             *
             * These drew `.initial`, which is `seed[0]` — and the seed here is
             * the *event* id, so all three discs showed the same letter. On the
             * harness that was a row reading "T T T", which looks like a
             * rendering fault rather than three people.
             *
             * A *varied* letter would have been worse, not better: a letter on
             * a disc reads as somebody's initial, and nobody's initial is what
             * this is. The faces were removed from this stack as a security fix
             * because a face is identity (blendn-admin #229); inventing
             * initials re-adds a weaker version of the same claim about people
             * the payload does not even describe.
             *
             * A creature says "a person is here" and nothing else — and it is
             * the convention the product already uses, since the pseudonyms it
             * hands out are adjective-plus-animal.
             */
            const { colors, character } = pseudonymAvatar(`${seed}:${i}`)
            return (
              <LinearGradient
                key={i}
                colors={colors as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.avatar, i > 0 && styles.avatarOverlap]}
              >
                <Text style={styles.avatarCharacter}>{character}</Text>
              </LinearGradient>
            )
          })}
          {remainder > 0 ? (
            <View style={[styles.avatar, styles.avatarMore, styles.avatarOverlap]}>
              <Text style={styles.avatarMoreText}>+{remainder}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

/**
 * The map inside the Location card — a Google Static Maps image.
 *
 * Static rather than `react-native-maps`, which is not installed: this slot
 * answers "roughly where is this", and an interactive map inside a scrolling
 * card is a gesture fight nobody asked for. Panning belongs in Hotspots'
 * "Explore the Grid", where it is the point.
 *
 * Draws a plain surface when there is no key or no coordinate, because a
 * broken image inside a card makes the card look broken, and the frame's map is
 * decorative enough that its absence costs nothing.
 */
export function SceneMap({
  latitude,
  longitude,
  width,
  onPress,
}: {
  latitude: number
  longitude: number
  width: number
  onPress?: () => void
}) {
  const url = staticMapUrl({ latitude, longitude, width, height: MAP_HEIGHT })
  const body = url ? (
    <Image
      source={{ uri: url }}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={150}
    />
  ) : null

  if (!onPress) return <View style={styles.map}>{body}</View>
  return (
    <Pressable
      style={styles.map}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open in Maps"
    >
      {body}
    </Pressable>
  )
}

/**
 * The venue card. Frame `1141:4900`: #141313, 32pt radius, hairline border.
 *
 * `map` stays a slot so the card can be rendered without a coordinate — the
 * harness does exactly that, and an event with no venue geocoded should show
 * the address without an empty grey rectangle under it.
 */
export function SceneLocationCard({
  venue,
  area,
  map,
}: {
  venue: string
  area: string
  map?: React.ReactNode
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardBody}>
        <Text style={styles.eyebrow}>LOCATION</Text>
        <Text style={styles.venue}>{venue}</Text>
        <View style={styles.addressRow}>
          {/* Frame `1141:4907`: a 16x20 filled pin — Material `location_on`. */}
          <MaterialIcons name="location-on" size={16} color={EMBER.textSecondary} />
          <Text style={styles.address} numberOfLines={2}>
            {area}
          </Text>
        </View>
      </View>
      {/* Not wrapped — `SceneMap` is its own 256pt band, and nesting it in a
          second one stacked two of them. */}
      {map}
    </View>
  )
}

/**
 * The organiser's photographs, swipeable, opening full screen on tap.
 *
 * ## Not on the frame, and it should be
 *
 * `1141:4853` has no gallery. The organiser form has had a reorderable gallery
 * the whole time — it is the same `event_media` the feed card cycles — so
 * without this, everything past the first item is authored and then never
 * shown anywhere a guest looks. That is a feature with a write path and no
 * read path, which is worse than one that does not exist.
 *
 * ## A rail, not a grid
 *
 * A grid commits vertical space proportional to the count, and the count is the
 * organiser's, so a diligent one pushes the Location card off the screen. A
 * rail costs one row whatever they upload, and swiping it is the same gesture
 * as the lightbox it opens.
 *
 * Videos are excluded: the hero already plays them, and a muted autoplaying
 * tile in a horizontal rail is the thing that makes a scroll stutter. The rail
 * is stills, and `SceneHero` is motion.
 */
export function SceneGallery({
  items,
  onOpen,
}: {
  items: FeedMediaItem[]
  onOpen: (index: number) => void
}) {
  if (items.length === 0) return null
  return (
    <View style={styles.gallerySection}>
      <SceneHeading>Gallery</SceneHeading>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.galleryRail}
        // Lands on a tile rather than between two, without paging the whole
        // width — the rail deliberately shows part of the next one as an
        // affordance that there is a next one.
        snapToInterval={GALLERY_TILE + 12}
        decelerationRate="fast"
      >
        {items.map((item, i) => {
          /*
           * A clip shows its **poster**, never the clip.
           *
           * A rail of muted autoplaying videos is the single most reliable way
           * to make a scroll stutter, and it would also mean several decoders
           * alive at once for tiles nobody has asked to watch. The badge says
           * there is motion behind it; the lightbox is where it plays.
           */
          const uri = item.kind === 'image' ? item.url : item.posterUrl
          return (
            <Pressable
              key={`${item.url}-${i}`}
              onPress={() => onOpen(i)}
              accessibilityRole="imagebutton"
              accessibilityLabel={
                item.kind === 'video'
                  ? `Video ${i + 1} of ${items.length}`
                  : `Photo ${i + 1} of ${items.length}`
              }
            >
              <Image
                source={{ uri }}
                style={styles.galleryTile}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={150}
                recyclingKey={uri}
              />
              {item.kind === 'video' ? (
                <View style={styles.playBadge} pointerEvents="none">
                  <MaterialIcons name="play-arrow" size={22} color={EMBER.textPrimary} />
                </View>
              ) : null}
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

/**
 * An amenity tile. Frame `1141:4918`: 2-up, 16pt gap, 32pt radius, 25pt pad.
 *
 * **Nothing populates these yet.** `events` has `house_rules`, which is free
 * text and a different thing — "Open Bar / Premium Spirits" is a curated
 * vocabulary an organiser picks from, and that is a small schema addition that
 * belongs with the category work rather than being invented per event. The
 * component exists so the frame can be rendered and reviewed; the screen should
 * not draw it until there is something true to put in it.
 */
export function SceneAmenity({
  icon,
  title,
  subtitle,
  /**
   * The frame gives each tile its **own** colour, not the accent.
   *
   * `local_bar` is `#F79EFF` and `camera` is `#FF6D8D` — the violet and rose
   * stops of the brand gradient rather than its orange end. Painting them both
   * `EMBER.accent`, which is what this did, collapses a deliberate two-colour
   * pair into one and makes the row look like a repeated element.
   */
  color = EMBER.accent,
  /**
   * The frame's two icons are **different sizes** — `1141:4919` is 18 and
   * `1141:4925` is 20 — and both were built at 20.
   *
   * That is not a mistake in the design: `local_bar` is a tall narrow glass and
   * `camera` is a wide circle, so matching their box sizes makes the cocktail
   * read larger than the camera. The frame sized them to look equal, which is
   * what optical sizing is for, and copying the numbers is the whole point of
   * measuring rather than eyeballing.
   */
  iconSize = 20,
  style,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name']
  title: string
  subtitle: string
  color?: string
  iconSize?: number
  style?: StyleProp<ViewStyle>
}) {
  return (
    /*
      Grouped, and its type is capped.

      Two Texts in a fixed 126pt box: at a large accessibility size the title
      and subtitle together overflow the tile and RN clips them, so the tile
      shows half a word. 1.5 is the largest step both lines still fit at.

      `accessible` collapses the pair into one announcement — "Open Bar,
      Premium Spirits" — rather than two stops that each say half of it.
    */
    <View
      style={[styles.amenity, style]}
      accessible
      accessibilityLabel={`${title}. ${subtitle}`}
    >
      <MaterialIcons name={icon} size={iconSize} color={color} />
      <Text style={styles.amenityTitle} maxFontSizeMultiplier={1.5} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.amenitySubtitle} maxFontSizeMultiplier={1.5} numberOfLines={2}>
        {subtitle}
      </Text>
    </View>
  )
}

/**
 * The sticky call to action. Frame `1227:2904`.
 *
 * A gradient-bordered pill: the gradient is the border, and a near-opaque fill
 * sits inside it at 1pt inset. Drawn as two views because React Native has no
 * gradient border — the outer LinearGradient with 1pt of padding *is* the
 * stroke.
 *
 * ## The price is not drawn
 *
 * The frame reads "Join the Experience  $45". There is no ticketing, no
 * payment, and everything is free — so a price here would be the interface
 * inventing a commitment the product cannot honour. The label says joining,
 * which is what actually happens.
 */
export type SceneCTAState = 'rsvp' | 'rsvpd' | 'join' | 'going' | 'ended'

/**
 * What the button says, per state.
 *
 * **Capacity is deliberately absent.** `docs/CHECKIN.md:39` — "Check-in does not
 * refuse at capacity" — so a full event still takes people. `max_capacity` is a
 * number the organiser watches, not a door the app keeps, and the hero pill
 * already reports it as information. A CTA that disabled itself on a full event
 * would block an interaction the product explicitly allows.
 *
 * `ended` is the only state that disables, because it is the only one where
 * tapping cannot do anything at all.
 *
 * ## "Blend in", not "Join the Experience"
 *
 * The frame's label is generic — it would fit any event app. The product is
 * called Blend'n *because* blending in with people in real time is the thing it
 * does, so the button is the one place the name can be a verb instead of a
 * logo. It is also shorter, which matters at 20pt beside a 40pt icon.
 *
 * `going` follows it: "You're in" is the same voice, and it reads as being
 * *inside* something rather than as a travel plan.
 */
const CTA_LABEL: Record<SceneCTAState, string> = {
  rsvp: "I'm going",
  rsvpd: "You're going",
  join: 'Blend in',
  going: "You're in",
  ended: 'This event has ended',
}

/**
 * The two states before the doors open, and why the button changes at all.
 *
 * "Blend in" is a check-in, and a check-in needs the event to be **running** —
 * `pickInsideEvent` requires `start <= now` and the server re-validates it. So
 * on an event that is still two days away the button was offering the one
 * action that cannot succeed: a dead control in the most prominent position on
 * the screen, which is the same fault the centre nav button was redesigned to
 * stop having.
 *
 * Before the doors, the honest offer is the one that *is* available — saying
 * you are coming. `rsvpd` is its off-switch rather than a second control, for
 * the same reason `going` is not accompanied by a "leave" button: one slot,
 * one subject, and the state tells you which way the tap goes.
 */
const CTA_QUIET: readonly SceneCTAState[] = ['rsvpd', 'going']

export function SceneCTA({
  state = 'join',
  icon,
  onPress,
}: {
  state?: SceneCTAState
  icon?: React.ReactNode
  onPress?: () => void
}) {
  const disabled = state === 'ended'
  /*
   * Quiet once you have already said yes. The gradient is for the thing that
   * still needs doing; a fully lit pill that only un-does something reads as
   * the primary action of the screen.
   */
  const quiet = CTA_QUIET.includes(state)
  /*
   * The label was a free string, which was survivable while this sat at the
   * bottom of a 1900pt page and most people never reached it. Pinned to the
   * screen for the whole visit it is the most-looked-at control here, and it
   * said "Join the Experience" whether or not you already had — the classic
   * "did that work?" failure, permanently in view.
   */
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: state === 'going' }}
      accessibilityLabel={CTA_LABEL[state]}
      style={disabled ? styles.ctaDisabled : undefined}
    >
      {/*
        Glass, and the gradient ring had to go to get it.

        The pill was a `LinearGradient` with `padding: 1` wrapping an opaque
        fill — a standard way to fake a gradient border, and it works only while
        the inner fill is opaque. It is not any more: a 50%-alpha fill over a
        gradient *rectangle* shows the whole rectangle, so the first attempt at
        this rendered a brown-to-purple wash inside the pill rather than a
        stroke around it. React Native has no gradient `borderColor` and no
        masking without a new dependency, so a translucent pill and a gradient
        ring are mutually exclusive here.

        The ring is a hairline of white at 18% instead — which is the actual
        glassmorphism idiom: an edge lit by the light passing through the sheet,
        not a painted outline. The brand does not leave: the warm bloom under
        the pill stays, and the icon takes the accent, so the gradient's warm
        end is still the first colour in the control.
      */}
      <View style={[styles.ctaGlow, quiet && styles.ctaGlowGoing]}>
        <View style={styles.ctaFill}>
          <BlurView intensity={64} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.ctaTint} pointerEvents="none" />
          {icon}
          <Text style={styles.ctaLabel} numberOfLines={1}>
            {CTA_LABEL[state]}
          </Text>
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  heading: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 16,
    lineHeight: 24,
    color: EMBER.textPrimary,
  },
  body: {
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 16,
    lineHeight: 26,
    color: EMBER.textSecondary,
  },
  bodyAccent: { color: EMBER.accent },

  attendees: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  attendeeCount: {
    fontFamily: EMBER_FONTS.bodyBold,
    /*
     * 16/24, the same as the heading beside it — which is the frame.
     *
     * This was briefly 28, on the argument that with no avatar stack the count
     * was carrying the whole section. The stack is back, and a count at nearly
     * twice the heading's size next to it read as two unrelated things rather
     * than as a row.
     */
    fontSize: 16,
    lineHeight: 24,
    color: EMBER.accent,
  },

  attendeesSection: { gap: 32 },
  /* Frame `1141:4890`: 56pt discs, 4pt page-coloured ring, overlapping 16. */
  stack: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 4,
    borderColor: EMBER.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOverlap: { marginLeft: -16 },
  /*
   * 26 inside a 48pt inner circle — the disc is 56 with a 4pt border, so the
   * usable area is 48 and this fills 54% of it, which centres a glyph without
   * letting its bounding box touch the ring.
   *
   * No `fontFamily`: an emoji has to resolve to the system colour font, and
   * naming a text face here makes some platforms fall back to a monochrome
   * outline.
   */
  avatarCharacter: {
    fontSize: 26,
    lineHeight: 32,
    textAlign: 'center',
  },
  avatarMore: { backgroundColor: EMBER.surfaceSunken },
  avatarMoreText: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 16,
    lineHeight: 24,
    color: EMBER.accent,
  },

  card: {
    backgroundColor: EMBER.surfaceMedia,
    borderWidth: 1,
    borderColor: 'rgba(73,71,71,0.1)',
    borderRadius: 32,
    overflow: 'hidden',
  },
  /*
   * `1141:4901`: `pt-[32px] px-[32px] pb-[56px]`, `gap-[8px]`.
   *
   * The bottom is **56**, not 32. It is the gap between the address line and
   * the map band below it, and at 32 the two crowded — the card read as text
   * sitting on a photograph rather than as a caption above a map.
   */
  cardBody: { paddingTop: 32, paddingHorizontal: 32, paddingBottom: 56, gap: 8 },
  /*
   * `1141:4903`: Plus Jakarta **Regular**, not Bold.
   *
   * Both this and the venue name were built Bold. The frame sets the whole card
   * in Regular and lets the 1.6px tracking and the `#AEAAAA` do the eyebrow's
   * work — bold at 16pt with wide tracking reads as a heading competing with
   * "The Experience" above it, which is a heading.
   */
  eyebrow: EMBER_TYPE.cardEyebrow,
  /*
   * `1141:4904` is `pt-[16px]`, and `1141:4905` is Plus Jakarta **Regular**.
   *
   * The 8 came from reusing the card's `gap`; the frame gives this container
   * its own top padding on top of that gap, so the venue name sits 24 below the
   * eyebrow rather than 16.
   */
  venue: { ...EMBER_TYPE.cardValue, paddingTop: 16 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  address: {
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 16,
    lineHeight: 24,
    color: EMBER.textSecondary,
    flexShrink: 1,
  },
  map: { height: MAP_HEIGHT, backgroundColor: EMBER.surfaceSunken },

  gallerySection: { gap: 16 },
  // Bleeds past the page gutter so the rail runs to the edge, which is what
  // says "this scrolls" without needing a chevron.
  galleryRail: { gap: 12, paddingRight: 24 },
  galleryTile: {
    width: GALLERY_TILE,
    height: GALLERY_TILE,
    borderRadius: 24,
    backgroundColor: EMBER.surfaceSunken,
  },
  playBadge: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,14,14,0.7)',
  },

  /*
   * `1141:4917` is `grid-rows-[126px]` — a **fixed** 126, not content height.
   *
   * Content-sized, the two tiles agreed only while their text wrapped the same
   * way. "Open Bar / Premium Spirits" and "Pro Photo / Digital Gallery" both
   * fit one line each, so the row looked right — until an amenity with a longer
   * subtitle wrapped and one tile grew taller than its neighbour, which is a
   * ragged row rather than a pair.
   *
   * A grid row is a floor and a ceiling in CSS; here it is `height`, so the
   * pair is always level whatever the vocabulary eventually contains.
   */
  amenity: {
    flex: 1,
    height: 126,
    backgroundColor: EMBER.surfaceMedia,
    borderWidth: 1,
    borderColor: 'rgba(73,71,71,0.05)',
    borderRadius: 32,
    padding: 25,
  },
  amenityTitle: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 16,
    lineHeight: 24,
    color: EMBER.textPrimary,
    paddingTop: 12,
  },
  amenitySubtitle: {
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 12,
    lineHeight: 16,
    color: EMBER.textSecondary,
  },

  /*
   * The warm bloom, and it is the only place the gradient's colour survives on
   * this control now. `shadowRadius: 30` is a soft halo on iOS; on Android
   * `elevation` cannot be coloured, so it simply does not get one rather than
   * getting a grey drop-shadow that reads as a mistake.
   */
  ctaGlow: {
    borderRadius: 9999,
    ...Platform.select({
      ios: {
        shadowColor: '#FF906D',
        shadowOpacity: 0.22,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
      },
      default: {},
    }),
  },
  // Joined is settled, not an invitation: the bloom drops away and the pill
  // stops advertising itself.
  ctaGlowGoing: Platform.OS === 'ios' ? { shadowOpacity: 0.14 } : {},
  ctaFill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    /*
     * Content width, not screen width.
     *
     * A full-bleed pill is a *bar*, and a bar is a piece of chrome — it reads as
     * part of the frame of the app rather than as an object sitting on the page.
     * Padded to its label it becomes a floating control, which is what the node
     * called "Floating CTA" is, and it stops claiming the whole width of a
     * screen whose job is to show an event.
     */
    paddingHorizontal: 32,
    // 14, with a 26pt icon and a 28pt line: 1 + 14 + 28 + 14 + 1 = 58, which is
    // SCENE_CTA_HEIGHT. Change either and the dock's reserved band is wrong.
    paddingVertical: 14,
    borderRadius: 9999,
    // Clips the BlurView to the pill. Without it the blur is a rectangle.
    overflow: 'hidden',
    // The lit edge. `hairlineWidth` would vanish at this radius, so 1pt.
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  /*
   * The tint over the blur — **warm**, and that is the whole design.
   *
   * A neutral `rgba(15,14,14,0.5)` was tried first and it is what glass on this
   * screen actually looks like: the pill docks over the bottom of a dark map on
   * a `#0F0E0E` page, so there is nothing luminous behind it to refract and a
   * neutral frost renders as a near-black slab. It read as a *disabled* control
   * in the position of the primary one.
   *
   * `#4B2F26` is `gradientFrom` at 25% over the page background, so the tint is
   * the brand's warm end rather than an invented brown. Frosted and warm is the
   * tinted-glass idiom iOS itself uses for a docked primary action, and it
   * keeps the colour the gradient ring used to carry.
   *
   * Alpha is platform-split: `expo-blur` on Android needs
   * `experimentalBlurMethod` and degrades to nothing without it, so at 0.62 the
   * label would sit on raw photograph. Android keeps a near-opaque fill and
   * simply does not get the glass.
   */
  ctaTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Platform.OS === 'ios' ? 'rgba(75,47,38,0.74)' : 'rgba(48,30,25,0.94)',
  },
  ctaDisabled: { opacity: 0.45 },
  ctaLabel: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 18,
    lineHeight: 28,
    letterSpacing: -0.45,
    color: EMBER.textPrimary,
  },
})
