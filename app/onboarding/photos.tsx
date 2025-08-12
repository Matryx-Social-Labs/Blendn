import { router } from 'expo-router'
import React, { useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    Image,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native'
import { PhotoUploadResult, selectAndUploadPhoto } from '../../lib/photoUtils'
import { supabase } from '../../lib/supabase'

interface PhotoSlot {
  id: string
  url?: string
  uploading?: boolean
}

export default function Photos() {
  const [photos, setPhotos] = useState<PhotoSlot[]>([
    { id: '1' }, { id: '2' }, { id: '3' }, 
    { id: '4' }, { id: '5' }, { id: '6' }
  ])
  const [uploading, setUploading] = useState(false)

  const handleAddPhoto = async (slotIndex: number) => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        Alert.alert('Error', 'Please sign in to upload photos')
        return
      }

      // Mark this slot as uploading
      setPhotos(prev => prev.map((photo, index) => 
        index === slotIndex ? { ...photo, uploading: true } : photo
      ))
      setUploading(true)

      // Select and upload photo
      const result: PhotoUploadResult = await selectAndUploadPhoto(user.id)

      if (result.success && result.url) {
        // Update the photo slot with the uploaded URL
        setPhotos(prev => prev.map((photo, index) => 
          index === slotIndex 
            ? { ...photo, url: result.url, uploading: false } 
            : photo
        ))
      } else {
        // Remove uploading state on failure
        setPhotos(prev => prev.map((photo, index) => 
          index === slotIndex ? { ...photo, uploading: false } : photo
        ))
        
        if (result.error && result.error !== 'User cancelled') {
          Alert.alert('Upload Failed', result.error)
        }
      }
    } catch (error) {
      console.error('Error uploading photo:', error)
      Alert.alert('Error', 'Failed to upload photo. Please try again.')
      
      // Remove uploading state
      setPhotos(prev => prev.map((photo, index) => 
        index === slotIndex ? { ...photo, uploading: false } : photo
      ))
    } finally {
      setUploading(false)
    }
  }

  const handleRemovePhoto = (slotIndex: number) => {
    Alert.alert(
      'Remove Photo',
      'Are you sure you want to remove this photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setPhotos(prev => prev.map((photo, index) => 
              index === slotIndex ? { id: photo.id } : photo
            ))
          }
        }
      ]
    )
  }

  const uploadedPhotos = photos.filter(photo => photo.url)
  const photoUrls = uploadedPhotos.map(photo => photo.url!)

  const handleContinue = () => {
    // Persist to user_profiles now as well
    if (photoUrls.length > 0) {
      supabase.auth.getUser().then(async ({ data: { user } }) => {
        if (user) {
          try {
            await supabase.from('user_profiles').update({ profile_photos: photoUrls }).eq('user_id', user.id)
          } catch {}
        }
      })
    }
    // Next: Location permissions step
    router.push('./location' as any)
  }

  const handleSkip = () => {
    // proceed without photos -> go to location step
    router.push('./location' as any)
  }

  const handleBack = () => {
    router.back()
  }

  const renderPhotoSlot = (photo: PhotoSlot, index: number) => {
    const hasPhoto = !!photo.url
    const isUploading = !!photo.uploading
    
    return (
      <TouchableOpacity
        key={photo.id}
        style={[
          styles.photoSlot,
          hasPhoto ? styles.filledPhotoSlot : styles.emptyPhotoSlot
        ]}
        onPress={() => hasPhoto ? handleRemovePhoto(index) : handleAddPhoto(index)}
        disabled={uploading}
      >
        {isUploading ? (
          <View style={styles.uploadingContainer}>
            <ActivityIndicator size="small" color="#FF6B6B" />
            <Text style={styles.uploadingText}>Uploading...</Text>
          </View>
        ) : hasPhoto ? (
          <>
            <Image source={{ uri: photo.url }} style={styles.photoImage} />
            <View style={styles.removeOverlay}>
              <Text style={styles.removeIcon}>×</Text>
            </View>
          </>
        ) : (
          <Text style={styles.plusIcon}>+</Text>
        )}
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
          <Text style={styles.progressText}>Step 6 of 8</Text>
        </View>

        <View style={styles.mainContent}>
          <Text style={styles.title}>Show your best self! 📸</Text>
          <Text style={styles.subtitle}>
            Add some photos to help others get to know you better
          </Text>

          <View style={styles.photosGrid}>
            {photos.map((photo, index) => renderPhotoSlot(photo, index))}
          </View>

          <Text style={styles.photoTip}>
            💡 Tip: Photos with your face clearly visible get more matches!
          </Text>
          
          {uploadedPhotos.length > 0 && (
            <Text style={styles.photoCount}>
              {uploadedPhotos.length} photo{uploadedPhotos.length !== 1 ? 's' : ''} added
            </Text>
          )}
        </View>

        <View style={styles.bottomSection}>
          <TouchableOpacity 
            style={[styles.continueButton, uploading && styles.disabledButton]} 
            onPress={handleContinue}
            disabled={uploading}
          >
            <Text style={styles.continueButtonText}>
              {uploadedPhotos.length > 0 ? 'Continue' : 'Continue without photos'}
            </Text>
          </TouchableOpacity>
          
          {uploadedPhotos.length === 0 && !uploading && (
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
    color: '#666',
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
    color: '#666',
    fontSize: 16,
  },
}) 