import { Ionicons } from '@expo/vector-icons'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    Dimensions,
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
import OptimizedImage from './OptimizedImage'

const { width } = Dimensions.get('window')

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
  const [cachedUrls, setCachedUrls] = useState<Record<string, string>>({})
  const onPhotosChangeRef = useRef<PhotoManagerProps['onPhotosChange']>()
  // Measure available width to compute exact 3-col sizing
  const [containerWidth, setContainerWidth] = useState<number>(width - 32)
  const NUM_COLUMNS = 3
  const GAP = 8
  const itemSize = Math.max(80, Math.floor((containerWidth - GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS))

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
        if (photo.url.startsWith('http://') || photo.url.startsWith('https://')) {
          cachePhoto(photo.url).then(localPath => {
            if (localPath) {
              setCachedUrls(prev => ({ ...prev, [photo.url]: localPath }))
            }
          })
        }
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
        
        console.log('PhotoManager: Photo added', { userId, path: result.path || result.url })
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

  const renderPhoto = useCallback(({ item, index }: { item: ProfilePhoto; index: number }) => {
    const cachedUrl = cachedUrls[item.url]
    const optimizedUrl = getOptimizedImageUrl(item.url, {
      width: Math.round(itemSize * 2), // 2x for retina
      height: Math.round(itemSize * 2),
      quality: 80,
      resize: 'cover',
      format: 'webp'
    })

    return (
      <View style={[styles.photoContainer, { width: itemSize, height: itemSize }]}> 
        <TouchableOpacity
          style={[styles.photo, { width: itemSize, height: itemSize }]}
          activeOpacity={0.8}
        >
          <OptimizedImage
            source={cachedUrl || item.url}
            style={styles.photoImage}
            contentFit="cover"
            placeholder={require('../assets/images/icon.png')}
            transition={200}
            cachePolicy="memory-disk"
            width={Math.round(itemSize * 2)}
            height={Math.round(itemSize * 2)}
            quality={80}
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
        </TouchableOpacity>
      </View>
    )
  }, [cachedUrls, editable, handleRemovePhoto])

  const renderAddPhoto = () => {
    if (!editable || photos.length >= maxPhotos) return null

    return (
      <TouchableOpacity
        style={[styles.addPhoto, { width: itemSize, height: itemSize }]}
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

  return (
    <View 
      style={[styles.container, style]}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Photos ({photos.length}/{maxPhotos})</Text>
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
        <View style={[styles.photoGrid, styles.photoGridContent]}> 
          {photos.map((item, index) => (
            <React.Fragment key={item.id}>
              {renderPhoto({ item, index })}
            </React.Fragment>
          ))}
        </View>
      )}

      {renderAddPhoto()}
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoGridContent: {
    padding: 0,
  },
  photoContainer: {
    margin: 0,
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
})