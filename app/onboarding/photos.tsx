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
import OnboardingProgressBar from '../../components/OnboardingProgressBar'
import PhotoManager from '../../components/PhotoManager'
import { SkeletonBlock, SkeletonLine } from '../../components/Skeleton'
import { useAuth } from '../../lib/useAuth'

export default function Photos() {
  const { user, loading: authLoading } = useAuth()
  const [photos, setPhotos] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const handlePhotosChange = (newPhotos: string[]) => {
    setPhotos(newPhotos)
  }

  const handleContinue = async () => {
    // Photos are saved by PhotoManager component directly
    // Just navigate to next step
    router.push('./location' as any)
  }

  const handleSkip = () => {
    // Proceed without photos -> go to location step
    router.push('./location' as any)
  }

  const handleBack = () => {
    router.back()
  }

  const renderPhotoSection = () => {
    if (authLoading || !user) {
      return (
        <View>
          <SkeletonBlock width={'100%'} height={160} borderRadius={12} style={styles.photoManager} />
          <SkeletonLine width={'60%'} />
        </View>
      )
    }

    return (
      <PhotoManager
        userId={user.id}
        maxPhotos={6}
        editable={true}
        onPhotosChange={handlePhotosChange}
        style={styles.photoManager}
      />
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <OnboardingProgressBar currentStep={6} totalSteps={8} />
        </View>

        <View style={styles.mainContent}>
          <Text style={styles.title}>Show your best self! 📸</Text>
          <Text style={styles.subtitle}>
            Add some photos to help others get to know you better
          </Text>

          <View style={styles.photosSection}>
            {renderPhotoSection()}
          </View>

          <Text style={styles.photoTip}>
            💡 Tip: Photos with your face clearly visible get more matches!
          </Text>
          
          {photos.length > 0 && (
            <Text style={styles.photoCount}>
              {photos.length} photo{photos.length !== 1 ? 's' : ''} added
            </Text>
          )}
        </View>

        <View style={styles.bottomSection}>
          <TouchableOpacity 
            style={[styles.continueButton, loading && styles.disabledButton]} 
            onPress={handleContinue}
            disabled={loading}
          >
            <Text style={styles.continueButtonText}>
              {photos.length > 0 ? 'Continue' : 'Continue without photos'}
            </Text>
          </TouchableOpacity>
          
          {photos.length === 0 && !loading && (
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
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 20,
    color: '#fff',
  },
  progressText: {
    fontSize: 14,
    color: '#fff',
  },
  mainContent: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#fff',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#fff',
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
    overflow: 'hidden',
  },
  emptyPhotoSlot: {
    backgroundColor: '#f0f0f0',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#ccc',
  },
  filledPhotoSlot: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  photoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 11,
  },
  uploadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadingText: {
    fontSize: 12,
    color: '#FF6B6B',
    marginTop: 4,
  },
  removeOverlay: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeIcon: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
  },
  plusIcon: {
    fontSize: 24,
    color: '#999',
  },
  photoTip: {
    fontSize: 14,
    color: '#fff',
    textAlign: 'center',
    fontStyle: 'italic',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  photoCount: {
    fontSize: 14,
    color: '#FF6B6B',
    fontWeight: '600',
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
  disabledButton: {
    opacity: 0.6,
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
    color: '#fff',
    fontSize: 16,
  },
  photosSection: {
    width: '100%',
    maxWidth: 350,
    marginBottom: 32,
  },
  photoManager: {
    marginVertical: 8,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  loadingText: {
    fontSize: 16,
    color: '#fff',
  },
}) 