import React from 'react'
import { StyleSheet, View } from 'react-native'
import { APP_COLORS } from '../lib/theme'

interface OnboardingProgressBarProps {
  currentStep: number
  totalSteps: number
}

export default function OnboardingProgressBar({ currentStep, totalSteps }: OnboardingProgressBarProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: totalSteps }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.segment,
            i < currentStep ? styles.filled : styles.empty,
            i < totalSteps - 1 && styles.segmentGap,
          ]}
        />
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
    height: 3,
    borderRadius: 2,
  },
  filled: {
    backgroundColor: APP_COLORS.accent,
  },
  empty: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  segmentGap: {
    marginRight: 4,
  },
})
