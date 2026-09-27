import { useState } from 'react'
import { MaterialIcons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

import type { DetailBlock } from '../../lib/eventDetails'
import type { FeedMediaItem } from '../../lib/feedMedia'
import { avatarStack, pseudonymAvatar } from '../../lib/pseudonymAvatar'
import MapView, { Marker } from 'react-native-maps'
import Animated, {
  Easing,
  FadeIn,
  LayoutAnimationConfig,
  ReduceMotion,
  useReducedMotion,
  withTiming,
} from 'react-native-reanimated'
import ScalePress from '../motion/ScalePress'
import { MOTION_DURATION, MOTION_EASING } from '../../lib/motion'
import { DARK_MAP_STYLE, LOCATION_CARD_DELTA } from '../../lib/mapStyle'
import { CONTROL, EMBER, EMBER_RADIUS, EMBER_TYPE, GUTTER, ICON, SPACE, TYPE } from '../../lib/theme'

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
 * The content grid is inset to the screen gutter and stacks with the scale's
 * between-sections gap (`docs/DESIGN_SYSTEM.md`).
 */
export const SCENE_PADDING_HORIZONTAL = GUTTER
export const SCENE_SECTION_GAP = SPACE.xxl
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
 * `SCENE_CTA_INSET` is the same 24 gutter as the content grid.
 *
 * ## 56, not the frame's 74 — a deliberate deviation
 *
 * The frame's pill is 74 because it holds a **40pt** icon (`1227:2912`), and a
 * 40pt icon beside a 28pt line of text sets the height on its own. Docked, that
 * 74 sits on top of a 24pt dock gutter and an ~88pt tab bar: **186pt of
 * permanent chrome**, better than a fifth of a 874pt screen, on a page whose
 * whole job is to show you an event.
 *
 * The frame measured the CTA floating over a scroll, where it was the only
 * thing at the bottom. It is not — the tab bar is under it. So the icon drops
 * to 24, which is the size at which it stops driving the height and the label
 * does, and the pill lands at `CONTROL.lg`, 56.
 *
 * Recorded in `docs/SCENE.md` so the
 * frame and the build disagreeing here is a decision and not drift.
 */
export const SCENE_CTA_HEIGHT = 56
export const SCENE_CTA_INSET = 24

/** The CTA's icon. Sized here, not at the call site, because it sets the pill's height. */
export const SCENE_CTA_ICON = 24

/** A gallery tile. Square, and sized so a second one is partly visible. */
export const GALLERY_TILE = 160

/** "The Experience", "Attendees", "Gallery". `TYPE.heading`. */
export function SceneHeading({ children }: { children: string }) {
  return <Text style={styles.heading}>{children}</Text>
}

/**
 * The prose under a heading. `TYPE.body` on `textSecondary`.
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
 * The map inside the Location card — a `MapView` with every gesture off.
 *
 * ## Why the SDK, and why it is still not interactive
 *
 * This was a Google Static Maps image, which is billed per request and needs a
 * key that ships in the bundle and cannot be restricted to this app: the Static
 * Maps web service is a plain HTTPS GET and carries no app identity for Google
 * to check. Mobile SDK map loads are free and their keys *are* restricted to a
 * bundle identifier or a package plus signing certificate, so the same picture
 * costs nothing and the key is bound to this app.
 *
 * The original objection stands and is honoured: "an interactive map inside a
 * scrolling card is a gesture fight nobody asked for". Every gesture is
 * disabled, so this is a static picture that happens to be drawn by the SDK —
 * the tap still belongs to the card and still opens external maps. Panning
 * belongs in Hotspots' "Explore the Grid", where it is the point, and the SDK
 * being here is what makes that a component change rather than a project one.
 *
 * ## Absent is still a supported state
 *
 * No coordinate means a plain surface, exactly as before — a broken map inside
 * a card makes the card look broken, and the frame's map is decorative enough
 * that its absence costs nothing. That is also the no-key state: without a key
 * the SDK draws an empty grid rather than throwing, and `liteMode` on Android
 * keeps even that cheap.
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
  /*
   * 0,0 is in the Gulf of Guinea and is what an unset coordinate looks like in
   * this schema, so it is treated as absent rather than drawn — carried over
   * from `staticMapUrl`, which made the same check.
   */
  const hasCoords = !!latitude && !!longitude

  const body = hasCoords ? (
    <MapView
      style={StyleSheet.absoluteFill}
      customMapStyle={DARK_MAP_STYLE}
      initialRegion={{
        latitude,
        longitude,
        latitudeDelta: LOCATION_CARD_DELTA,
        longitudeDelta: LOCATION_CARD_DELTA,
      }}
      /*
       * Every gesture off. This is a picture, not a map you steer — the tap
       * belongs to the card, which opens external maps.
       */
      scrollEnabled={false}
      zoomEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
      toolbarEnabled={false}
      /*
       * Android's lite mode renders a single bitmap instead of a live map
       * surface. Cheaper, and correct here for the same reason the gestures are
       * off: nothing about this slot needs a live map.
       */
      liteMode
      pointerEvents="none"
    >
      <Marker
        coordinate={{ latitude, longitude }}
        /*
         * The accent's flat end, as the static version used. The frame draws a
         * 48pt gradient circle with a white glyph, which neither the static API
         * nor a default marker can render; a flat accent pin reads as ours
         * rather than as Google's default red, without shipping an icon.
         */
        pinColor={EMBER.gradientFrom}
      />
    </MapView>
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
        style={styles.galleryScroll}
        contentContainerStyle={styles.galleryRail}
        // Lands on a tile rather than between two, without paging the whole
        // width — the rail deliberately shows part of the next one as an
        // affordance that there is a next one.
        snapToInterval={GALLERY_TILE + SPACE.md}
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
            <ScalePress
              key={`${item.url}-${i}`}
              haptic={false}
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
                  <MaterialIcons name="play-arrow" size={ICON.md} color={EMBER.textPrimary} />
                </View>
              ) : null}
            </ScalePress>
          )
        })}
      </ScrollView>
    </View>
  )
}

/**
 * An amenity tile. Frame `1141:4918`: 2-up, 16pt gap, 32pt radius, 24pt pad.
 *
 * **The vocabulary now exists**, so the screen draws these. This used to say
 * "nothing populates these yet" and set the condition for drawing them: "not
 * until there is something true to put in it". `amenities` is a curated table
 * with `name`, `subtitle`, `icon` and `sort_order`, joined per event and
 * serialised on the detail payload — so the condition is met and the comment
 * that recorded it would otherwise have outlived the thing it described.
 *
 * `house_rules` is still free text and still a different thing.
 */
/**
 * The frame's two tile tints, in its order.
 *
 * `1141:4919` is `#F79EFF` and `1141:4925` is `#FF6D8D` — the violet and rose
 * stops, deliberately not the orange end, so a pair of tiles reads as two
 * things rather than one element repeated.
 *
 * Alternated by index rather than mapped per amenity: the vocabulary is
 * curated and open-ended, and a per-slug colour map would leave every amenity
 * added later with no colour, or send somebody to the client to add one.
 *
 * The rose is `EMBER.gradientTo` exactly. The violet has no token — it is the
 * one literal here, and it stays a literal rather than being swapped for
 * `gradientFrom`, which is the orange the frame specifically avoids.
 */
export const AMENITY_TINTS = ['#F79EFF', EMBER.gradientTo] as const

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
export type SceneCTAState = 'rsvp' | 'rsvpd' | 'join' | 'going' | 'ended' | 'rate'

/**
 * What the button says, per state.
 *
 * **Capacity is deliberately absent.** `blendn-admin/docs/CHECKIN.md:39` — "Check-in does not
 * refuse at capacity" — so a full event still takes people. `max_capacity` is a
 * number the organiser watches, not a door the app keeps, and the hero pill
 * already reports it as information. A CTA that disabled itself on a full event
 * would block an interaction the product explicitly allows.
 *
 * `ended` disables, because for somebody who was not there tapping cannot do
 * anything at all.
 *
 * **`rate` is the exception, and it is why that sentence needed qualifying.**
 * If you attended, the night leaves one thing to do afterwards — rate the
 * people you met — so `ended` was a dead control for exactly the people with a
 * reason to come back to this screen. `PLACEHOLDER_SCREENS.md` asks for "an
 * entry point after an event ends" and this is it: the same slot, the same
 * rule that its subject changes with the clock.
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
  rate: 'Rate the people you met',
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
const CTA_QUIET: readonly SceneCTAState[] = ['rsvpd', 'going', 'ended']

/*
 * The CTA's motion: a press scale, and a label that rises into place when the
 * state changes. Nothing else.
 *
 * - The new label rises 6pt and fades in; the old one simply goes. Two labels
 *   crossfading in a content-width pill would each push the other's layout.
 * - The pill's width and colour snap. A `LinearTransition` on the width
 *   stuttered on device (layout transitions under Reanimated 3 on the New
 *   Architecture flicker), and a 1.04 "pop" on saying yes read as decoration —
 *   the label and the fill changing are the confirmation.
 *
 * Reduce Motion keeps the label fade, which is what says the state changed,
 * and drops the rise.
 */
const CTA_EASE_OUT = Easing.bezier(...MOTION_EASING.entrance)

const ctaLabelIn = () => {
  'worklet'
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 6 }] },
    animations: {
      opacity: withTiming(1, { duration: MOTION_DURATION.normal, easing: CTA_EASE_OUT }),
      transform: [{ translateY: withTiming(0, { duration: MOTION_DURATION.normal, easing: CTA_EASE_OUT }) }],
    },
  }
}
const ctaLabelFade = FadeIn.duration(MOTION_DURATION.fast).reduceMotion(ReduceMotion.Never)

export function SceneCTA({
  state = 'join',
  icon,
  onPress,
}: {
  state?: SceneCTAState
  /** Drawn in the colour the pill hands it — dark on the accent fill, accent on the quiet one. */
  icon?: (color: string) => React.ReactNode
  onPress?: () => void
}) {
  const disabled = state === 'ended'
  /*
   * Quiet once you have already said yes. The accent is for the thing that
   * still needs doing; a fully lit pill that only un-does something reads as
   * the primary action of the screen.
   */
  const quiet = CTA_QUIET.includes(state)
  const reduceMotion = useReducedMotion()
  /*
   * The label was a free string, which was survivable while this sat at the
   * bottom of a 1900pt page and most people never reached it. Pinned to the
   * screen for the whole visit it is the most-looked-at control here, and it
   * said "Join the Experience" whether or not you already had — the classic
   * "did that work?" failure, permanently in view.
   */
  return (
    /*
     * Scales on press-in, before the request goes out: that is the latency the
     * finger actually feels. No haptic here — every handler behind this button
     * already fires its own `feedback.*`, and two per tap is a buzz.
     */
    <ScalePress
      haptic={false}
      onPress={disabled ? undefined : onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: state === 'going' }}
      accessibilityLabel={CTA_LABEL[state]}
      style={disabled ? styles.ctaDisabled : undefined}
    >
      {/*
        A solid pill, and nothing around it.

        It was frosted glass with a warm tint, a lit white edge and an orange
        bloom under it — every effect at once, and it read as generated rather
        than designed. The event apps that get this right (Luma, District) use
        a flat, high-contrast pill with no shadow, no blur and no gradient:
        contrast alone lifts it off the page. So the to-do states are the
        accent, solid, with the dark on-accent text; the done states step back
        to a dark surface with a hairline edge, and the accent moves into the
        icon.
      */}
      <View style={[styles.ctaFill, quiet ? styles.ctaFillQuiet : styles.ctaFillLoud]}>
        {icon?.(quiet ? EMBER.accent : EMBER.onGradient)}
        {/* Skips the entrance on first paint; only a *change* of label animates. */}
        <LayoutAnimationConfig skipEntering>
          <Animated.Text
            key={state}
            entering={reduceMotion ? ctaLabelFade : ctaLabelIn}
            style={[styles.ctaLabel, quiet ? styles.ctaLabelQuiet : styles.ctaLabelLoud]}
            numberOfLines={1}
          >
            {CTA_LABEL[state]}
          </Animated.Text>
        </LayoutAnimationConfig>
      </View>
    </ScalePress>
  )
}

/**
 * What the organiser wrote about the event, under one heading per kind.
 *
 * `event_details` has been collected by the dashboard, stored, and served on
 * this very payload since it existed — and drawn by nothing. Accessibility is
 * the field that makes this worth building rather than deleting: an organiser
 * writes "step-free entrance" and the person deciding whether they can come
 * could not see it.
 *
 * The blocks arrive already ordered and already cleaned by
 * `lib/eventDetails.ts`; this draws them and makes no decisions, so a JSON
 * column holding something unexpected is that module's problem and never
 * reaches a `<Text>`.
 *
 * Questions are expandable, and nothing else is. A FAQ is a list you scan for
 * the one that is yours, so collapsing it is the difference between a section
 * and a wall; house rules are three lines you should not have to ask for.
 */
export function SceneDetails({ blocks }: { blocks: readonly DetailBlock[] }) {
  const [open, setOpen] = useState<string | null>(null)
  if (!blocks.length) return null

  return (
    <View style={styles.detailGroup}>
      {blocks.map((block) => (
        <View key={block.key} style={styles.detailBlock}>
          <SceneHeading>{block.title}</SceneHeading>

          {block.kind === 'prose' ? <SceneBody>{block.body}</SceneBody> : null}

          {block.kind === 'pairs' ? (
            <View style={styles.detailPairs}>
              {block.pairs.map((p) => (
                <View key={p.label} style={styles.detailPair}>
                  <Text style={styles.detailPairLabel}>{p.label}</Text>
                  <Text style={styles.detailPairValue}>{p.value}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {block.kind === 'faq'
            ? block.items.map((item) => {
                const id = `${block.key}:${item.question}`
                const isOpen = open === id
                return (
                  <Pressable
                    key={id}
                    onPress={() => setOpen(isOpen ? null : id)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isOpen }}
                    accessibilityLabel={item.question}
                    style={styles.detailQuestion}
                  >
                    <View style={styles.detailQuestionRow}>
                      <Text style={styles.detailQuestionText}>{item.question}</Text>
                      <MaterialIcons
                        name={isOpen ? 'expand-less' : 'expand-more'}
                        size={ICON.md}
                        color={EMBER.textSecondary}
                      />
                    </View>
                    {isOpen ? <Text style={styles.detailAnswer}>{item.answer}</Text> : null}
                  </Pressable>
                )
              })
            : null}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  heading: { ...TYPE.heading },
  body: { ...TYPE.body, color: EMBER.textSecondary },
  bodyAccent: { color: EMBER.accent },

  detailGroup: { gap: SPACE.xxl },
  detailBlock: { gap: SPACE.lg },
  detailPairs: { gap: SPACE.md },
  detailPair: { gap: SPACE.xxs },
  detailPairLabel: { ...TYPE.bodyStrong },
  detailPairValue: { ...TYPE.body, color: EMBER.textSecondary },
  /*
   * `CONTROL.md` minimum: this is the one control in the section, and a question
   * people are trying to tap is the wrong place to be stingy with the target.
   */
  detailQuestion: { minHeight: CONTROL.md, justifyContent: 'center', gap: SPACE.sm },
  detailQuestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
  },
  detailQuestionText: { ...TYPE.bodyStrong, flex: 1 },
  detailAnswer: { ...TYPE.body, color: EMBER.textSecondary, paddingBottom: SPACE.xs },

  attendees: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  /*
   * The heading's role, so the pair reads as one row. Secondary rather than the
   * accent: the CTA is this screen's one accent.
   */
  attendeeCount: { ...TYPE.heading, color: EMBER.textSecondary },

  attendeesSection: { gap: SPACE.lg },
  /* Frame `1141:4890`: 56pt discs, 4pt page-coloured ring, overlapping 16. */
  stack: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: EMBER_RADIUS.pill,
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
    // design-exception: emoji glyph sized to fill the 48pt inner disc
    fontSize: 26,
    lineHeight: 32,
    textAlign: 'center',
  },
  avatarMore: { backgroundColor: EMBER.surfaceSunken },
  avatarMoreText: { ...TYPE.bodyStrong },

  card: {
    backgroundColor: EMBER.surfaceMedia,
    borderWidth: 1,
    borderColor: 'rgba(73,71,71,0.1)',
    borderRadius: EMBER_RADIUS.card,
    overflow: 'hidden',
  },
  /*
   * Card padding (24) on three sides, `gap-[8px]`.
   *
   * The bottom is **56** (`1141:4901`). It is the gap between the address line
   * and the map band below it, and at 32 the two crowded — the card read as
   * text sitting on a photograph rather than as a caption above a map.
   */
  // design-exception: 56 gap to the map band, pinned by sceneCta.test.ts (1141:4901)
  cardBody: { paddingTop: SPACE.xl, paddingHorizontal: SPACE.xl, paddingBottom: 56, gap: SPACE.sm },
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
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  address: { ...TYPE.body, color: EMBER.textSecondary, flexShrink: 1 },
  map: { height: MAP_HEIGHT, backgroundColor: EMBER.surfaceSunken },

  gallerySection: { gap: SPACE.lg },
  // Bleeds past the page gutter so the rail runs to the edge, which is what
  // says "this scrolls" without needing a chevron. The first tile still starts
  // on the gutter.
  galleryScroll: { marginHorizontal: -SCENE_PADDING_HORIZONTAL },
  galleryRail: { gap: SPACE.md, paddingHorizontal: SCENE_PADDING_HORIZONTAL },
  galleryTile: {
    width: GALLERY_TILE,
    height: GALLERY_TILE,
    borderRadius: EMBER_RADIUS.lg,
    backgroundColor: EMBER.surfaceSunken,
  },
  playBadge: {
    position: 'absolute',
    left: SPACE.md,
    bottom: SPACE.md,
    width: CONTROL.sm,
    height: CONTROL.sm,
    borderRadius: EMBER_RADIUS.pill,
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
    borderRadius: EMBER_RADIUS.card,
    padding: SPACE.xl,
  },
  amenityTitle: { ...TYPE.bodyStrong, paddingTop: SPACE.md },
  amenitySubtitle: { ...TYPE.meta },

  ctaFill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.md,
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
    // 15, with a 24pt icon and a 24pt line: 1 + 15 + 24 + 15 + 1 = 56, which is
    // SCENE_CTA_HEIGHT. Change either and the dock's reserved band is wrong.
    // design-exception: 15 lands the bordered pill on CONTROL.lg (56)
    paddingVertical: 15,
    borderRadius: EMBER_RADIUS.pill,
    // Present in both states so the height never changes between them.
    borderWidth: 1,
  },
  ctaFillLoud: {
    backgroundColor: EMBER.accent,
    borderColor: EMBER.accent,
  },
  ctaFillQuiet: {
    backgroundColor: EMBER.surfaceSunken,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  ctaDisabled: { opacity: 0.45 },
  ctaLabel: {
    ...TYPE.button,
    // TYPE.button's own line, restated because SCENE_CTA_HEIGHT is summed from it.
    lineHeight: 24,
  },
  ctaLabelLoud: { color: EMBER.onGradient },
  ctaLabelQuiet: { color: EMBER.textPrimary },
})
