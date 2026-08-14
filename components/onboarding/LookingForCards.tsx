import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native'

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

/*
 * The card size, computed rather than declared as a percentage.
 *
 * These were `width: '48%'` with `aspectRatio: 1`, and they rendered as five
 * thin lines. Every child of a card is absolutely positioned — the image, the
 * scrim, the label — so the card has no in-flow content to derive a height
 * from, and `aspectRatio` against a percentage width did not supply one. The
 * result collapsed to the border and nothing else.
 *
 * Real numbers have no such failure mode: 24pt of screen padding each side, a
 * 16pt gap, split in two. It is also what `app/(tabs)/events.tsx` already does
 * for its carousel, for the same reason.
 */
const SCREEN_PADDING = 24
const GRID_GAP = 16
const CARD = Math.floor((Dimensions.get('window').width - SCREEN_PADDING * 2 - GRID_GAP) / 2)

export const LOOKING_FOR_OPTIONS = [
  { value: 'Dating', icon: 'heart' as const, art: require('../../assets/onboarding/looking-dating.jpg') },
  { value: 'Friendship', icon: 'people' as const, art: require('../../assets/onboarding/looking-friendship.jpg') },
  { value: 'Networking', icon: 'briefcase' as const, art: require('../../assets/onboarding/looking-networking.jpg') },
  { value: 'Travel', icon: 'compass' as const, art: require('../../assets/onboarding/looking-travel.jpg') },
  { value: 'Open', icon: 'infinite' as const, art: require('../../assets/onboarding/looking-open.jpg') },
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
            <Image source={option.art} style={styles.art} contentFit="cover" transition={180} cachePolicy="memory-disk" />
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  card: {
    width: CARD,
    height: CARD,
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
