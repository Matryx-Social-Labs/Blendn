import { router } from 'expo-router'
import React, { useState } from 'react'
import {
    Alert,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native'
import { apiClient } from '../../lib/apiClient'
import { useAuth } from '../../lib/useAuth'

const INTERESTS = [
  '🎵 Music', '🎬 Movies', '📚 Reading', '🏃‍♀️ Running', 
  '🧘‍♀️ Yoga', '🍳 Cooking', '📸 Photography', '🎨 Art',
  '🏔️ Hiking', '🏊‍♀️ Swimming', '⚽ Sports', '🎮 Gaming',
  '✈️ Travel', '🍕 Food', '🏖️ Beach', '🎪 Comedy',
  '💃 Dancing', '🏋️‍♀️ Fitness', '🧩 Puzzles', '🎭 Theater',
  '🎸 Guitar', '📱 Tech', '🌱 Gardening', '🐕 Pets',
  '🎯 Darts', '🎳 Bowling', '🏆 Competitions', '🧠 Learning'
]

export default function Interests() {
  const { user } = useAuth()
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])

  const handleInterestToggle = (interest: string) => {
    if (selectedInterests.includes(interest)) {
      setSelectedInterests(prev => prev.filter(i => i !== interest))
    } else if (selectedInterests.length < 10) {
      setSelectedInterests(prev => [...prev, interest])
    }
  }

  const handleContinue = async () => {
    if (!user) {
      Alert.alert('Error', 'Please sign in to continue')
      return
    }
    try {
      const result = await apiClient.updateProfile(user.id, {
        interests: selectedInterests,
      })
      if (!result.success) {
        throw new Error(result.error || 'Failed to save')
      }
      router.push('./goals' as any)
    } catch (e) {
      console.error(e)
      Alert.alert('Error', 'Failed to save interests')
    }
  }

  const handleBack = () => {
    router.back()
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.progressText}>Step 3 of 8</Text>
        </View>

        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>What are you into? 🎯</Text>
          <Text style={styles.subtitle}>
            Select up to 10 interests to help us find your perfect matches
          </Text>

          <View style={styles.selectedContainer}>
            <Text style={styles.selectedText}>
              Selected: {selectedInterests.length}/10
            </Text>
          </View>

          <View style={styles.interestsGrid}>
            {INTERESTS.map((interest, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.interestChip,
                  selectedInterests.includes(interest) ? styles.selectedInterest : styles.unselectedInterest
                ]}
                onPress={() => handleInterestToggle(interest)}
              >
                <Text style={[
                  styles.interestText,
                  selectedInterests.includes(interest) ? styles.selectedInterestText : styles.unselectedInterestText
                ]}>
                  {interest}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <View style={styles.bottomSection}>
          <TouchableOpacity 
            style={[
              styles.continueButton, 
              selectedInterests.length === 0 ? styles.disabledButton : null
            ]} 
            onPress={handleContinue}
            disabled={selectedInterests.length === 0}
            activeOpacity={0.9}
          >
            <Text style={styles.continueButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
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
  scrollContent: {
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
    marginBottom: 24,
    lineHeight: 22,
  },
  selectedContainer: {
    marginBottom: 16,
  },
  selectedText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
  interestsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingBottom: 20,
  },
  interestChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 12,
    minWidth: '45%',
    alignItems: 'center',
  },
  selectedInterest: {
    backgroundColor: '#FF6B6B',
  },
  unselectedInterest: {
    backgroundColor: '#f0f0f0',
  },
  interestText: {
    fontSize: 14,
    fontWeight: '500',
  },
  selectedInterestText: {
    color: '#fff',
  },
  unselectedInterestText: {
    color: '#333',
  },
  bottomSection: {
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
