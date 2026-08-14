import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import * as Location from 'expo-location'
import { router } from 'expo-router'
import React, { useState } from 'react'
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { useAuth } from '../../lib/useAuth'
import OnboardingHeader from '../../components/OnboardingHeader'
import { useToast } from '../../components/Toast'
import { APP_COLORS, APP_FONTS, APP_RADIUS, APP_SPACING } from '../../lib/theme'

const CTA_GRADIENT: [string, string, string] = [APP_COLORS.accent, APP_COLORS.accentSecondary, APP_COLORS.highlight]

export default function LocationStep() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [granted, setGranted] = useState<boolean | null>(null)

  const goNext = () => router.push('./preferences' as any)

  const requestPermissionAndSave = async () => {
    if (!user) {
      showToast('Please sign in to continue', 'error')
      return
    }

    setLoading(true)
    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync()
      if (!servicesEnabled) {
        showToast('Please enable Location Services in your device settings.', 'info')
        setGranted(false)
        return
      }

      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setGranted(false)
        showToast('Location is needed to verify event check-ins and show nearby events.', 'info')
        return
      }

      setGranted(true)
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })

      await apiClient.updateProfile(user.id, {
        location: `${position.coords.latitude},${position.coords.longitude}`,
      })

      goNext()
    } catch (error) {
      Logger.error('profile', 'Onboarding location step error', { error })
      showToast('Failed to update your location preferences', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <OnboardingHeader currentStep={3} totalSteps={9} onBack={() => router.back()} onSkip={goNext} />

      <View style={styles.content}>
        <Text style={styles.title}>See who&apos;s around</Text>
        <Text style={styles.subtitle}>
          Blend&apos;n uses your location to show you real people in your immediate vicinity, like
          at a cafe or an event venue.
        </Text>

        <View style={styles.mapCard}>
          <View style={styles.mapPulseOuter}>
            <View style={styles.mapPulseInner}>
              <View style={styles.youPin}>
                <Ionicons name="person" size={18} color={APP_COLORS.onAccent} />
              </View>
              <View style={styles.youLabel}>
                <Text style={styles.youLabelText}>YOU</Text>
              </View>
            </View>
          </View>
          <View style={styles.mapFooter}>
            <Ionicons name="location" size={14} color={APP_COLORS.accent} />
            <Text style={styles.mapFooterText}>Real-time local presence, once enabled</Text>
          </View>
        </View>

        <View style={styles.bottomSection}>
          <TouchableOpacity onPress={requestPermissionAndSave} disabled={loading} activeOpacity={0.9}>
            <LinearGradient
              colors={CTA_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primaryButton}
            >
              {loading ? (
                <ActivityIndicator color={APP_COLORS.onAccent} />
              ) : (
                <Text style={styles.primaryButtonText}>Allow Location</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={goNext} disabled={loading}>
            <Text style={styles.secondaryButtonText}>Maybe later</Text>
          </TouchableOpacity>

          <View style={styles.disclaimerRow}>
            <Ionicons name="lock-closed" size={12} color={APP_COLORS.textTertiary} />
            <Text style={styles.disclaimer}>Your precise location is never shared with strangers.</Text>
          </View>

          {granted === false && (
            <Text style={styles.notice}>You can enable location later from your device settings.</Text>
          )}
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: APP_COLORS.backgroundBase },
  content: { flex: 1, paddingHorizontal: APP_SPACING.xl },
  title: {
    fontFamily: APP_FONTS.headingExtraBold,
    fontSize: 28,
    fontWeight: '800',
    color: APP_COLORS.textPrimary,
    marginBottom: APP_SPACING.sm,
  },
  subtitle: {
    fontFamily: APP_FONTS.body,
    fontSize: 16,
    color: APP_COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: APP_SPACING.xl,
  },
  mapCard: {
    flex: 1,
    backgroundColor: APP_COLORS.backgroundElevated,
    borderRadius: APP_RADIUS['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
    overflow: 'hidden',
    marginBottom: APP_SPACING.xl,
    minHeight: 240,
  },
  mapPulseOuter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPulseInner: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,144,109,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: APP_SPACING.xs,
  },
  youPin: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: APP_COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: APP_COLORS.backgroundElevated,
  },
  youLabel: {
    backgroundColor: APP_COLORS.accent,
    borderRadius: APP_RADIUS.pill,
    paddingHorizontal: APP_SPACING.sm,
    paddingVertical: 2,
  },
  youLabelText: {
    fontFamily: APP_FONTS.bodyBold,
    fontSize: 10,
    fontWeight: '700',
    color: APP_COLORS.onAccent,
  },
  mapFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: APP_SPACING.xs,
    paddingHorizontal: APP_SPACING.md,
    paddingVertical: APP_SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: APP_COLORS.separator,
  },
  mapFooterText: {
    fontFamily: APP_FONTS.body,
    fontSize: 12,
    color: APP_COLORS.textSecondary,
  },
  bottomSection: {
    paddingBottom: APP_SPACING['2xl'],
    gap: APP_SPACING.sm,
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: APP_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontFamily: APP_FONTS.bodyBold,
    color: APP_COLORS.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontFamily: APP_FONTS.bodyMedium,
    color: APP_COLORS.textSecondary,
    fontSize: 15,
  },
  disclaimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: APP_SPACING.xs,
  },
  disclaimer: {
    fontFamily: APP_FONTS.body,
    fontSize: 11,
    color: APP_COLORS.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  notice: {
    marginTop: APP_SPACING.sm,
    fontSize: 12,
    color: APP_COLORS.textSecondary,
    textAlign: 'center',
  },
})
