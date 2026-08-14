import React from 'react'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { APP_COLORS, APP_RADIUS } from '../lib/theme'

interface OnboardingProgressBarProps {
  currentStep: number
  totalSteps: number
  style?: StyleProp<ViewStyle>
}

export default function OnboardingProgressBar({ currentStep, totalSteps, style }: OnboardingProgressBarProps) {
  return (
    <View style={[styles.container, style]}>
      {Array.from({ length: totalSteps }).map((_, i) => (
        <View
          key={i}
          style={[styles.segment, i < totalSteps - 1 && styles.segmentGap]}
        >
          {i < currentStep ? (
            <LinearGradient
              colors={APP_COLORS.accentGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fill}
            />
          ) : null}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  segment: {
    flex: 1,
    height: 6,
    borderRadius: APP_RADIUS.pill,
    backgroundColor: APP_COLORS.backgroundCard,
    overflow: 'hidden',
  },
  fill: {
    flex: 1,
    borderRadius: APP_RADIUS.pill,
  },
  segmentGap: {
    marginRight: 4,
  },
})
