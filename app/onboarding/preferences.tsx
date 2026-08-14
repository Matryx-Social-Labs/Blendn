import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import React, { useState } from 'react'
import { ScrollView, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { useAuth } from '../../lib/useAuth'
import OnboardingHeader from '../../components/OnboardingHeader'
import { useToast } from '../../components/Toast'
import { APP_COLORS, APP_FONTS, APP_RADIUS, APP_SPACING } from '../../lib/theme'

const CTA_GRADIENT: [string, string, string] = [APP_COLORS.accent, APP_COLORS.accentSecondary, APP_COLORS.highlight]

const LOOKING_FOR: { value: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'Dating', icon: 'heart' },
  { value: 'Friendship', icon: 'people' },
  { value: 'Networking', icon: 'briefcase' },
  { value: 'Travel', icon: 'airplane' },
  { value: 'Open', icon: 'infinite' },
]

export default function PreferencesStep() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const toggle = (v: string) => setSelected(prev => (prev.includes(v) ? prev.filter(i => i !== v) : [...prev, v]))

  const goNext = () => router.push('./professional-info' as any)

  const onContinue = async () => {
    if (!user) {
      showToast('Please sign in to continue', 'error')
      return
    }
    setSaving(true)
    try {
      const result = await apiClient.updateProfile(user.id, { looking_for: selected })
      if (!result.success) throw new Error(result.error || 'Failed to save')
      goNext()
    } catch (e) {
      Logger.error('profile', 'Onboarding preferences step error', { error: e })
      showToast('Failed to save your preferences', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <OnboardingHeader currentStep={4} totalSteps={9} onBack={() => router.back()} onSkip={goNext} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Your preferences</Text>
        <Text style={styles.subtitle}>Be your authentic self. Help us curate the right connections for your journey.</Text>

        <Text style={styles.sectionTitle}>Looking For</Text>
        <Text style={styles.sectionSubtitle}>What brings you to Blend&apos;n today?</Text>
        <View style={styles.grid}>
          {LOOKING_FOR.map(({ value, icon }) => {
            const isSel = selected.includes(value)
            return (
              <TouchableOpacity
                key={value}
                style={[styles.card, isSel && styles.cardSelected]}
                onPress={() => toggle(value)}
                activeOpacity={0.85}
              >
                <View style={[styles.cardIconWrap, isSel && styles.cardIconWrapSelected]}>
                  <Ionicons name={icon} size={20} color={isSel ? APP_COLORS.onAccent : APP_COLORS.textSecondary} />
                </View>
                <Text style={[styles.cardText, isSel && styles.cardTextSelected]}>{value}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <TouchableOpacity onPress={onContinue} disabled={saving} activeOpacity={0.9} style={styles.ctaWrap}>
          <LinearGradient colors={CTA_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primary}>
            <Text style={styles.primaryText}>Continue</Text>
          </LinearGradient>
        </TouchableOpacity>
        <Text style={styles.disclaimer}>Your preferences are used to improve your experience. You can change them anytime in settings.</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: APP_COLORS.backgroundBase },
  content: { paddingHorizontal: APP_SPACING.xl, paddingBottom: APP_SPACING['3xl'] },
  title: {
    fontFamily: APP_FONTS.headingExtraBold,
    fontSize: 28,
    fontWeight: '800',
    color: APP_COLORS.textPrimary,
    marginBottom: APP_SPACING.xs,
  },
  subtitle: {
    fontFamily: APP_FONTS.body,
    fontSize: 16,
    color: APP_COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: APP_SPACING['2xl'],
  },
  sectionTitle: {
    fontFamily: APP_FONTS.heading,
    fontSize: 18,
    fontWeight: '700',
    color: APP_COLORS.textPrimary,
    marginBottom: APP_SPACING.xxs,
  },
  sectionSubtitle: {
    fontFamily: APP_FONTS.body,
    fontSize: 14,
    color: APP_COLORS.textSecondary,
    marginBottom: APP_SPACING.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: APP_SPACING.md,
    marginBottom: APP_SPACING['2xl'],
  },
  card: {
    width: '47%',
    backgroundColor: APP_COLORS.backgroundElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
    borderRadius: APP_RADIUS['2xl'],
    padding: APP_SPACING.lg,
    gap: APP_SPACING.sm,
  },
  cardSelected: {
    borderColor: APP_COLORS.accent,
    backgroundColor: 'rgba(255,144,109,0.1)',
  },
  cardIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: APP_COLORS.backgroundInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconWrapSelected: {
    backgroundColor: APP_COLORS.accent,
  },
  cardText: {
    fontFamily: APP_FONTS.bodySemiBold,
    fontSize: 15,
    fontWeight: '600',
    color: APP_COLORS.textPrimary,
  },
  cardTextSelected: {
    color: APP_COLORS.accent,
  },
  ctaWrap: {
    marginTop: APP_SPACING.sm,
  },
  primary: {
    minHeight: 56,
    borderRadius: APP_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    fontFamily: APP_FONTS.bodyBold,
    color: APP_COLORS.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
  disclaimer: {
    fontFamily: APP_FONTS.body,
    fontSize: 12,
    color: APP_COLORS.textTertiary,
    textAlign: 'center',
    marginTop: APP_SPACING.md,
    lineHeight: 16,
  },
})
