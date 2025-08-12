import { router } from 'expo-router'
import React, { useState } from 'react'
import {
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native'
import { supabase } from '../../lib/supabase'

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
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])

  const handleInterestToggle = (interest: string) => {
    if (selectedInterests.includes(interest)) {
      setSelectedInterests(prev => prev.filter(i => i !== interest))
    } else if (selectedInterests.length < 10) {
      setSelectedInterests(prev => [...prev, interest])
    }
  }

  const handleContinue = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        alert('Please sign in to continue')
        return
      }
      await supabase
        .from('user_profiles')
        .update({ interests: selectedInterests })
        .eq('user_id', user.id)
      router.push('./goals' as any)
    } catch (e) {
      console.error(e)
      alert('Failed to save interests')
    }
  }

  const handleBack = () => {
    router.back()
  }

  const renderInterest = ({ item }: { item: string }) => {
    const isSelected = selectedInterests.includes(item)
    return (
      <TouchableOpacity
        style={[
          styles.interestChip,
          isSelected ? styles.selectedInterest : styles.unselectedInterest
        ]}
        onPress={() => handleInterestToggle(item)}
      >
        <Text style={[
          styles.interestText,
          isSelected ? styles.selectedInterestText : styles.unselectedInterestText
        ]}>
          {item}
        </Text>
      </TouchableOpacity>
    )
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
  scrollContent: {
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
    marginBottom: 24,
    lineHeight: 22,
  },
  selectedContainer: {
    marginBottom: 16,
  },
  selectedText: {
    fontSize: 14,
    color: '#FF6B6B',
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