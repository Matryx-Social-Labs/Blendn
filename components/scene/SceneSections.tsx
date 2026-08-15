import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'

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
 * So this draws the number, larger than the frame's, because the count *is* the
 * social proof the stack was reaching for and it is the part that is real.
 * Restoring the stack needs the friend graph (deferred), where "people you have
 * matched with" is a set the viewer is already entitled to see.
 */
export function SceneAttendees({ count }: { count: number }) {
  return (
    <View style={styles.attendees}>
      <SceneHeading>Attendees</SceneHeading>
      <Text style={styles.attendeeCount}>{count > 0 ? `${count}+` : '—'}</Text>
    </View>
  )
}

/**
 * The venue card. Frame `1141:4900`: #141313, 32pt radius, hairline border.
 *
 * `map` is a slot rather than a component because `react-native-maps` is not
 * installed — the same dependency Hotspots' "Explore the Grid" needs, and both
 * should arrive in one dev-client build so testers install once. Until then a
 * caller passes a static map image, or nothing.
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
          <Ionicons name="location-outline" size={16} color={EMBER.textSecondary} />
          <Text style={styles.address} numberOfLines={2}>
            {area}
          </Text>
        </View>
      </View>
      {map ? <View style={styles.map}>{map}</View> : null}
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
  style,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  title: string
  subtitle: string
  style?: StyleProp<ViewStyle>
}) {
  return (
    <View style={[styles.amenity, style]}>
      <Ionicons name={icon} size={20} color={EMBER.accent} />
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
export function SceneCTA({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <LinearGradient
      colors={['#FF906D', '#FF6D8D', '#F288FF']}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={styles.ctaBorder}
    >
      <View style={styles.ctaFill}>
        {icon}
        <Text style={styles.ctaLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </LinearGradient>
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
    // Larger than the frame's 16: with the avatar stack gone this is the whole
    // of the social proof, and at 16 it read as a footnote to a missing thing.
    fontSize: 28,
    lineHeight: 32,
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
  map: { height: 256, backgroundColor: EMBER.surfaceSunken },

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
  ctaLabel: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 18,
    lineHeight: 28,
    letterSpacing: -0.45,
    color: EMBER.textPrimary,
  },
})
