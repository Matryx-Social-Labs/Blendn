import { router } from 'expo-router'
import React, { useState } from 'react'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useAuth } from '../../lib/useAuth'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import OnboardingHeader from '../../components/OnboardingHeader'
import { useToast } from '../../components/Toast'
import { APP_COLORS, APP_FONTS, APP_RADIUS, APP_SPACING } from '../../lib/theme'

const GOALS = [
  'Make new friends',
  'Find a date',
  'Professional networking',
  'Discover events',
  'Activity partners',
  'Just looking around',
]

export default function GoalsStep() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const toggle = (g: string) => {
    setSelected(prev => (prev.includes(g) ? prev.filter(i => i !== g) : [...prev, g]))
  }

  const goNext = () => router.push('./photos' as any)

  const onContinue = async () => {
    if (!user) {
      showToast('Please sign in to continue', 'error')
      return
    }
    setSaving(true)
    try {
      const result = await apiClient.updateProfile(user.id, { goals: selected })
      if (!result.success) throw new Error(result.error || 'Failed to save')
      goNext()
    } catch (e) {
      Logger.error('profile', 'Onboarding goals step error', { error: e })
      showToast('Failed to save your goals', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <OnboardingHeader currentStep={7} totalSteps={9} onBack={() => router.back()} onSkip={goNext} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>What brings you here?</Text>
        <Text style={styles.subtitle}>Select all that apply</Text>
        <View style={styles.grid}>
          {GOALS.map((g) => {
            const isSelected = selected.includes(g)
            return (
              <TouchableOpacity key={g} style={styles.chipWrap} onPress={() => toggle(g)} activeOpacity={0.85}>
                {isSelected ? (
                  <LinearGradient colors={APP_COLORS.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.chip}>
                    <Text style={styles.chipTextSelected}>{g}</Text>
                  </LinearGradient>
                ) : (
                  <View style={[styles.chip, styles.chipUnselected]}>
                    <Text style={styles.chipText}>{g}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )
          })}
        </View>

        <TouchableOpacity onPress={onContinue} disabled={saving} activeOpacity={0.9} style={styles.ctaWrap}>
          <LinearGradient colors={APP_COLORS.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primary}>
            <Text style={styles.primaryText}>Continue</Text>
          </LinearGradient>
        </TouchableOpacity>
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
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: APP_FONTS.body,
    fontSize: 16,
    color: APP_COLORS.textSecondary,
    marginBottom: APP_SPACING.xl,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: APP_SPACING.sm,
  },
  chipWrap: {
    width: '48%',
  },
  chip: {
    paddingVertical: APP_SPACING.md,
    paddingHorizontal: APP_SPACING.md,
    borderRadius: APP_RADIUS.xl,
    alignItems: 'center',
  },
  chipUnselected: {
    backgroundColor: APP_COLORS.backgroundCard,
  },
  chipText: {
    fontFamily: APP_FONTS.bodySemiBold,
    color: APP_COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  chipTextSelected: {
    fontFamily: APP_FONTS.bodyBold,
    color: APP_COLORS.onAccent,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  ctaWrap: {
    marginTop: APP_SPACING.xl,
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
})
