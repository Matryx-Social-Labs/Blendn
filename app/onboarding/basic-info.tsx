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
import { supabase } from '../../lib/supabase'

export default function BasicInfo() {
  const [displayName, setDisplayName] = useState('')
  const [age, setAge] = useState('')
  const [bio, setBio] = useState('')
  const [loading, setLoading] = useState(false)

  const handleContinue = async () => {
    if (!displayName.trim()) {
      Alert.alert('Required Field', 'Please enter your name')
      return
    }
    
    if (!age.trim() || parseInt(age) < 18 || parseInt(age) > 100) {
      Alert.alert('Invalid Age', 'Please enter a valid age (18-100)')
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        Alert.alert('Error', 'Please sign in to continue')
        return
      }
      await supabase.from('profiles').update({ name: displayName.trim(), age: parseInt(age) }).eq('id', user.id)
      await supabase
        .from('user_profiles')
        .upsert({ 
          user_id: user.id, 
          display_name: displayName.trim(), 
          age: parseInt(age),
          bio: bio.trim() || null,
        }, { onConflict: 'user_id' })
      router.push('./interests' as any)
    } catch (e) {
      console.error('basic-info save error', e)
      Alert.alert('Error', 'Failed to save your information')
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
            <Text style={styles.title}>Let's get to know you! 😊</Text>
            <Text style={styles.subtitle}>
              Tell us a bit about yourself to help others connect with you
            </Text>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>What's your name? *</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Enter your first name"
                placeholderTextColor="#999"
                autoCapitalize="words"
                maxLength={50}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>How old are you? *</Text>
              <TextInput
                style={styles.input}
                value={age}
                onChangeText={setAge}
                placeholder="25"
                placeholderTextColor="#999"
                keyboardType="numeric"
                maxLength={2}
              />
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
    backgroundColor: '#fff',
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
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 20,
    color: '#333',
  },
  progressText: {
    fontSize: 14,
    color: '#666',
  },
  formSection: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
    lineHeight: 22,
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
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
  bioInput: {
    height: 100,
    paddingTop: 16,
  },
  charCount: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 4,
  },
  bottomSection: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  continueButton: {
    backgroundColor: '#FF6B6B',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
}) 