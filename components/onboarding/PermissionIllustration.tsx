import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { Image, StyleSheet, Text, View } from 'react-native'

import { EMBER, EMBER_GRADIENT, EMBER_RADIUS, EMBER_TYPE } from '../../lib/theme'

/**
 * The picture in the middle of a permission screen.
 *
 * These two screens were shipped with an empty middle and a note saying the
 * illustrations had never been exported. They had — the frames carry real
 * exported assets, and the empty space was me not looking hard enough.
 *
 * Both images are **committed to the repo**, not linked. Figma's asset URLs
 * expire after about seven days, so a build referencing one is a build whose
 * artwork disappears a week later.
 *
 * What is *not* an image is the card floating over each one: the notification
 * bubble and the location footer are real views, drawn with the same tokens as
 * the rest of the app. That is deliberate — they are a preview of something the
 * product actually does, and a screenshot of a notification would go stale the
 * first time the notification copy changed.
 */

const NOTIFICATION_ART = require('../../assets/onboarding/notifications.jpg')
const LOCATION_ART = require('../../assets/onboarding/location-map.jpg')

/**
 * The people on the map, exactly as the frame places them.
 *
 * Positions are the frame's own percentages, measured inside a box inset 32px
 * from the card — which is why they are expressed as percentages of that inner
 * box rather than of the card.
 *
 * I left these out on the first pass and changed the footer copy at the same
 * time, on the reasoning that stock portraits of strangers sit oddly on the
 * screen asking to find real people nearby. That was a judgement to raise, not
 * to act on unilaterally, and it was overruled: the frame is the spec.
 */
const NEARBY = [
  { art: require('../../assets/onboarding/nearby-1.jpg'), size: 48, left: '15%', top: '20%' },
  { art: require('../../assets/onboarding/nearby-2.jpg'), size: 48, left: '62%', top: '53%' },
  { art: require('../../assets/onboarding/nearby-3.jpg'), size: 40, left: '10%', top: '60%' },
] as const

const YOU_ART = require('../../assets/onboarding/you.jpg')

/** The moon, with a sample notification laid over it. */
export function NotificationIllustration() {
  return (
    <View style={styles.card}>
      <Image source={NOTIFICATION_ART} style={styles.art} resizeMode="cover" />
      {/* Bottom-to-top scrim so the card reads against a bright patch of art. */}
      <LinearGradient
        colors={['rgba(15,14,14,0)', 'rgba(15,14,14,0.75)']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.bubble}>
        <LinearGradient
          colors={[...EMBER_GRADIENT.colors]}
          start={EMBER_GRADIENT.start}
          end={EMBER_GRADIENT.end}
          style={styles.bubbleIcon}
        >
          <Ionicons name="flash" size={18} color={EMBER.onGradientChip} />
        </LinearGradient>

        <View style={styles.bubbleText}>
          <View style={styles.bubbleTop}>
            <Text style={styles.bubbleTitle}>New Spark Nearby</Text>
            <Text style={styles.bubbleWhen}>Just now</Text>
          </View>
          <Text style={styles.bubbleBody}>Someone active is ready to connect!</Text>
        </View>
      </View>
    </View>
  )
}

/**
 * The map, with the zone footer over it.
 *
 * The frame also floats four stock portraits on the map as nearby people. They
 * are left out: they are photographs of strangers used as decoration, on the
 * one screen that is asking permission to find real people nearby, and the
 * concentric rings carry the same idea without implying these are anybody.
 */
export function LocationIllustration() {
  return (
    <View style={styles.card}>
      {/*
        The map sits at 40% opacity in the frame, which is what stops it
        competing with the pins on top of it.
      */}
      <Image source={LOCATION_ART} style={[styles.art, styles.mapDim]} resizeMode="cover" />

      {/* Everything below is positioned inside a box inset 32px from the card,
          because that is the frame the design measures its pins against. */}
      <View style={styles.pinField}>
        <View style={styles.ring} />
        <View style={[styles.ring, styles.ringOuter]} />

        {NEARBY.map((person, i) => (
          <View
            key={i}
            style={[
              styles.nearby,
              { left: person.left, top: person.top, width: person.size, height: person.size },
            ]}
          >
            <Image source={person.art} style={styles.nearbyPhoto} resizeMode="cover" />
          </View>
        ))}

        <View style={styles.youWrap}>
          <View style={styles.you}>
            <Image source={YOU_ART} style={styles.youPhoto} resizeMode="cover" />
          </View>
          <View style={styles.youTag}>
            <Text style={styles.youTagText}>YOU</Text>
          </View>
        </View>
      </View>

      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.8)']}
        style={styles.mapFooter}
        pointerEvents="none"
      />
      <View style={styles.mapFooterText}>
        <View style={styles.zoneRow}>
          <Ionicons name="location" size={12} color={EMBER.accent} />
          <Text style={styles.zone}>CURRENT ZONE: OLD GOA</Text>
        </View>
        <View style={styles.divider} />
        <Text style={styles.zoneSub}>Real-time local presence active</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: EMBER_RADIUS.card,
    overflow: 'hidden',
    backgroundColor: EMBER.surfaceMedia,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  art: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },

  bubble: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: 'rgba(45,44,44,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  bubbleIcon: {
    width: 44,
    height: 44,
    borderRadius: EMBER_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleText: { flex: 1, gap: 2 },
  bubbleTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bubbleTitle: { ...EMBER_TYPE.helper, fontSize: 14, color: EMBER.textPrimary },
  bubbleWhen: { ...EMBER_TYPE.helper, fontSize: 10 },
  bubbleBody: EMBER_TYPE.helper,

  mapDim: { opacity: 0.4 },
  // 32px in from every edge — the frame measures its pin positions against
  // this box, not against the card.
  pinField: { position: 'absolute', top: 32, left: 32, right: 32, bottom: 32 },

  nearby: {
    position: 'absolute',
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: 'rgba(45,44,44,0.8)',
    padding: 2,
    overflow: 'hidden',
  },
  nearbyPhoto: { width: '100%', height: '100%', borderRadius: EMBER_RADIUS.pill },

  // The frame centres this pair at 38.41% / 41.15% of the pin field.
  youWrap: { position: 'absolute', left: '38%', top: '41%', alignItems: 'center' },
  you: {
    width: 64,
    height: 64,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.accent,
    padding: 4,
  },
  youPhoto: {
    width: '100%',
    height: '100%',
    borderRadius: EMBER_RADIUS.pill,
    borderWidth: 2,
    borderColor: EMBER.bg,
  },
  youTag: {
    marginTop: -8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.accent,
  },
  youTagText: {
    ...EMBER_TYPE.helper,
    fontSize: 10,
    letterSpacing: -0.5,
    color: EMBER.onGradientChip,
  },

  ring: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    marginTop: -96,
    width: 192,
    height: 192,
    borderRadius: EMBER_RADIUS.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,144,109,0.2)',
    opacity: 0.5,
  },
  ringOuter: {
    width: 288,
    height: 288,
    marginTop: -144,
    borderColor: 'rgba(255,144,109,0.1)',
    opacity: 0.3,
  },

  mapFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 110 },
  mapFooterText: { position: 'absolute', left: 20, right: 20, bottom: 20, gap: 8 },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  zone: { ...EMBER_TYPE.helper, fontSize: 11, letterSpacing: 1.2, color: EMBER.textPrimary },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  zoneSub: { ...EMBER_TYPE.helper, fontSize: 11 },
})
