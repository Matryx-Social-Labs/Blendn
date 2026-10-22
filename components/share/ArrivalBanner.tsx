import { Image } from 'expo-image'
import { useEffect } from 'react'
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { useReducedMotion } from 'react-native-reanimated'

import { Icon } from '../ui/Icon'
import { COLOR, ICON, RADIUS, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { Button } from '../ds/Button'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, minTarget, useBoldText, useIncreaseContrast } from '../ds/shared'
import { bannerFadeIn, bannerIn, bannerOut } from '../motion/presence'

/** The cover's side: the frame's 48. */
const COVER = 48

/**
 * "You were sent Neon Nights" (guidelines/flow-16 `arrival`, Flow 16 · 16.7): the one-time banner on the Pulse for a
 * person who arrived from a shared link. A solid card, not glass: a cover thumbnail, two single lines, a lit "Open"
 * pill in the Pulse's ember, and a quiet ×.
 *
 * Slides 16 pt and fades in over `base` once (#44's banner entrance, a fade alone under Reduce Motion), leaves in a
 * quick fade. Announced once, politely, as it lands. `H.primary` on Open's press-in; × is silent and ends it for good.
 * The name is the event's or the venue's and nobody's: the sender is not in the link and not on this card.
 */
export function ArrivalBanner({
  title,
  meta,
  cover,
  onOpen,
  onDismiss,
  testID,
}: {
  /** The event's or the venue's name. */
  title: string
  /** "Sat 4 Oct, 9 PM · Toit". */
  meta: string
  cover?: string | null
  onOpen: () => void
  onDismiss: () => void
  testID?: string
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const reduceMotion = useReducedMotion()
  const said = `You were sent ${title}`

  useEffect(() => {
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(said)
  }, [said])

  return (
    <Animated.View
      testID={testID}
      entering={reduceMotion ? bannerFadeIn : bannerIn}
      exiting={bannerOut}
      accessibilityLiveRegion="polite"
      style={[styles.card, contrast && IC_HAIRLINE]}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.cover}>
        {cover ? <Image testID={testID && `${testID}-cover`} source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} /> : <Icon name="map-pin" size={ICON.control} color={COLOR.textSecondary} />}
      </View>
      <View style={styles.text}>
        <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('bodyStrong', bold), styles.ink]}>
          {said}
        </Text>
        {meta ? (
          <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold), { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>
            {meta}
          </Text>
        ) : null}
      </View>
      <Button
        kind="lit"
        size="sm"
        label="Open"
        accessibilityLabel={`Open ${title}`}
        pressHaptic={H.primary}
        onPress={onOpen}
        style={styles.control}
        testID={testID && `${testID}-open`}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        hitSlop={(minTarget() - ICON.inline) / 2}
        onPress={onDismiss}
        style={styles.control}
        testID={testID && `${testID}-dismiss`}
      >
        <Icon name="x" size={ICON.inline} color={COLOR.textTertiary} />
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.rowInCard,
    backgroundColor: COLOR.surface,
  },
  cover: { width: COVER, height: COVER, borderRadius: RADIUS.thumb, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: COLOR.surfaceRaised },
  text: { flex: 1, flexShrink: 1 },
  control: { alignSelf: 'center' },
  ink: { color: COLOR.textPrimary },
})
