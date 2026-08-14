import { Ionicons } from '@expo/vector-icons'
import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import OnboardingProgressBar from './OnboardingProgressBar'
import { APP_COLORS, APP_FONTS, APP_SPACING } from '../lib/theme'

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 }

interface OnboardingHeaderProps {
  currentStep: number
  totalSteps: number
  onBack?: () => void
  onSkip?: () => void
}

// Shared back-chevron + progress bar + optional skip link row, used across every
// app/onboarding/*.tsx screen for a consistent header (matches the OnboardingProgressBar
// styling that was already redesigned before the screens consuming it were).
export default function OnboardingHeader({ currentStep, totalSteps, onBack, onSkip }: OnboardingHeaderProps) {
  return (
    <View style={styles.row}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={22} color={APP_COLORS.textPrimary} />
        </TouchableOpacity>
      ) : (
        <View style={styles.spacer} />
      )}
      <View style={styles.progressWrap}>
        <OnboardingProgressBar currentStep={currentStep} totalSteps={totalSteps} style={styles.progressBar} />
      </View>
      {onSkip ? (
        <TouchableOpacity onPress={onSkip} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="Skip this step">
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.spacer} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: APP_SPACING.xl,
    paddingTop: APP_SPACING.md,
    paddingBottom: APP_SPACING.lg,
    gap: APP_SPACING.md,
  },
  spacer: {
    width: 22,
  },
  progressWrap: {
    flex: 1,
  },
  progressBar: {
    paddingHorizontal: 0,
    marginBottom: 0,
  },
  skipText: {
    fontFamily: APP_FONTS.bodyBold,
    fontSize: 14,
    fontWeight: '700',
    color: APP_COLORS.accent,
  },
})
