import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native'
import {
    cachePhoto,
    deletePhoto,
    getOptimizedImageUrl,
    getUserPhotos,
    ProfilePhoto,
    reorderPhotos,
    selectAndUploadPhoto
} from '../lib/photoUtils'

const { width } = Dimensions.get('window')
const PHOTO_SIZE = (width - 48) / 3 // 3 photos per row with padding

interface PhotoManagerProps {
  userId: string
  maxPhotos?: number
  editable?: boolean
  onPhotosChange?: (photos: string[]) => void
  style?: any
}

export default function PhotoManager({ 
  userId, 
  maxPhotos = 6, 
  editable = true, 
  onPhotosChange,
  style 
}: PhotoManagerProps) {
  const [photos, setPhotos] = useState<ProfilePhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [cachedUrls, setCachedUrls] = useState<Record<string, string>>({})
  const onPhotosChangeRef = useRef<PhotoManagerProps['onPhotosChange']>()

  useEffect(() => {
    loadPhotos()
  }, [userId])

  // Keep a stable reference to onPhotosChange to avoid triggering effects due to identity changes
  useEffect(() => {
    onPhotosChangeRef.current = onPhotosChange
  }, [onPhotosChange])

  // Notify parent only when photos actually change
  useEffect(() => {
    if (onPhotosChangeRef.current) {
      onPhotosChangeRef.current(photos.map(p => p.url))
    }
  }, [photos])

  const loadPhotos = async () => {
    try {
      setLoading(true)
      const userPhotos = await getUserPhotos(userId)
      setPhotos(userPhotos)
      
      // Pre-cache photos for better performance
      userPhotos.forEach(photo => {
        cachePhoto(photo.url).then(localPath => {
          if (localPath) {
            setCachedUrls(prev => ({ ...prev, [photo.url]: localPath }))
          }
        })
      })
    } catch (error) {
      console.error('PhotoManager: Load photos error', { error, userId })
    } finally {
      setLoading(false)
    }
  }

  const handleAddPhoto = async () => {
    if (photos.length >= maxPhotos) {
      Alert.alert('Photo Limit', `You can only have up to ${maxPhotos} photos`)
      return
    }

    if (!editable) return

    setUploading(true)
    try {
      const result = await selectAndUploadPhoto(userId)

      if (result.success && result.url) {
        const newPhoto: ProfilePhoto = {
          id: `${userId}_${photos.length}`,
          url: result.url,
          order: photos.length,
          isPrimary: photos.length === 0,
          metadata: result.metadata ? {
            ...result.metadata,
            uploadedAt: new Date().toISOString()
          } : undefined
        }

        setPhotos(prev => [...prev, newPhoto])
        
        // Update database
        const newPhotoUrls = [...photos.map(p => p.url), result.url]
        await reorderPhotos(userId, newPhotoUrls)
        
        console.log('PhotoManager: Photo added', { userId, url: result.url })
      } else if (result.error && result.error !== 'User cancelled') {
        Alert.alert('Upload Failed', result.error)
      }
    } catch (error) {
      console.error('PhotoManager: Add photo error', { error, userId })
      Alert.alert('Error', 'Failed to upload photo')
    } finally {
      setUploading(false)
    }
  }

  const handleRemovePhoto = (photoIndex: number) => {
    if (!editable) return

    const photo = photos[photoIndex]
    
    Alert.alert(
      'Remove Photo',
      'Are you sure you want to remove this photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              // Remove from state immediately for better UX
              const newPhotos = photos.filter((_, index) => index !== photoIndex)
              setPhotos(newPhotos)
              
              // Update database
              const newPhotoUrls = newPhotos.map(p => p.url)
              await reorderPhotos(userId, newPhotoUrls)
              
              // Delete from storage in background
              deletePhoto(photo.url).catch(error => {
                console.error('PhotoManager: Delete photo error', { error, url: photo.url })
              })
              
              console.log('PhotoManager: Photo removed', { userId, url: photo.url })
            } catch (error) {
              console.error('PhotoManager: Remove photo error', { error, userId })
              Alert.alert('Error', 'Failed to remove photo')
              // Reload photos to restore state
              loadPhotos()
            }
          }
        }
      ]
    )
  }

  const handleReorderPhotos = async (newData: ProfilePhoto[]) => {
    if (!editable) return

    setReordering(true)
    try {
      // Update order property
      const reorderedPhotos = newData.map((photo, index) => ({
        ...photo,
        order: index,
        isPrimary: index === 0
      }))

      setPhotos(reorderedPhotos)
      
      // Update database
      const newPhotoUrls = reorderedPhotos.map(p => p.url)
      const success = await reorderPhotos(userId, newPhotoUrls)
      
      if (!success) {
        Alert.alert('Error', 'Failed to reorder photos')
        loadPhotos() // Reload original order
      } else {
        console.log('PhotoManager: Photos reordered', { userId, count: reorderedPhotos.length })
      }
    } catch (error) {
      console.error('PhotoManager: Reorder error', { error, userId })
      Alert.alert('Error', 'Failed to reorder photos')
      loadPhotos()
    } finally {
      setReordering(false)
    }
  }

  const renderPhoto = useCallback(({ item, index }: { item: ProfilePhoto; index: number }) => {
    const cachedUrl = cachedUrls[item.url]
    const optimizedUrl = getOptimizedImageUrl(item.url, {
      width: Math.round(PHOTO_SIZE * 2), // 2x for retina
      height: Math.round(PHOTO_SIZE * 2),
      quality: 80,
      resize: 'cover',
      format: 'webp'
    })

    return (
      <View style={styles.photoContainer}>
        <TouchableOpacity
          style={[styles.photo, { width: PHOTO_SIZE, height: PHOTO_SIZE }]}
          onLongPress={editable ? () => handleRemovePhoto(index) : undefined}
          activeOpacity={0.8}
        >
          <Image
            source={{ uri: cachedUrl || optimizedUrl || item.url }}
            style={styles.photoImage}
            contentFit="cover"
            placeholder={require('../assets/images/icon.png')}
            transition={200}
            cachePolicy="memory-disk"
          />
          
          {item.isPrimary && (
            <View style={styles.primaryBadge}>
              <Text style={styles.primaryText}>PRIMARY</Text>
            </View>
          )}
          
          {editable && (
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => handleRemovePhoto(index)}
            >
              <Ionicons name="close-circle" size={24} color="#FF4444" />
            </TouchableOpacity>
          )}
          
          {editable && (
            <View style={styles.dragHandle}>
              <Text style={styles.dragText}>Hold to remove</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    )
  }, [cachedUrls, editable, handleRemovePhoto])

  const renderAddPhoto = () => {
    if (!editable || photos.length >= maxPhotos) return null

    return (
      <TouchableOpacity
        style={[styles.addPhoto, { width: PHOTO_SIZE, height: PHOTO_SIZE }]}
        onPress={handleAddPhoto}
        disabled={uploading}
      >
        {uploading ? (
          <ActivityIndicator size="small" color="#7C3AED" />
        ) : (
          <>
            <Ionicons name="add" size={32} color="#7C3AED" />
            <Text style={styles.addPhotoText}>Add Photo</Text>
          </>
        )}
      </TouchableOpacity>
    )
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer, style]}>
        <ActivityIndicator size="large" color="#7C3AED" />
        <Text style={styles.loadingText}>Loading photos...</Text>
      </View>
    )
  }

  const data = [...photos]
  if (editable && photos.length < maxPhotos) {
    // Add placeholder for add button
    data.push({
      id: 'add_photo',
      url: '',
      order: photos.length,
      isPrimary: false
    } as ProfilePhoto)
  }

  return (
    <View style={[styles.container, style]}>
      <View style={styles.header}>
        <Text style={styles.title}>Photos ({photos.length}/{maxPhotos})</Text>
        {editable && photos.length > 1 && (
          <Text style={styles.hint}>Hold and drag to reorder</Text>
        )}
      </View>

      {photos.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="camera-outline" size={48} color="#CCCCCC" />
          <Text style={styles.emptyText}>No photos yet</Text>
          {editable && (
            <Text style={styles.emptyHint}>Add photos to make your profile stand out</Text>
          )}
        </View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={(item: ProfilePhoto) => item.id}
          renderItem={renderPhoto}
          numColumns={3}
          style={styles.photoGrid}
          contentContainerStyle={styles.photoGridContent}
        />
      )}

      {renderAddPhoto()}
      
      {reordering && (
        <View style={styles.reorderingOverlay}>
          <ActivityIndicator size="small" color="#FFFFFF" />
          <Text style={styles.reorderingText}>Reordering...</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666666',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  hint: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    minHeight: 200,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#9CA3AF',
    marginTop: 12,
  },
  emptyHint: {
    fontSize: 14,
    color: '#D1D5DB',
    marginTop: 4,
    textAlign: 'center',
  },
  photoGrid: {
    flex: 1,
  },
  photoGridContent: {
    padding: 4,
  },
  photoContainer: {
    flex: 1,
    margin: 4,
  },
  photo: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  primaryBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(124, 58, 237, 0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
  },
  dragHandle: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 4,
    padding: 2,
  },
  dragText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '500',
  },
  addPhoto: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#7C3AED',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    margin: 4,
  },
  addPhotoText: {
    marginTop: 4,
    fontSize: 12,
    color: '#7C3AED',
    fontWeight: '500',
  },
  reorderingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  reorderingText: {
    marginLeft: 8,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
})