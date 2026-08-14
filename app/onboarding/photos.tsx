import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import React, { useState } from 'react'
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import OnboardingHeader from '../../components/OnboardingHeader'
import PhotoManager from '../../components/PhotoManager'
import { SkeletonBlock, SkeletonLine } from '../../components/Skeleton'
import { useAuth } from '../../lib/useAuth'
import { APP_COLORS, APP_FONTS, APP_RADIUS, APP_SPACING } from '../../lib/theme'

export default function Photos() {
  const { user, loading: authLoading } = useAuth()
  const [photos, setPhotos] = useState<string[]>([])

  const goNext = () => router.push('./complete' as any)

  const renderPhotoSection = () => {
    if (authLoading || !user) {
      return (
        <View>
          <SkeletonBlock width={'100%'} height={220} borderRadius={APP_RADIUS['2xl']} style={styles.photoManager} />
          <SkeletonLine width={'60%'} />
        </View>
      )
    }

    return (
      <PhotoManager
        userId={user.id}
        maxPhotos={6}
        editable={true}
        onPhotosChange={setPhotos}
        style={styles.photoManager}
      />
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <OnboardingHeader currentStep={8} totalSteps={9} onBack={() => router.back()} onSkip={goNext} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>
          Upload your <Text style={styles.titleAccent}>identity</Text>
        </Text>
        <Text style={styles.subtitle}>
          Authenticity is what makes a great profile — share high-quality moments that capture the
          real you.
        </Text>

        <View style={styles.photosSection}>
          {renderPhotoSection()}
        </View>

        <View style={styles.helperRow}>
          <Ionicons name="information-circle-outline" size={16} color={APP_COLORS.textTertiary} />
          <Text style={styles.helperText}>We support JPG and PNG up to 20MB. Max 6 photos.</Text>
        </View>
      </ScrollView>

      <View style={styles.bottomSection}>
        <TouchableOpacity onPress={goNext} activeOpacity={0.9}>
          <LinearGradient
            colors={APP_COLORS.accentGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.continueButton}
          >
            <Text style={styles.continueButtonText}>
              {photos.length > 0 ? 'Finalize Identity' : 'Continue without photos'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
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
  },
  title: {
    fontFamily: APP_FONTS.headingExtraBold,
    fontSize: 28,
    fontWeight: '800',
    marginBottom: APP_SPACING.xs,
    color: APP_COLORS.textPrimary,
  },
  titleAccent: {
    color: APP_COLORS.accent,
  },
  subtitle: {
    fontFamily: APP_FONTS.body,
    fontSize: 15,
    color: APP_COLORS.textSecondary,
    marginBottom: APP_SPACING.xl,
    lineHeight: 21,
  },
  photosSection: {
    marginBottom: APP_SPACING.lg,
  },
  photoManager: {
    marginVertical: 0,
  },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: APP_SPACING.xs,
    paddingTop: APP_SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: APP_COLORS.separator,
    marginBottom: APP_SPACING.xl,
  },
  helperText: {
    fontFamily: APP_FONTS.body,
    fontSize: 12,
    color: APP_COLORS.textTertiary,
    flex: 1,
  },
  bottomSection: {
    paddingHorizontal: APP_SPACING.xl,
    paddingBottom: APP_SPACING['2xl'],
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
    fontSize: 16,
    fontWeight: '700',
  },
})
