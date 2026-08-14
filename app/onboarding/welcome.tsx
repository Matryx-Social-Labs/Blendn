import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import React from 'react'
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { APP_COLORS, APP_FONTS, APP_RADIUS, APP_SPACING } from '../../lib/theme'

const FEATURES = [
  { icon: 'sparkles-outline' as const, text: 'Find events near you' },
  { icon: 'people-outline' as const, text: 'Meet people with similar interests' },
  { icon: 'chatbubbles-outline' as const, text: 'Chat and make connections' },
]

export default function Welcome() {
  const handleContinue = () => {
    router.push('./basic-info' as any)
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.heroSection}>
          <Text style={styles.title}>Welcome to Blend&apos;n</Text>
          <Text style={styles.subtitle}>
            Connect with people at events you both love
          </Text>

          <View style={styles.featuresContainer}>
            {FEATURES.map((feature) => (
              <View key={feature.text} style={styles.feature}>
                <View style={styles.featureIconWrap}>
                  <Ionicons name={feature.icon} size={20} color={APP_COLORS.accent} />
                </View>
                <Text style={styles.featureText}>{feature.text}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.bottomSection}>
          <TouchableOpacity onPress={handleContinue} activeOpacity={0.9}>
            <LinearGradient
              colors={APP_COLORS.accentGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.continueButton}
            >
              <Text style={styles.continueButtonText}>Let&apos;s Get Started</Text>
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.privacyText}>
            We&apos;ll help you create an amazing profile in just a few steps
          </Text>
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: APP_COLORS.backgroundBase,
  },
  content: {
    flex: 1,
    paddingHorizontal: APP_SPACING.xl,
    justifyContent: 'space-between',
  },
  heroSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontFamily: APP_FONTS.headingExtraBold,
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: APP_SPACING.md,
    color: APP_COLORS.textPrimary,
  },
  subtitle: {
    fontFamily: APP_FONTS.body,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: APP_SPACING['3xl'],
    color: APP_COLORS.textSecondary,
    lineHeight: 24,
  },
  featuresContainer: {
    width: '100%',
    maxWidth: 300,
    gap: APP_SPACING.lg,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: APP_SPACING.md,
  },
  featureIconWrap: {
    width: 40,
    height: 40,
    borderRadius: APP_RADIUS.lg,
    backgroundColor: APP_COLORS.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    fontFamily: APP_FONTS.bodyMedium,
    fontSize: 16,
    color: APP_COLORS.textPrimary,
    flex: 1,
  },
  bottomSection: {
    paddingBottom: APP_SPACING['2xl'],
    gap: APP_SPACING.md,
  },
  continueButton: {
    minHeight: 56,
    borderRadius: APP_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonText: {
    fontFamily: APP_FONTS.bodyBold,
    color: APP_COLORS.onAccent,
    fontSize: 17,
    fontWeight: '700',
  },
  privacyText: {
    fontFamily: APP_FONTS.body,
    fontSize: 12,
    textAlign: 'center',
    color: APP_COLORS.textTertiary,
    lineHeight: 16,
  },
})
