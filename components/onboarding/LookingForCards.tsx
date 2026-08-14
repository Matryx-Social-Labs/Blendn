import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'

import { EMBER, EMBER_RADIUS } from '../../lib/theme'

/**
 * "What brings you to Blend'n today?" — five picture cards, two across.
 *
 * The frame draws these as image tiles rather than chips, and the difference is
 * doing work: five words in a row of pills is a form, five pictures is a
 * question about how you want to spend an evening. Worth the five assets.
 *
 * Images are committed rather than linked — Figma's URLs expire in about a
 * week, so a build referencing one loses its artwork seven days later.
 *
 * The icons are Ionicons rather than the frame's exported SVGs. They are five
 * generic glyphs (heart, people, briefcase, compass, infinity) already in the
 * bundle, and shipping five more files to draw the same shapes is weight for
 * nothing. If the designer wants their exact set, that is a swap of five
 * imports.
 */

export const LOOKING_FOR_OPTIONS = [
  { value: 'Dating', icon: 'heart' as const, art: require('../../assets/onboarding/looking-dating.png') },
  { value: 'Friendship', icon: 'people' as const, art: require('../../assets/onboarding/looking-friendship.png') },
  { value: 'Networking', icon: 'briefcase' as const, art: require('../../assets/onboarding/looking-networking.png') },
  { value: 'Travel', icon: 'compass' as const, art: require('../../assets/onboarding/looking-travel.png') },
  { value: 'Open', icon: 'infinite' as const, art: require('../../assets/onboarding/looking-open.png') },
]

export function LookingForCards({
  selected,
  onToggle,
}: {
  selected: readonly string[]
  onToggle: (value: string) => void
}) {
  return (
    <View style={styles.grid}>
      {LOOKING_FOR_OPTIONS.map((option) => {
        const isOn = selected.includes(option.value)
        return (
          <Pressable
            key={option.value}
            onPress={() => onToggle(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: isOn }}
            accessibilityLabel={option.value}
            style={[styles.card, isOn && styles.cardOn]}
          >
            {/*
              40% opacity, per the frame. At full strength the photographs
              fight the label and each other; dimmed they read as texture and
              the word stays the thing you scan.
            */}
            <Image source={option.art} style={styles.art} resizeMode="cover" />
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.95)']}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.label}>
              <Ionicons
                name={option.icon}
                size={20}
                color={isOn ? EMBER.accent : EMBER.textPrimary}
              />
              <Text style={styles.labelText}>{option.value}</Text>
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  card: {
    // Two across with a 16px gap. `48%` leaves the gap room without needing to
    // know the screen width.
    width: '48%',
    aspectRatio: 1,
    borderRadius: EMBER_RADIUS.card,
    overflow: 'hidden',
    backgroundColor: 'rgba(39,37,37,0.4)',
    // A transparent border at rest so selecting one does not resize it — a
    // 4px border appearing from nothing shifts every card in the row.
    borderWidth: 4,
    borderColor: 'transparent',
  },
  cardOn: { borderColor: EMBER.accent },
  art: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', opacity: 0.4 },
  label: { position: 'absolute', left: 16, right: 16, bottom: 16, gap: 8 },
  labelText: {
    fontSize: 18,
    lineHeight: 28,
    fontWeight: '700',
    color: EMBER.textPrimary,
  },
})
