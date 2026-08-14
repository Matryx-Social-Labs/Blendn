import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Avatar from '../../components/ui/Avatar'
import OnboardingHeader from '../../components/OnboardingHeader'
import { useToast } from '../../components/Toast'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { useAuth } from '../../lib/useAuth'
import { APP_COLORS, APP_FONTS, APP_RADIUS, APP_SPACING } from '../../lib/theme'

const CTA_GRADIENT: [string, string, string] = [APP_COLORS.accent, APP_COLORS.accentSecondary, APP_COLORS.highlight]

interface ReviewProfile {
  name?: string
  avatar?: string
  occupation?: string
  bio?: string
  interests: string[]
  location?: string
  lookingFor: string[]
}

export default function Complete() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [profile, setProfile] = useState<ReviewProfile | null>(null)

  useEffect(() => {
    let mounted = true
    const run = async () => {
      if (!user) return
      const result = await apiClient.getProfile(user.id)
      if (!mounted) return
      if (result.success && result.data) {
        const data = result.data
        const p = data.profile || data
        const interests = Array.isArray(p.interests)
          ? p.interests.map((i: any) => (typeof i === 'string' ? i : i?.name || '')).filter(Boolean)
          : []
        setProfile({
          name: data.name || p.name,
          avatar: (p.profile_photos && p.profile_photos[0]) || (p.photos && p.photos[0]) || data.image,
          occupation: p.occupation,
          bio: p.bio,
          interests,
          location: p.location,
          lookingFor: (data as any).looking_for || (p as any).looking_for || [],
        })
      }
      setFetching(false)
    }
    run()
    return () => { mounted = false }
  }, [user])

  const handleComplete = async () => {
    if (!user) {
      showToast('User not found. Please sign in again.', 'error')
      return
    }

    setLoading(true)
    try {
      const result = await apiClient.updateProfile(user.id, { onboarded: true })
      if (!result.success) {
        Logger.error('profile', 'Onboarding completion: profile update error', { error: result.error })
        showToast('Failed to complete onboarding', 'error')
        return
      }
      router.replace('/(tabs)/events')
    } catch (error) {
      Logger.error('profile', 'Onboarding completion error', { error })
      showToast('Something went wrong. Please try again.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <OnboardingHeader currentStep={9} totalSteps={9} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>
          You&apos;re all set{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}
        </Text>
        <Text style={styles.subtitle}>
          Your profile is ready to join the community. Review your details below before you start
          blending with others.
        </Text>

        {fetching ? (
          <ActivityIndicator color={APP_COLORS.accent} style={styles.loadingIndicator} />
        ) : (
          <>
            <View style={styles.bioCard}>
              <View style={styles.avatarWrap}>
                <Avatar source={profile?.avatar} size={96} ringColor={APP_COLORS.accent} ringWidth={2} />
                <View style={styles.checkBadge}>
                  <Ionicons name="checkmark" size={14} color={APP_COLORS.onAccent} />
                </View>
              </View>
              <Text style={styles.bioName}>{profile?.name || 'You'}</Text>
              {!!profile?.occupation && <Text style={styles.bioRole}>{profile.occupation}</Text>}
              {!!profile?.bio && (
                <>
                  <View style={styles.bioDivider} />
                  <Text style={styles.bioText}>{profile.bio}</Text>
                </>
              )}
            </View>

            {profile && profile.interests.length > 0 && (
              <View style={styles.metaCard}>
                <Text style={styles.metaCardTitle}>Interests</Text>
                <View style={styles.interestsRow}>
                  {profile.interests.slice(0, 6).map((interest) => (
                    <View key={interest} style={styles.interestPill}>
                      <Text style={styles.interestPillText}>{interest}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {!!profile?.location && (
              <View style={[styles.metaCard, styles.metaCardRow]}>
                <Ionicons name="location" size={18} color={APP_COLORS.accent} />
                <View>
                  <Text style={styles.metaCardLabel}>Primary Hub</Text>
                  <Text style={styles.metaCardValue}>{profile.location}</Text>
                </View>
              </View>
            )}

            {profile && profile.lookingFor.length > 0 && (
              <View style={[styles.metaCard, styles.metaCardRow]}>
                <Ionicons name="compass" size={18} color={APP_COLORS.accent} />
                <View>
                  <Text style={styles.metaCardLabel}>Looking For</Text>
                  <Text style={styles.metaCardValue}>{profile.lookingFor.join(', ')}</Text>
                </View>
              </View>
            )}
          </>
        )}

        <TouchableOpacity onPress={handleComplete} disabled={loading} activeOpacity={0.9} style={styles.ctaWrap}>
          <LinearGradient colors={CTA_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primary}>
            {loading ? (
              <ActivityIndicator color={APP_COLORS.onAccent} />
            ) : (
              <>
                <Text style={styles.primaryText}>Start Blending</Text>
                <Ionicons name="arrow-forward" size={18} color={APP_COLORS.onAccent} />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} disabled={loading} style={styles.editLink}>
          <Text style={styles.editLinkText}>Edit my details</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: APP_COLORS.backgroundBase },
  content: { paddingHorizontal: APP_SPACING.xl, paddingBottom: APP_SPACING['3xl'], alignItems: 'center' },
  title: {
    fontFamily: APP_FONTS.headingExtraBold,
    fontSize: 26,
    fontWeight: '800',
    color: APP_COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: APP_SPACING.sm,
  },
  subtitle: {
    fontFamily: APP_FONTS.body,
    fontSize: 15,
    color: APP_COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: APP_SPACING['2xl'],
    maxWidth: 320,
  },
  loadingIndicator: {
    marginVertical: APP_SPACING['3xl'],
  },
  bioCard: {
    width: '100%',
    backgroundColor: APP_COLORS.backgroundElevated,
    borderRadius: APP_RADIUS['2xl'],
    padding: APP_SPACING.xl,
    alignItems: 'center',
    marginBottom: APP_SPACING.md,
  },
  avatarWrap: {
    width: 96,
    height: 96,
    marginBottom: APP_SPACING.md,
  },
  checkBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: APP_COLORS.accent,
    borderWidth: 3,
    borderColor: APP_COLORS.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bioName: {
    fontFamily: APP_FONTS.heading,
    fontSize: 20,
    fontWeight: '700',
    color: APP_COLORS.textPrimary,
  },
  bioRole: {
    fontFamily: APP_FONTS.bodyMedium,
    fontSize: 14,
    color: APP_COLORS.accent,
    marginTop: 2,
  },
  bioDivider: {
    width: '100%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: APP_COLORS.separator,
    marginVertical: APP_SPACING.md,
  },
  bioText: {
    fontFamily: APP_FONTS.body,
    fontSize: 14,
    color: APP_COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  metaCard: {
    width: '100%',
    backgroundColor: APP_COLORS.backgroundElevated,
    borderRadius: APP_RADIUS['2xl'],
    padding: APP_SPACING.lg,
    marginBottom: APP_SPACING.md,
  },
  metaCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: APP_SPACING.md,
  },
  metaCardTitle: {
    fontFamily: APP_FONTS.heading,
    fontSize: 14,
    fontWeight: '700',
    color: APP_COLORS.textPrimary,
    marginBottom: APP_SPACING.sm,
  },
  metaCardLabel: {
    fontFamily: APP_FONTS.body,
    fontSize: 12,
    color: APP_COLORS.textTertiary,
  },
  metaCardValue: {
    fontFamily: APP_FONTS.bodySemiBold,
    fontSize: 14,
    fontWeight: '600',
    color: APP_COLORS.textPrimary,
  },
  interestsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: APP_SPACING.xs,
  },
  interestPill: {
    backgroundColor: APP_COLORS.backgroundInput,
    borderRadius: APP_RADIUS.pill,
    paddingHorizontal: APP_SPACING.md,
    paddingVertical: APP_SPACING.xs,
  },
  interestPillText: {
    fontFamily: APP_FONTS.bodyMedium,
    fontSize: 12,
    color: APP_COLORS.textPrimary,
  },
  ctaWrap: {
    width: '100%',
    marginTop: APP_SPACING.lg,
  },
  primary: {
    flexDirection: 'row',
    minHeight: 56,
    borderRadius: APP_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: APP_SPACING.xs,
  },
  primaryText: {
    fontFamily: APP_FONTS.bodyBold,
    color: APP_COLORS.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
  editLink: {
    marginTop: APP_SPACING.md,
    alignItems: 'center',
  },
  editLinkText: {
    fontFamily: APP_FONTS.bodyMedium,
    color: APP_COLORS.textSecondary,
    fontSize: 14,
  },
})
