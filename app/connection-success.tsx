import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useEffect, useState } from 'react'
import { StyleSheet, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Avatar from '../components/ui/Avatar'
import Typography from '../components/Typography'
import { apiClient } from '../lib/apiClient'
import { APP_COLORS, APP_RADIUS, APP_SPACING } from '../lib/theme'
import { useAuth } from '../lib/useAuth'

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 }

export default function ConnectionSuccess() {
  const params = useLocalSearchParams<{
    conversationId?: string
    otherUserId?: string
    otherUserName?: string
    otherUserAvatar?: string
  }>()
  const { user } = useAuth()
  const [myAvatar, setMyAvatar] = useState<string | null>(null)

  const otherName = params.otherUserName || 'them'
  const otherAvatar = params.otherUserAvatar || undefined

  useEffect(() => {
    let mounted = true
    const run = async () => {
      if (!user?.id) return
      const result = await apiClient.getProfile(user.id)
      if (!mounted || !result.success || !result.data) return
      const profile = result.data.profile || {}
      const primary = Array.isArray(profile.profile_photos) && profile.profile_photos.length > 0
        ? profile.profile_photos[0]
        : (Array.isArray(profile.photos) && profile.photos.length > 0 ? profile.photos[0] : result.data.image || null)
      setMyAvatar(primary || null)
    }
    run()
    return () => { mounted = false }
  }, [user?.id])

  const handleSendMessage = () => {
    if (params.conversationId) {
      router.replace({
        pathname: '/private-chat/[conversationId]',
        params: {
          conversationId: params.conversationId,
          otherUserName: otherName,
          otherUserId: params.otherUserId || '',
          otherUserAvatar: otherAvatar || '',
        } as any,
      })
    } else {
      router.back()
    }
  }

  const handleContinueExploring = () => {
    router.back()
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="light" backgroundColor={APP_COLORS.backgroundBase} />

      <View style={styles.headerRow}>
        <Typography variant="h4" style={styles.headerWordmark}>Blend&apos;n</Typography>
        <TouchableOpacity onPress={handleContinueExploring} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={18} color={APP_COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.main} pointerEvents="box-none">
        <View style={styles.glowWrap} pointerEvents="none">
          <LinearGradient
            colors={APP_COLORS.accentGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.glow}
          />
        </View>

        <View style={styles.avatarComposition}>
          <Avatar source={myAvatar || undefined} size={128} ringColor={APP_COLORS.backgroundElevated} ringWidth={4} />
          <Avatar source={otherAvatar} size={128} ringColor={APP_COLORS.backgroundElevated} ringWidth={4} style={styles.secondAvatar} />
          <View style={styles.sparkBadge}>
            <Ionicons name="sparkles" size={20} color={APP_COLORS.accent} />
          </View>
        </View>

        <View style={styles.textSection}>
          <Typography variant="h4" style={styles.heading}>A new spark.</Typography>
          <Typography variant="body2" style={styles.subheading}>
            You and <Typography variant="body2" style={styles.subheadingAccent}>{otherName}</Typography> are connected.
          </Typography>
        </View>

        <View style={styles.ctaSection}>
          <TouchableOpacity onPress={handleSendMessage} accessibilityRole="button" accessibilityLabel="Send a message">
            <LinearGradient
              colors={APP_COLORS.accentGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primaryButton}
            >
              <Typography variant="h4" style={styles.primaryButtonText}>Send a Message</Typography>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleContinueExploring}
            style={styles.secondaryButton}
            accessibilityRole="button"
            accessibilityLabel="Continue exploring"
          >
            <Typography variant="h4" style={styles.secondaryButtonText}>Continue Exploring</Typography>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: APP_SPACING.xl,
    paddingVertical: APP_SPACING.md,
  },
  headerWordmark: {
    color: APP_COLORS.accent,
    letterSpacing: -0.8,
  },
  main: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: APP_SPACING.xl,
    gap: APP_SPACING['3xl'],
  },
  glowWrap: {
    position: 'absolute',
    top: '30%',
    alignSelf: 'center',
  },
  glow: {
    width: 260,
    height: 260,
    borderRadius: 130,
    opacity: 0.15,
  },
  avatarComposition: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  secondAvatar: {
    marginLeft: -24,
  },
  sparkBadge: {
    position: 'absolute',
    top: -16,
    right: -8,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: APP_COLORS.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textSection: {
    alignItems: 'center',
    gap: APP_SPACING.md,
  },
  heading: {
    color: APP_COLORS.textPrimary,
    fontSize: 16,
    letterSpacing: -0.8,
  },
  subheading: {
    color: APP_COLORS.textSecondary,
    textAlign: 'center',
  },
  subheadingAccent: {
    color: APP_COLORS.accent,
  },
  ctaSection: {
    width: '100%',
    gap: APP_SPACING.md,
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: APP_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: APP_COLORS.onAccent,
  },
  secondaryButton: {
    minHeight: 56,
    borderRadius: APP_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: APP_COLORS.backgroundInput,
  },
  secondaryButtonText: {
    color: APP_COLORS.textPrimary,
  },
})
