import { router } from 'expo-router'
import React, { useState } from 'react'
import * as Haptics from 'expo-haptics'
import { KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { useAuth } from '../../lib/useAuth'
import OnboardingHeader from '../../components/OnboardingHeader'
import { useToast } from '../../components/Toast'
import { APP_COLORS, APP_FONTS, APP_RADIUS, APP_SPACING } from '../../lib/theme'

const BIO_MAX_LENGTH = 300

const INTERESTS = [
  '🎵 Music', '🎬 Movies', '📚 Reading', '🏃‍♀️ Running',
  '🧘‍♀️ Yoga', '🍳 Cooking', '📸 Photography', '🎨 Art',
  '🏔️ Hiking', '🏊‍♀️ Swimming', '⚽ Sports', '🎮 Gaming',
  '✈️ Travel', '🍕 Food', '🏖️ Beach', '🎪 Comedy',
  '💃 Dancing', '🏋️‍♀️ Fitness', '🧩 Puzzles', '🎭 Theater',
  '🎸 Guitar', '📱 Tech', '🌱 Gardening', '🐕 Pets',
  '🎯 Darts', '🎳 Bowling', '🏆 Competitions', '🧠 Learning'
]

export default function InterestsAndBio() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [bio, setBio] = useState('')
  const [saving, setSaving] = useState(false)

  const handleInterestToggle = (interest: string) => {
    if (selectedInterests.includes(interest)) {
      Haptics.selectionAsync().catch(() => {})
      setSelectedInterests(prev => prev.filter(i => i !== interest))
    } else if (selectedInterests.length < 10) {
      Haptics.selectionAsync().catch(() => {})
      setSelectedInterests(prev => [...prev, interest])
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
      showToast('You can select up to 10 interests', 'info')
    }
  }

  const handleContinue = async () => {
    if (!user) {
      showToast('Please sign in to continue', 'error')
      return
    }
    setSaving(true)
    try {
      const result = await apiClient.updateProfile(user.id, {
        interests: selectedInterests,
        bio: bio.trim() || undefined,
      })
      if (!result.success) {
        throw new Error(result.error || 'Failed to save')
      }
      router.push('./goals' as any)
    } catch (e) {
      Logger.error('profile', 'Onboarding interests save error', { error: e })
      showToast('Failed to save interests', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <OnboardingHeader currentStep={6} totalSteps={9} onBack={() => router.back()} />

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>The finer details</Text>
          <Text style={styles.subtitle}>
            Tell the circle who you are beyond the profile picture.
          </Text>

          <Text style={styles.sectionTitle}>Interests</Text>
          <Text style={styles.selectedText}>Selected: {selectedInterests.length}/10</Text>
          <View style={styles.interestsGrid}>
            {INTERESTS.map((interest) => {
              const isSelected = selectedInterests.includes(interest)
              return (
                <TouchableOpacity
                  key={interest}
                  style={styles.interestChipWrap}
                  onPress={() => handleInterestToggle(interest)}
                  activeOpacity={0.85}
                >
                  {isSelected ? (
                    <LinearGradient
                      colors={APP_COLORS.accentGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.interestChip}
                    >
                      <Text style={styles.interestTextSelected}>{interest}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={[styles.interestChip, styles.interestChipUnselected]}>
                      <Text style={styles.interestText}>{interest}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )
            })}
          </View>

          <Text style={[styles.sectionTitle, styles.aboutTitle]}>About Me</Text>
          <TextInput
            style={styles.bioInput}
            value={bio}
            onChangeText={(v) => setBio(v.slice(0, BIO_MAX_LENGTH))}
            placeholder="Ask me about... curated experiences, the best hidden cafes in the city, or my latest obsession."
            placeholderTextColor={APP_COLORS.textTertiary}
            multiline
            textAlignVertical="top"
            maxLength={BIO_MAX_LENGTH}
          />
          <Text style={styles.charCount}>{bio.length}/{BIO_MAX_LENGTH}</Text>
        </ScrollView>

        <View style={styles.bottomSection}>
          <TouchableOpacity onPress={handleContinue} disabled={saving} activeOpacity={0.9}>
            <LinearGradient
              colors={selectedInterests.length > 0 ? APP_COLORS.accentGradient : DISABLED_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.continueButton}
            >
              <Text style={styles.continueButtonText}>Complete Profile</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const DISABLED_GRADIENT: [string, string] = ['rgba(255,144,109,0.4)', 'rgba(255,109,141,0.4)']

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
  subtitle: {
    fontFamily: APP_FONTS.body,
    fontSize: 16,
    color: APP_COLORS.textSecondary,
    marginBottom: APP_SPACING.xl,
    lineHeight: 22,
  },
  sectionTitle: {
    fontFamily: APP_FONTS.heading,
    fontSize: 18,
    fontWeight: '700',
    color: APP_COLORS.textPrimary,
    marginBottom: APP_SPACING.xs,
  },
  aboutTitle: {
    marginTop: APP_SPACING.xl,
  },
  selectedText: {
    fontFamily: APP_FONTS.body,
    fontSize: 13,
    color: APP_COLORS.textSecondary,
    marginBottom: APP_SPACING.md,
  },
  interestsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: APP_SPACING.sm,
    paddingBottom: APP_SPACING.sm,
  },
  interestChipWrap: {
    borderRadius: APP_RADIUS.pill,
  },
  interestChip: {
    paddingHorizontal: APP_SPACING.md,
    paddingVertical: APP_SPACING.sm,
    borderRadius: APP_RADIUS.pill,
  },
  interestChipUnselected: {
    backgroundColor: APP_COLORS.backgroundCard,
  },
  interestText: {
    fontFamily: APP_FONTS.bodyMedium,
    fontSize: 13,
    fontWeight: '500',
    color: APP_COLORS.textSecondary,
  },
  interestTextSelected: {
    fontFamily: APP_FONTS.bodyBold,
    fontSize: 13,
    fontWeight: '700',
    color: APP_COLORS.onAccent,
  },
  bioInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
    borderRadius: APP_RADIUS['2xl'],
    padding: APP_SPACING.md,
    fontSize: 15,
    fontFamily: APP_FONTS.body,
    backgroundColor: APP_COLORS.backgroundInput,
    color: APP_COLORS.textPrimary,
    height: 120,
  },
  charCount: {
    fontFamily: APP_FONTS.body,
    fontSize: 12,
    color: APP_COLORS.textTertiary,
    textAlign: 'right',
    marginTop: APP_SPACING.xs,
    marginBottom: APP_SPACING.xl,
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
