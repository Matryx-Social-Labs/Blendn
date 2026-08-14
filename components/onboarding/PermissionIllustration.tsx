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

const NOTIFICATION_ART = require('../../assets/onboarding/notifications.png')
const LOCATION_ART = require('../../assets/onboarding/location-map.png')

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
      <Image source={LOCATION_ART} style={styles.art} resizeMode="cover" />

      {/* The pulse rings, centred on the pin. */}
      <View style={styles.ring} />
      <View style={[styles.ring, styles.ringOuter]} />

      <View style={styles.pin}>
        <Ionicons name="person" size={22} color={EMBER.onGradientChip} />
      </View>
      <View style={styles.pinTag}>
        <Text style={styles.pinTagText}>YOU</Text>
      </View>

      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.8)']}
        style={styles.mapFooter}
        pointerEvents="none"
      />
      <View style={styles.mapFooterText}>
        <View style={styles.zoneRow}>
          <Ionicons name="location" size={12} color={EMBER.accent} />
          <Text style={styles.zone}>PEOPLE NEARBY</Text>
        </View>
        <View style={styles.divider} />
        <Text style={styles.zoneSub}>Real-time local presence</Text>
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

  ring: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: EMBER_RADIUS.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,144,109,0.25)',
  },
  ringOuter: { width: 250, height: 250, borderColor: 'rgba(255,144,109,0.12)' },
  pin: {
    width: 60,
    height: 60,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: EMBER.bg,
  },
  pinTag: {
    position: 'absolute',
    // Half the pin's height plus a little, so it hangs just below the circle.
    marginTop: 66,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.accent,
  },
  pinTagText: { ...EMBER_TYPE.helper, fontSize: 10, color: EMBER.onGradientChip },

  mapFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 110 },
  mapFooterText: { position: 'absolute', left: 20, right: 20, bottom: 20, gap: 8 },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  zone: { ...EMBER_TYPE.helper, fontSize: 11, letterSpacing: 1.2, color: EMBER.textPrimary },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  zoneSub: { ...EMBER_TYPE.helper, fontSize: 11 },
})
