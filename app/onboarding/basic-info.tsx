import { router } from 'expo-router'
import React, { useState } from 'react'
import {
    Alert,
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
import { apiClient } from '../../lib/apiClient'
import { useAuth } from '../../lib/useAuth'

export default function BasicInfo() {
  const { user } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [age, setAge] = useState('')
  const [bio, setBio] = useState('')
  const [loading, setLoading] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [ageError, setAgeError] = useState<string | null>(null)

  const handleContinue = async () => {
    const trimmedName = displayName.trim()
    const parsedAge = parseInt(age, 10)
    const invalidAge = !age.trim() || Number.isNaN(parsedAge) || parsedAge < 18 || parsedAge > 100

    setNameError(trimmedName ? null : 'Name is required')
    setAgeError(invalidAge ? 'Enter a valid age between 18 and 100' : null)
    if (!trimmedName || invalidAge) return

    if (!user) {
      Alert.alert('Error', 'Please sign in to continue')
      return
    }

    setLoading(true)
    try {
      const result = await apiClient.updateProfile(user.id, {
        name: trimmedName,
        age: parsedAge,
        bio: bio.trim() || undefined,
      })

      if (!result.success) {
        throw new Error(result.error || 'Failed to save')
      }

      router.push('./interests' as any)
    } catch (e) {
      console.error('basic-info save error', e)
      Alert.alert('Error', 'Failed to save your information')
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    router.back()
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBack} style={styles.backButton}>
              <Text style={styles.backButtonText}>←</Text>
            </TouchableOpacity>
            <Text style={styles.progressText}>Step 2 of 8</Text>
          </View>

          <View style={styles.formSection}>
            <Text style={styles.title}>Let&apos;s get to know you! 😊</Text>
            <Text style={styles.subtitle}>
              Tell us a bit about yourself to help others connect with you
            </Text>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>What&apos;s your name? *</Text>
              <TextInput
                style={[styles.input, nameError && styles.inputError]}
                value={displayName}
                onChangeText={(value) => {
                  setDisplayName(value)
                  if (nameError && value.trim()) setNameError(null)
                }}
                placeholder="Enter your first name"
                placeholderTextColor="#999"
                autoCapitalize="words"
                maxLength={50}
              />
              {!!nameError && <Text style={styles.errorText}>{nameError}</Text>}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>How old are you? *</Text>
              <TextInput
                style={[styles.input, ageError && styles.inputError]}
                value={age}
                onChangeText={(value) => {
                  const sanitized = value.replace(/[^0-9]/g, '')
                  setAge(sanitized)
                  if (ageError && sanitized) setAgeError(null)
                }}
                placeholder="25"
                placeholderTextColor="#999"
                keyboardType="numeric"
                maxLength={3}
              />
              {!!ageError && <Text style={styles.errorText}>{ageError}</Text>}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Tell us about yourself</Text>
              <TextInput
                style={[styles.input, styles.bioInput]}
                value={bio}
                onChangeText={setBio}
                placeholder="Share something interesting about yourself..."
                placeholderTextColor="#999"
                multiline
                textAlignVertical="top"
                maxLength={300}
              />
              <Text style={styles.charCount}>{bio.length}/300</Text>
            </View>
          </View>
        </ScrollView>

        <View style={styles.bottomSection}>
          <TouchableOpacity 
            style={[styles.continueButton, !displayName.trim() || !age.trim() ? styles.disabledButton : null]} 
            onPress={handleContinue}
            disabled={!displayName.trim() || !age.trim() || loading}
            activeOpacity={0.9}
          >
            <Text style={styles.continueButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 24,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 20,
    color: '#111827',
  },
  progressText: {
    fontSize: 14,
    color: '#fff',
  },
  formSection: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#fff',
  },
  subtitle: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 32,
    lineHeight: 22,
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  errorText: {
    marginTop: 6,
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '500',
  },
  bioInput: {
    height: 100,
    paddingTop: 16,
  },
  charCount: {
    fontSize: 12,
    color: '#fff',
    textAlign: 'right',
    marginTop: 4,
  },
  bottomSection: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  continueButton: {
    backgroundColor: '#FF6B6B',
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
}) 
