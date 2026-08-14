import { router } from 'expo-router'
import React, { useRef, useState } from 'react'
import {
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { useAuth } from '../../lib/useAuth'
import OnboardingHeader from '../../components/OnboardingHeader'
import { useToast } from '../../components/Toast'
import { APP_COLORS, APP_FONTS, APP_RADIUS, APP_SPACING } from '../../lib/theme'

const MIN_AGE = 18
const MAX_AGE = 100

function computeAge(day: string, month: string, year: string): number | null {
  const d = parseInt(day, 10)
  const m = parseInt(month, 10)
  const y = parseInt(year, 10)
  if (!d || !m || !y || y < 1900) return null

  const dob = new Date(y, m - 1, d)
  if (dob.getFullYear() !== y || dob.getMonth() !== m - 1 || dob.getDate() !== d) return null

  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const hasHadBirthdayThisYear = now.getMonth() > dob.getMonth()
    || (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate())
  if (!hasHadBirthdayThisYear) age -= 1
  return age
}

export default function BasicInfo() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [displayName, setDisplayName] = useState('')
  const [day, setDay] = useState('')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState('')
  const [loading, setLoading] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [dobError, setDobError] = useState<string | null>(null)
  const monthRef = useRef<TextInput>(null)
  const yearRef = useRef<TextInput>(null)

  const handleContinue = async () => {
    const trimmedName = displayName.trim()
    const age = computeAge(day, month, year)
    const invalidAge = age === null || age < MIN_AGE || age > MAX_AGE

    setNameError(trimmedName ? null : 'Name is required')
    setDobError(invalidAge ? `You must be between ${MIN_AGE} and ${MAX_AGE} years old` : null)
    if (!trimmedName || invalidAge || age === null) return

    if (!user) {
      showToast('Please sign in to continue', 'error')
      return
    }

    setLoading(true)
    try {
      const result = await apiClient.updateProfile(user.id, {
        name: trimmedName,
        age,
      })

      if (!result.success) {
        throw new Error(result.error || 'Failed to save')
      }

      router.push('./notifications' as any)
    } catch (e) {
      Logger.error('profile', 'Onboarding basic-info save error', { error: e })
      showToast('Failed to save your information', 'error')
    } finally {
      setLoading(false)
    }
  }

  const canContinue = !!displayName.trim() && day.length > 0 && month.length > 0 && year.length === 4

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <OnboardingHeader currentStep={1} totalSteps={9} onBack={() => router.back()} />

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.formSection}>
            <Text style={styles.title}>The basics</Text>
            <Text style={styles.subtitle}>
              Tell us a bit about yourself to help others connect with you
            </Text>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>FIRST NAME</Text>
              <TextInput
                style={[styles.input, nameError && styles.inputError]}
                value={displayName}
                onChangeText={(value) => {
                  setDisplayName(value)
                  if (nameError && value.trim()) setNameError(null)
                }}
                placeholder="e.g. Julian"
                placeholderTextColor={APP_COLORS.textTertiary}
                autoCapitalize="words"
                maxLength={50}
                returnKeyType="next"
              />
              {!!nameError && <Text style={styles.errorText}>{nameError}</Text>}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>DATE OF BIRTH</Text>
              <View style={styles.dobRow}>
                <TextInput
                  style={[styles.input, styles.dobInput, dobError && styles.inputError]}
                  value={day}
                  onChangeText={(v) => {
                    const sanitized = v.replace(/[^0-9]/g, '').slice(0, 2)
                    setDay(sanitized)
                    if (sanitized.length === 2) monthRef.current?.focus()
                  }}
                  placeholder="DD"
                  placeholderTextColor={APP_COLORS.textTertiary}
                  keyboardType="numeric"
                  maxLength={2}
                  textAlign="center"
                />
                <TextInput
                  ref={monthRef}
                  style={[styles.input, styles.dobInput, dobError && styles.inputError]}
                  value={month}
                  onChangeText={(v) => {
                    const sanitized = v.replace(/[^0-9]/g, '').slice(0, 2)
                    setMonth(sanitized)
                    if (sanitized.length === 2) yearRef.current?.focus()
                  }}
                  placeholder="MM"
                  placeholderTextColor={APP_COLORS.textTertiary}
                  keyboardType="numeric"
                  maxLength={2}
                  textAlign="center"
                />
                <TextInput
                  ref={yearRef}
                  style={[styles.input, styles.dobInputYear, dobError && styles.inputError]}
                  value={year}
                  onChangeText={(v) => setYear(v.replace(/[^0-9]/g, '').slice(0, 4))}
                  placeholder="YYYY"
                  placeholderTextColor={APP_COLORS.textTertiary}
                  keyboardType="numeric"
                  maxLength={4}
                  textAlign="center"
                />
              </View>
              {dobError ? (
                <Text style={styles.errorText}>{dobError}</Text>
              ) : (
                <Text style={styles.helperText}>Your age will be private and used only for verification.</Text>
              )}
            </View>
          </View>

          <View style={styles.curationCard}>
            <Text style={styles.curationLabel}>CURATION PHASE</Text>
            <Text style={styles.curationText}>Personalizing your Blend&apos;n experience...</Text>
          </View>
        </ScrollView>

        <View style={styles.bottomSection}>
          <TouchableOpacity
            onPress={handleContinue}
            disabled={!canContinue || loading}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={canContinue ? APP_COLORS.accentGradient : APP_CTA_DISABLED}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.continueButton}
            >
              <Text style={styles.continueButtonText}>Continue Journey</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const APP_CTA_DISABLED: [string, string] = ['rgba(255,144,109,0.4)', 'rgba(255,109,141,0.4)']

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: APP_COLORS.backgroundBase,
  },
  content: {
    flex: 1,
    paddingHorizontal: APP_SPACING.xl,
  },
  formSection: {
    marginBottom: APP_SPACING['2xl'],
  },
  title: {
    fontFamily: APP_FONTS.headingExtraBold,
    fontSize: 32,
    fontWeight: '800',
    marginBottom: APP_SPACING.xs,
    color: APP_COLORS.textPrimary,
  },
  subtitle: {
    fontFamily: APP_FONTS.body,
    fontSize: 16,
    color: APP_COLORS.textSecondary,
    marginBottom: APP_SPACING['2xl'],
    lineHeight: 22,
  },
  inputContainer: {
    marginBottom: APP_SPACING.xl,
  },
  label: {
    fontFamily: APP_FONTS.bodyBold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: APP_COLORS.textSecondary,
    marginBottom: APP_SPACING.sm,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
    borderRadius: APP_RADIUS.pill,
    paddingHorizontal: APP_SPACING.lg,
    paddingVertical: APP_SPACING.md,
    fontSize: 16,
    fontFamily: APP_FONTS.body,
    backgroundColor: APP_COLORS.backgroundInput,
    color: APP_COLORS.textPrimary,
  },
  inputError: {
    borderColor: APP_COLORS.destructive,
  },
  errorText: {
    marginTop: APP_SPACING.xs,
    color: APP_COLORS.destructive,
    fontSize: 12,
    fontWeight: '500',
  },
  helperText: {
    marginTop: APP_SPACING.xs,
    color: APP_COLORS.textTertiary,
    fontSize: 12,
  },
  dobRow: {
    flexDirection: 'row',
    gap: APP_SPACING.sm,
  },
  dobInput: {
    flex: 1,
  },
  dobInputYear: {
    flex: 1.6,
  },
  curationCard: {
    backgroundColor: APP_COLORS.backgroundElevated,
    borderRadius: APP_RADIUS['2xl'],
    padding: APP_SPACING.xl,
    marginBottom: APP_SPACING.xl,
    gap: APP_SPACING.xs,
  },
  curationLabel: {
    fontFamily: APP_FONTS.bodyBold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: APP_COLORS.accent,
  },
  curationText: {
    fontFamily: APP_FONTS.body,
    fontSize: 14,
    color: APP_COLORS.textSecondary,
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
