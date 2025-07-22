import { router } from 'expo-router'
import React, { useState } from 'react'
import {
    Alert,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native'

export default function Photos() {
  const [photoCount, setPhotoCount] = useState(0)

  const handleAddPhoto = () => {
    // Placeholder for photo picker implementation
    Alert.alert(
      'Photo Upload', 
      'Photo upload feature will be implemented with image picker library',
      [{ text: 'OK' }]
    )
    if (photoCount < 6) {
      setPhotoCount(prev => prev + 1)
    }
  }

  const handleContinue = () => {
    router.push('./complete' as any)
  }

  const handleSkip = () => {
    router.push('./complete' as any)
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
          <Text style={styles.progressText}>Step 4 of 5</Text>
        </View>

        <View style={styles.mainContent}>
          <Text style={styles.title}>Show your best self! 📸</Text>
          <Text style={styles.subtitle}>
            Add some photos to help others get to know you better
          </Text>

          <View style={styles.photosGrid}>
            {[1, 2, 3, 4, 5, 6].map((index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.photoSlot,
                  index <= photoCount ? styles.filledPhotoSlot : styles.emptyPhotoSlot
                ]}
                onPress={handleAddPhoto}
              >
                {index <= photoCount ? (
                  <Text style={styles.photoEmoji}>📷</Text>
                ) : (
                  <Text style={styles.plusIcon}>+</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.photoTip}>
            💡 Tip: Photos with your face clearly visible get more matches!
          </Text>
        </View>

        <View style={styles.bottomSection}>
          <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
            <Text style={styles.continueButtonText}>
              {photoCount > 0 ? 'Continue' : 'Continue without photos'}
            </Text>
          </TouchableOpacity>
          
          {photoCount === 0 && (
            <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
              <Text style={styles.skipButtonText}>Skip for now</Text>
            </TouchableOpacity>
          )}
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
  mainContent: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 40,
    lineHeight: 22,
    textAlign: 'center',
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 300,
    marginBottom: 32,
  },
  photoSlot: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPhotoSlot: {
    backgroundColor: '#f0f0f0',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#ccc',
  },
  filledPhotoSlot: {
    backgroundColor: '#FF6B6B',
  },
  plusIcon: {
    fontSize: 24,
    color: '#999',
  },
  photoEmoji: {
    fontSize: 24,
    color: '#fff',
  },
  photoTip: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
    paddingHorizontal: 16,
  },
  bottomSection: {
    paddingBottom: 32,
  },
  continueButton: {
    backgroundColor: '#FF6B6B',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  skipButton: {
    padding: 12,
    alignItems: 'center',
  },
  skipButtonText: {
    color: '#666',
    fontSize: 16,
  },
}) 