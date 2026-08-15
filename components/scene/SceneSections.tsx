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

import type { FeedMediaItem } from '../../lib/feedMedia'
import { avatarStack, pseudonymAvatar } from '../../lib/pseudonymAvatar'
import { staticMapUrl } from '../../lib/staticMap'
import { EMBER, EMBER_FONTS } from '../../lib/theme'

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
 */
export const SCENE_CTA_HEIGHT = 74
export const SCENE_CTA_INSET = 24

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
export function SceneAttendees({ count, seed }: { count: number; seed: string }) {
  const { shown, remainder } = avatarStack(count)
  return (
    <View style={styles.attendeesSection}>
      <View style={styles.attendees}>
        <SceneHeading>Attendees</SceneHeading>
        <Text style={styles.attendeeCount}>{count > 0 ? `${count}+` : '—'}</Text>
      </View>
      {shown > 0 ? (
        <View style={styles.stack}>
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
             */
            const { colors, initial } = pseudonymAvatar(`${seed}:${i}`)
            return (
              <LinearGradient
                key={i}
                colors={colors as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.avatar, i > 0 && styles.avatarOverlap]}
              >
                <Text style={styles.avatarInitial}>{initial}</Text>
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
  style,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name']
  title: string
  subtitle: string
  color?: string
  style?: StyleProp<ViewStyle>
}) {
  return (
    <View style={[styles.amenity, style]}>
      <MaterialIcons name={icon} size={20} color={color} />
      <Text style={styles.amenityTitle}>{title}</Text>
      <Text style={styles.amenitySubtitle}>{subtitle}</Text>
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
export type SceneCTAState = 'join' | 'going' | 'ended'

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
  join: 'Blend in',
  going: "You're in",
  ended: 'This event has ended',
}

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
      <LinearGradient
        colors={
          state === 'going'
            ? // Joined is a settled state, not an invitation. The gradient stops
              // shouting and the border reads as a confirmation.
              ['#FF906D', '#FF906D']
            : ['#FF906D', '#FF6D8D', '#F288FF']
        }
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.ctaBorder}
      >
        <View style={styles.ctaFill}>
          {icon}
          <Text style={styles.ctaLabel} numberOfLines={1}>
            {CTA_LABEL[state]}
          </Text>
        </View>
      </LinearGradient>
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
  avatarInitial: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 18,
    color: EMBER.onGradient,
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
  cardBody: { paddingTop: 32, paddingHorizontal: 32, paddingBottom: 32, gap: 8 },
  eyebrow: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 1.6,
    color: EMBER.textSecondary,
  },
  venue: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 16,
    lineHeight: 24,
    color: EMBER.textPrimary,
    paddingTop: 8,
  },
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

  amenity: {
    flex: 1,
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

  ctaBorder: {
    borderRadius: 9999,
    padding: 1,
    shadowColor: '#FF906D',
    shadowOpacity: 0.3,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
  },
  ctaFill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    borderRadius: 9999,
    backgroundColor: 'rgba(15,14,14,0.9)',
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
