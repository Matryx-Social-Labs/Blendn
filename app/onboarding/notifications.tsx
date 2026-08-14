import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import React, { useState } from 'react'
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { registerForPushNotificationsAsync, savePushTokenToProfile, setCurrentPushToken } from '../../lib/notifications'
import { useAuth } from '../../lib/useAuth'
import OnboardingHeader from '../../components/OnboardingHeader'
import { useToast } from '../../components/Toast'
import { APP_COLORS, APP_FONTS, APP_RADIUS, APP_SPACING } from '../../lib/theme'

export default function NotificationsStep() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)

  const goNext = () => router.push('./location' as any)

  const handleEnable = async () => {
    if (!user) {
      showToast('Please sign in to continue', 'error')
      return
    }
    setLoading(true)
    try {
      const token = await registerForPushNotificationsAsync()
      if (token) {
        setCurrentPushToken(token)
        await savePushTokenToProfile(token)
      }
      await apiClient.updateProfile(user.id, { pushEnabled: !!token })
      goNext()
    } catch (e) {
      Logger.error('profile', 'Onboarding notifications step error', { error: e })
      showToast('Failed to enable notifications', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleMaybeLater = async () => {
    if (user) {
      await apiClient.updateProfile(user.id, { pushEnabled: false })
    }
    goNext()
  }

  return (
    <SafeAreaView style={styles.container}>
      <OnboardingHeader currentStep={2} totalSteps={9} onBack={() => router.back()} />

      <View style={styles.content}>
        <View style={styles.heroSection}>
          <View style={styles.iconBadge}>
            <Ionicons name="notifications" size={28} color={APP_COLORS.accent} />
          </View>
          <Text style={styles.title}>Never miss a spark.</Text>
          <Text style={styles.subtitle}>
            Enable notifications to know when someone nearby wants to connect or when matches are
            active at your location.
          </Text>

          <View style={styles.previewCard}>
            <View style={styles.previewIconWrap}>
              <Ionicons name="flash" size={16} color={APP_COLORS.accent} />
            </View>
            <View style={styles.previewText}>
              <Text style={styles.previewTitle}>New Spark Nearby</Text>
              <Text style={styles.previewBody}>Someone active is ready to connect!</Text>
            </View>
            <Text style={styles.previewTime}>Just now</Text>
          </View>
        </View>

        <View style={styles.bottomSection}>
          <TouchableOpacity onPress={handleEnable} disabled={loading} activeOpacity={0.9}>
            <LinearGradient
              colors={APP_COLORS.accentGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primaryButton}
            >
              {loading ? (
                <ActivityIndicator color={APP_COLORS.onAccent} />
              ) : (
                <Text style={styles.primaryButtonText}>Enable Notifications</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleMaybeLater} disabled={loading}>
            <Text style={styles.secondaryButtonText}>Maybe later</Text>
          </TouchableOpacity>
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
    alignItems: 'center',
    justifyContent: 'center',
    gap: APP_SPACING.md,
  },
  iconBadge: {
    width: 64,
    height: 64,
    borderRadius: APP_RADIUS.xl,
    backgroundColor: APP_COLORS.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: APP_SPACING.sm,
  },
  title: {
    fontFamily: APP_FONTS.headingExtraBold,
    fontSize: 28,
    fontWeight: '800',
    color: APP_COLORS.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: APP_FONTS.body,
    fontSize: 16,
    color: APP_COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: APP_SPACING.sm,
    backgroundColor: APP_COLORS.backgroundElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
    borderRadius: APP_RADIUS['2xl'],
    padding: APP_SPACING.md,
    marginTop: APP_SPACING.xl,
    width: '100%',
  },
  previewIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,144,109,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewText: {
    flex: 1,
    gap: 2,
  },
  previewTitle: {
    fontFamily: APP_FONTS.bodyBold,
    fontSize: 14,
    fontWeight: '700',
    color: APP_COLORS.textPrimary,
  },
  previewBody: {
    fontFamily: APP_FONTS.body,
    fontSize: 12,
    color: APP_COLORS.textSecondary,
  },
  previewTime: {
    fontFamily: APP_FONTS.body,
    fontSize: 11,
    color: APP_COLORS.textTertiary,
  },
  bottomSection: {
    paddingBottom: APP_SPACING['2xl'],
    gap: APP_SPACING.md,
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
    minHeight: 56,
    borderRadius: APP_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: APP_COLORS.backgroundInput,
  },
  secondaryButtonText: {
    fontFamily: APP_FONTS.bodyBold,
    color: APP_COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
})
