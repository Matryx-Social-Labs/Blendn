import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import React, { useState } from 'react'
import { KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { useAuth } from '../../lib/useAuth'
import OnboardingHeader from '../../components/OnboardingHeader'
import { useToast } from '../../components/Toast'
import { APP_COLORS, APP_FONTS, APP_RADIUS, APP_SPACING } from '../../lib/theme'

const CTA_GRADIENT: [string, string, string] = [APP_COLORS.accent, APP_COLORS.accentSecondary, APP_COLORS.highlight]
const EMPLOYMENT_TYPES = ['Freelance', 'Full-time', 'Founder']

export default function ProfessionalInfoStep() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [city, setCity] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [employmentType, setEmploymentType] = useState<string | null>(null)
  const [school, setSchool] = useState('')
  const [degree, setDegree] = useState('')
  const [year, setYear] = useState('')
  const [saving, setSaving] = useState(false)

  const goNext = () => router.push('./interests' as any)

  const onContinue = async () => {
    if (!user) {
      showToast('Please sign in to continue', 'error')
      return
    }
    setSaving(true)
    try {
      const occupationParts = [jobTitle.trim(), employmentType].filter(Boolean)
      const occupation = occupationParts.length > 0 ? occupationParts.join(' · ') : undefined

      const educationParts = [school.trim(), [degree.trim(), year.trim()].filter(Boolean).join(' \'')].filter(Boolean)
      const education = educationParts.length > 0 ? educationParts.join(' · ') : undefined

      // Note: `city` is intentionally not persisted — `location` already holds the real
      // "lat,lng" GPS coordinate saved by the previous (location.tsx) step; overwriting it
      // with free-text city input here would corrupt distance/nearby-event calculations
      // elsewhere in the app. No separate city field exists on the schema to hold this.
      const result = await apiClient.updateProfile(user.id, {
        occupation,
        education,
      })
      if (!result.success) throw new Error(result.error || 'Failed to save')
      goNext()
    } catch (e) {
      Logger.error('profile', 'Onboarding professional-info step error', { error: e })
      showToast('Failed to save your details', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <OnboardingHeader currentStep={5} totalSteps={9} onBack={() => router.back()} onSkip={goNext} />

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Your journey</Text>
          <Text style={styles.subtitle}>
            Almost there. Fill in your professional and educational milestones to craft your unique narrative.
          </Text>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconWrap}>
                <Ionicons name="location-outline" size={20} color={APP_COLORS.textSecondary} />
              </View>
              <View style={styles.cardHeaderText}>
                <Text style={styles.cardTitle}>Current Base</Text>
                <Text style={styles.cardSubtitle}>Where are you making your impact?</Text>
              </View>
            </View>
            <TextInput
              style={styles.input}
              value={city}
              onChangeText={setCity}
              placeholder="Search city..."
              placeholderTextColor={APP_COLORS.textTertiary}
            />
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconWrap}>
                <Ionicons name="briefcase-outline" size={20} color={APP_COLORS.textSecondary} />
              </View>
              <View style={styles.cardHeaderText}>
                <Text style={styles.cardTitle}>Occupation</Text>
                <Text style={styles.cardSubtitle}>Your professional identity and title.</Text>
              </View>
            </View>
            <TextInput
              style={styles.input}
              value={jobTitle}
              onChangeText={setJobTitle}
              placeholder="Job Title (e.g. Creative Director)"
              placeholderTextColor={APP_COLORS.textTertiary}
            />
            <View style={styles.chipRow}>
              {EMPLOYMENT_TYPES.map((type) => {
                const isSel = employmentType === type
                return (
                  <TouchableOpacity
                    key={type}
                    style={[styles.chip, isSel && styles.chipSelected]}
                    onPress={() => setEmploymentType(isSel ? null : type)}
                  >
                    <Text style={[styles.chipText, isSel && styles.chipTextSelected]}>{type}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconWrap}>
                <Ionicons name="school-outline" size={20} color={APP_COLORS.textSecondary} />
              </View>
              <View style={styles.cardHeaderText}>
                <Text style={styles.cardTitle}>Education</Text>
                <Text style={styles.cardSubtitle}>The foundation of your knowledge.</Text>
              </View>
            </View>
            <TextInput
              style={styles.input}
              value={school}
              onChangeText={setSchool}
              placeholder="School / University Name"
              placeholderTextColor={APP_COLORS.textTertiary}
            />
            <View style={styles.dualInputRow}>
              <TextInput
                style={[styles.input, styles.dualInput]}
                value={degree}
                onChangeText={setDegree}
                placeholder="Degree"
                placeholderTextColor={APP_COLORS.textTertiary}
              />
              <TextInput
                style={[styles.input, styles.dualInput]}
                value={year}
                onChangeText={(v) => setYear(v.replace(/[^0-9]/g, '').slice(0, 4))}
                placeholder="Year"
                placeholderTextColor={APP_COLORS.textTertiary}
                keyboardType="numeric"
                maxLength={4}
              />
            </View>
          </View>

          <TouchableOpacity onPress={onContinue} disabled={saving} activeOpacity={0.9} style={styles.ctaWrap}>
            <LinearGradient colors={CTA_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primary}>
              <Text style={styles.primaryText}>Continue Exploration</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={goNext} disabled={saving} style={styles.draftLink}>
            <Text style={styles.draftLinkText}>Save as Draft</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
    fontSize: 15,
    color: APP_COLORS.textSecondary,
    lineHeight: 21,
    marginBottom: APP_SPACING['2xl'],
  },
  card: {
    backgroundColor: APP_COLORS.backgroundElevated,
    borderRadius: APP_RADIUS['2xl'],
    padding: APP_SPACING.lg,
    marginBottom: APP_SPACING.lg,
    gap: APP_SPACING.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: APP_SPACING.md,
  },
  cardIconWrap: {
    width: 48,
    height: 48,
    borderRadius: APP_RADIUS.lg,
    backgroundColor: APP_COLORS.backgroundCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderText: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontFamily: APP_FONTS.heading,
    fontSize: 16,
    fontWeight: '700',
    color: APP_COLORS.textPrimary,
  },
  cardSubtitle: {
    fontFamily: APP_FONTS.body,
    fontSize: 13,
    color: APP_COLORS.textSecondary,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
    borderRadius: APP_RADIUS.pill,
    paddingHorizontal: APP_SPACING.lg,
    paddingVertical: APP_SPACING.md,
    fontSize: 15,
    fontFamily: APP_FONTS.body,
    backgroundColor: APP_COLORS.backgroundInput,
    color: APP_COLORS.textPrimary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: APP_SPACING.xs,
  },
  chip: {
    paddingHorizontal: APP_SPACING.md,
    paddingVertical: APP_SPACING.xs,
    borderRadius: APP_RADIUS.pill,
    backgroundColor: APP_COLORS.backgroundCard,
  },
  chipSelected: {
    backgroundColor: APP_COLORS.accent,
  },
  chipText: {
    fontFamily: APP_FONTS.bodyMedium,
    fontSize: 13,
    fontWeight: '500',
    color: APP_COLORS.textSecondary,
  },
  chipTextSelected: {
    color: APP_COLORS.onAccent,
    fontFamily: APP_FONTS.bodyBold,
    fontWeight: '700',
  },
  dualInputRow: {
    flexDirection: 'row',
    gap: APP_SPACING.sm,
  },
  dualInput: {
    flex: 1,
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
  draftLink: {
    marginTop: APP_SPACING.md,
    alignItems: 'center',
  },
  draftLinkText: {
    fontFamily: APP_FONTS.bodyMedium,
    color: APP_COLORS.textSecondary,
    fontSize: 14,
  },
})
