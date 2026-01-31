import AsyncStorage from '@react-native-async-storage/async-storage'
import * as FileSystem from 'expo-file-system'
import * as ImageManipulator from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { Alert } from 'react-native'
import { apiClient } from './apiClient'

export interface PhotoUploadResult {
  success: boolean
  url?: string
  path?: string
  error?: string
  metadata?: {
    size: number
    width: number
    height: number
    format: string
  }
}

export interface PhotoCacheEntry {
  url: string
  localPath: string
  timestamp: number
  size: number
}

export interface PhotoVerificationResult {
  isValid: boolean
  hasFace: boolean
  quality: 'low' | 'medium' | 'high'
  issues: string[]
}

export interface ProfilePhoto {
  id: string
  url: string
  order: number
  isVerified?: boolean
  isPrimary?: boolean
  metadata?: {
    size: number
    width: number
    height: number
    format: string
    uploadedAt: string
  }
}

export interface PhotoOptions {
  quality?: number
  width?: number
  height?: number
  allowsEditing?: boolean
  aspect?: [number, number]
}

// Default photo settings optimized for dating app profiles
const DEFAULT_PHOTO_OPTIONS: PhotoOptions = {
  quality: 0.8,
  width: 800,
  height: 800,
  allowsEditing: true,
  aspect: [1, 1] // Square aspect ratio
}

/**
 * Request camera and media library permissions
 */
export const requestPhotoPermissions = async (): Promise<boolean> => {
  try {
    // Request camera permission
    const cameraPermission = await ImagePicker.requestCameraPermissionsAsync()
    
    // Request media library permission
    const mediaPermission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    
    if (cameraPermission.status !== 'granted' || mediaPermission.status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Sorry, we need camera and photo library permissions to upload profile photos.',
        [{ text: 'OK' }]
      )
      return false
    }
    
    return true
  } catch (error) {
    console.error('Error requesting permissions:', error)
    return false
  }
}

/**
 * Show action sheet to choose photo source (camera or library)
 */
export const showPhotoSourceActionSheet = (): Promise<'camera' | 'library' | null> => {
  return new Promise((resolve) => {
    Alert.alert(
      'Select Photo',
      'Choose how you want to add a photo',
      [
        { text: 'Camera', onPress: () => resolve('camera') },
        { text: 'Photo Library', onPress: () => resolve('library') },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) }
      ]
    )
  })
}

/**
 * Pick an image from camera or library
 */
export const pickImage = async (
  source: 'camera' | 'library',
  options: PhotoOptions = {}
): Promise<ImagePicker.ImagePickerResult | null> => {
  try {
    const hasPermission = await requestPhotoPermissions()
    if (!hasPermission) return null

    const finalOptions = { ...DEFAULT_PHOTO_OPTIONS, ...options }
    
    let result: ImagePicker.ImagePickerResult

    if (source === 'camera') {
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: finalOptions.allowsEditing,
        aspect: finalOptions.aspect,
        quality: finalOptions.quality,
      })
    } else {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: finalOptions.allowsEditing,
        aspect: finalOptions.aspect,
        quality: finalOptions.quality,
      })
    }

    return result.canceled ? null : result
  } catch (error) {
    console.error('Error picking image:', error)
    Alert.alert('Error', 'Failed to pick image. Please try again.')
    return null
  }
}

/**
 * Compress and resize image for optimal upload
 */
export const processImage = async (
  uri: string,
  options: PhotoOptions = {}
): Promise<string | null> => {
  try {
    const finalOptions = { ...DEFAULT_PHOTO_OPTIONS, ...options }
    
    const processedImage = await ImageManipulator.manipulateAsync(
      uri,
      [
        {
          resize: {
            width: finalOptions.width,
            height: finalOptions.height,
          }
        }
      ],
      {
        compress: finalOptions.quality,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    )

    return processedImage.uri
  } catch (error) {
    console.error('Error processing image:', error)
    return null
  }
}

/**
 * Upload photo to Tigris via admin backend (preferred)
 * Uploads to Tigris via admin backend presigned URL
 */
export const uploadPhoto = async (
  uri: string,
  userId: string,
  fileName?: string,
  folder: 'profile' | 'chat' | 'events' = 'profile'
): Promise<PhotoUploadResult> => {
  try {
    // Process the image first
    const processedUri = await processImage(uri)
    if (!processedUri) {
      return { success: false, error: 'Failed to process image' }
    }

    // Generate unique filename
    const timestamp = Date.now()
    const fileExtension = 'jpg'
    const finalFileName = fileName || `${folder}_${timestamp}.${fileExtension}`

    // Upload to Tigris via admin backend
    const result = await uploadToTigris(processedUri, finalFileName, folder)

    if (!result.success) {
      console.error('Photo upload failed:', result.error)
    }

    return result
  } catch (error) {
    console.error('Error uploading photo:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed'
    }
  }
}

/**
 * Upload to Tigris via presigned URL
 */
const uploadToTigris = async (
  uri: string,
  fileName: string,
  folder: 'profile' | 'chat' | 'events'
): Promise<PhotoUploadResult> => {
  try {
    // Get presigned URL from admin backend
    const presignedResult = await apiClient.getPresignedUploadUrl(fileName, 'image/jpeg', folder)

    if (!presignedResult.success || !presignedResult.data) {
      return {
        success: false,
        error: presignedResult.error || 'Failed to get upload URL'
      }
    }

    const { uploadUrl, publicUrl } = presignedResult.data

    // Upload directly to Tigris using the presigned URL
    const result = await FileSystem.uploadAsync(uploadUrl, uri, {
      httpMethod: 'PUT',
      headers: {
        'Content-Type': 'image/jpeg',
      },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    })

    if (result.status < 200 || result.status >= 300) {
      console.error('Tigris upload error:', result.status, result.body)
      return { success: false, error: `Upload failed with status ${result.status}` }
    }

    return {
      success: true,
      url: publicUrl,
      path: presignedResult.data.key
    }
  } catch (error) {
    console.error('Tigris upload error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Tigris upload failed'
    }
  }
}

/**
 * Delete photo via admin backend
 * TODO: Add delete endpoint to admin backend
 */
export const deletePhoto = async (photoUrl: string): Promise<boolean> => {
  try {
    // TODO: Call admin backend to delete photo
    // For now, just log and return true (photos will be cleaned up later)
    console.log('Photo deletion requested:', photoUrl)
    return true
  } catch (error) {
    console.error('Error deleting photo:', error)
    return false
  }
}

/**
 * Upload multiple photos with progress tracking
 */
export const uploadMultiplePhotos = async (
  imageUris: string[],
  userId: string,
  onProgress?: (completed: number, total: number) => void
): Promise<PhotoUploadResult[]> => {
  const results: PhotoUploadResult[] = []
  
  for (let i = 0; i < imageUris.length; i++) {
    const result = await uploadPhoto(imageUris[i], userId, `profile_${i + 1}_${Date.now()}.jpg`)
    results.push(result)
    
    if (onProgress) {
      onProgress(i + 1, imageUris.length)
    }
  }
  
  return results
}

/**
 * Get optimized photo dimensions for different use cases
 */
export const getPhotoDimensions = (usage: 'profile' | 'thumbnail' | 'fullscreen') => {
  switch (usage) {
    case 'profile':
      return { width: 800, height: 800 }
    case 'thumbnail':
      return { width: 200, height: 200 }
    case 'fullscreen':
      return { width: 1200, height: 1600 }
    default:
      return { width: 800, height: 800 }
  }
}

/**
 * Validate photo before upload
 */
export const validatePhoto = (imageInfo: ImagePicker.ImagePickerAsset): { valid: boolean; error?: string } => {
  // Check file size (5MB limit)
  const maxSize = 5 * 1024 * 1024 // 5MB in bytes
  if (imageInfo.fileSize && imageInfo.fileSize > maxSize) {
    return { valid: false, error: 'Photo must be less than 5MB' }
  }

  // Check dimensions (minimum size)
  const minDimension = 200
  if (imageInfo.width < minDimension || imageInfo.height < minDimension) {
    return { valid: false, error: 'Photo must be at least 200x200 pixels' }
  }

  return { valid: true }
}

/**
 * Photo cache management
 */
const CACHE_KEY_PREFIX = 'photo_cache_'
const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const MAX_CACHE_SIZE = 50 * 1024 * 1024 // 50MB

export const cachePhoto = async (url: string): Promise<string | null> => {
  try {
    const cacheKey = `${CACHE_KEY_PREFIX}${encodeURIComponent(url)}`
    const cached = await AsyncStorage.getItem(cacheKey)
    
    if (cached) {
      const entry: PhotoCacheEntry = JSON.parse(cached)
      if (Date.now() - entry.timestamp < CACHE_EXPIRY_MS) {
        // Check if file still exists
        const fileInfo = await FileSystem.getInfoAsync(entry.localPath)
        if (fileInfo.exists) {
          return entry.localPath
        }
      }
    }

    // Download and cache
    const filename = url.split('/').pop() || 'photo.jpg'
    const localPath = `${FileSystem.cacheDirectory}photos/${filename}`
    
    // Ensure directory exists
    await FileSystem.makeDirectoryAsync(`${FileSystem.cacheDirectory}photos/`, { intermediates: true })
    
    const downloadResult = await FileSystem.downloadAsync(url, localPath)
    
    if (downloadResult.status === 200) {
      const fileInfo = await FileSystem.getInfoAsync(localPath)
      const entry: PhotoCacheEntry = {
        url,
        localPath,
        timestamp: Date.now(),
        size: (fileInfo.exists && 'size' in fileInfo) ? fileInfo.size : 0
      }
      
      await AsyncStorage.setItem(cacheKey, JSON.stringify(entry))
      await cleanupCache()
      
      return localPath
    }
  } catch (error) {
    console.error('photoUtils: Cache error', { error, url })
  }
  
  return null
}

const cleanupCache = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys()
    const cacheKeys = keys.filter(key => key.startsWith(CACHE_KEY_PREFIX))
    
    let totalSize = 0
    const entries: Array<{ key: string; entry: PhotoCacheEntry }> = []
    
    for (const key of cacheKeys) {
      const cached = await AsyncStorage.getItem(key)
      if (cached) {
        const entry: PhotoCacheEntry = JSON.parse(cached)
        entries.push({ key, entry })
        totalSize += entry.size
      }
    }
    
    // Remove expired entries
    const now = Date.now()
    const expiredKeys = entries
      .filter(({ entry }) => now - entry.timestamp > CACHE_EXPIRY_MS)
      .map(({ key }) => key)
    
    if (expiredKeys.length > 0) {
      await AsyncStorage.multiRemove(expiredKeys)
    }
    
    // If still over size limit, remove oldest entries
    if (totalSize > MAX_CACHE_SIZE) {
      const sortedEntries = entries
        .filter(({ key }) => !expiredKeys.includes(key))
        .sort((a, b) => a.entry.timestamp - b.entry.timestamp)
      
      let currentSize = totalSize
      const toRemove: string[] = []
      
      for (const { key, entry } of sortedEntries) {
        if (currentSize <= MAX_CACHE_SIZE) break
        toRemove.push(key)
        currentSize -= entry.size
        
        // Remove file
        try {
          await FileSystem.deleteAsync(entry.localPath, { idempotent: true })
        } catch {}
      }
      
      if (toRemove.length > 0) {
        await AsyncStorage.multiRemove(toRemove)
      }
    }
  } catch (error) {
    console.error('photoUtils: Cache cleanup error', { error })
  }
}

/**
 * Basic photo verification (placeholder for ML integration)
 */
export const verifyPhoto = async (imageUri: string): Promise<PhotoVerificationResult> => {
  try {
    // Basic validation
    const fileInfo = await FileSystem.getInfoAsync(imageUri)
    if (!fileInfo.exists) {
      return {
        isValid: false,
        hasFace: false,
        quality: 'low',
        issues: ['File not found']
      }
    }

    // TODO: Integrate with face detection API or ML Kit
    // For now, basic checks based on file size and dimensions
    const issues: string[] = []
    let quality: 'low' | 'medium' | 'high' = 'medium'
    
    if (fileInfo.size && fileInfo.size < 50000) {
      issues.push('Image quality may be too low')
      quality = 'low'
    } else if (fileInfo.size && fileInfo.size > 2000000) {
      quality = 'high'
    }

    return {
      isValid: issues.length === 0,
      hasFace: true, // Placeholder - would use face detection
      quality,
      issues
    }
  } catch (error) {
    return {
      isValid: false,
      hasFace: false,
      quality: 'low',
      issues: ['Verification failed']
    }
  }
}

/**
 * Reorder profile photos via API
 */
export const reorderPhotos = async (userId: string, photoUrls: string[]): Promise<boolean> => {
  try {
    const result = await apiClient.updateProfile(userId, { photos: photoUrls })

    if (!result.success) {
      console.error('photoUtils: Reorder failed', { error: result.error, userId })
      return false
    }

    console.log('photoUtils: Photos reordered', { userId, count: photoUrls.length })
    return true
  } catch (error) {
    console.error('photoUtils: Reorder error', { error, userId })
    return false
  }
}

/**
 * Get user's profile photos with metadata
 */
export const getUserPhotos = async (userId: string): Promise<ProfilePhoto[]> => {
  try {
    const result = await apiClient.getProfile(userId)

    if (!result.success || !result.data?.profile?.photos) {
      return []
    }

    const photos = result.data.profile.photos as string[]
    return photos.map((url: string, index: number) => ({
      id: `${userId}_${index}`,
      url,
      order: index,
      isPrimary: index === 0
    }))
  } catch (error) {
    console.error('photoUtils: Get photos error', { error, userId })
    return []
  }
}

/**
 * Complete photo selection and upload flow
 */
export const selectAndUploadPhoto = async (userId: string): Promise<PhotoUploadResult> => {
  try {
    // Show source selection
    const source = await showPhotoSourceActionSheet()
    if (!source) {
      return { success: false, error: 'User cancelled' }
    }

    // Pick image
    const imageResult = await pickImage(source)
    if (!imageResult || imageResult.canceled) {
      return { success: false, error: 'No image selected' }
    }

    const asset = imageResult.assets[0]
    
    // Validate image
    const validation = validatePhoto(asset)
    if (!validation.valid) {
      Alert.alert('Invalid Photo', validation.error)
      return { success: false, error: validation.error }
    }

    // Verify photo quality (optional)
    const verification = await verifyPhoto(asset.uri)
    if (!verification.isValid && verification.issues.length > 0) {
      console.warn('photoUtils: Photo verification issues', { issues: verification.issues })
    }

    // Upload image
    const result = await uploadPhoto(asset.uri, userId)
    
    if (result.success && result.url) {
      result.metadata = {
        size: asset.fileSize || 0,
        width: asset.width,
        height: asset.height,
        format: asset.type || 'image'
      }
    }
    
    return result
  } catch (error) {
    console.error('photoUtils: Photo selection error', { error })
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
} 

/**
 * Build an optimized Supabase render URL for a given public image URL.
 * Falls back to the original URL if it is not a Supabase public storage URL.
 */
export const getOptimizedImageUrl = (
  photoUrl: string,
  options: {
    width?: number
    height?: number
    quality?: number
    resize?: 'contain' | 'cover'
    format?: 'webp' | 'jpg' | 'png'
  } = {}
): string => {
  try {
    // Allow disabling image transformations via env for projects without the feature
    const transformsEnabled = process.env.EXPO_PUBLIC_SUPABASE_IMAGE_TRANSFORMS_ENABLED === 'true'
    if (!transformsEnabled) {
      return photoUrl
    }
    const url = new URL(photoUrl)
    // Only transform Supabase public storage URLs
    const marker = '/storage/v1/object/public/'
    const idx = url.pathname.indexOf(marker)
    if (idx === -1) {
      return photoUrl
    }

    const publicPath = url.pathname.slice(idx + marker.length) // bucket/path/to/file
    const base = `${url.origin}/storage/v1/render/image/public/${publicPath}`

    const params = new URLSearchParams()
    if (options.width) params.set('width', String(options.width))
    if (options.height) params.set('height', String(options.height))
    if (options.quality) params.set('quality', String(options.quality))
    if (options.resize) params.set('resize', options.resize)
    if (options.format) params.set('format', options.format)

    return params.toString().length > 0 ? `${base}?${params.toString()}` : base
  } catch {
    return photoUrl
  }
}