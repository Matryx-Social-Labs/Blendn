import AsyncStorage from '@react-native-async-storage/async-storage'
import * as FileSystem from 'expo-file-system'
import * as ImageManipulator from 'expo-image-manipulator'
import { BLUR_WIDTH } from './conversationReveal'
import * as ImagePicker from 'expo-image-picker'
import { Alert } from 'react-native'
import { apiClient } from './apiClient'
import { Logger } from './logger'

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
    Logger.error('profile', 'Error requesting permissions', { error })
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
    Logger.error('profile', 'Error picking image', { error })
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
    Logger.error('profile', 'Error processing image', { error })
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
      Logger.error('profile', 'Photo upload failed', { error: result.error })
    }

    return result
  } catch (error) {
    Logger.error('profile', 'Error uploading photo', { error })
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
      Logger.error('profile', 'Tigris upload error', { status: result.status, body: result.body })
      return { success: false, error: `Upload failed with status ${result.status}` }
    }

    return {
      success: true,
      url: publicUrl,
      path: presignedResult.data.key
    }
  } catch (error) {
    Logger.error('profile', 'Tigris upload error', { error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Tigris upload failed'
    }
  }
}

/**
 * Delete photo via admin backend
 */
export const deletePhoto = async (photoUrl: string): Promise<boolean> => {
  try {
    const result = await apiClient.deleteUpload(photoUrl)
    if (!result.success) {
      Logger.error('profile', 'Photo deletion failed', { error: result.error })
      return false
    }
    Logger.info('profile', 'Photo deleted successfully', { photoUrl })
    return true
  } catch (error) {
    Logger.error('profile', 'Error deleting photo', { error })
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
    Logger.error('profile', 'photoUtils: Cache error', { error, url })
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
    Logger.error('profile', 'photoUtils: Cache cleanup error', { error })
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
 * A deliberately tiny copy of a photo, for people who have not revealed.
 *
 * ## Why a derivative and not a blur filter
 *
 * The obvious implementation is `blurRadius` on the real image. It is also
 * wrong: the real URL has already reached the device by then, so a proxy, a
 * cache dump or devtools undoes it in one step. This repo has shipped exactly
 * that bug before -- `MatchScreen.tsx` still carries the comment "the anonymity
 * was one tap deep".
 *
 * So the server never sends the full URL to a viewer who has not earned it. It
 * sends this instead, and 40 pixels scaled up to a card *is* the blur -- no
 * filter required, and nothing to undo because the detail is not there.
 *
 * ## Why the client makes it
 *
 * The image is already decoded here, and `expo-image-manipulator` is already a
 * dependency. Doing it server-side would mean `sharp` -- a native build in the
 * Railway image and a full download per photo.
 *
 * A client could upload something sharp as its own "blur", but that exposes
 * only their own photo. They cannot affect anybody else's, so this is
 * self-harm rather than an attack, and the server's size ceiling catches the
 * careless version anyway.
 */
export const createBlurDerivative = async (uri: string): Promise<string | null> => {
  return processImage(uri, {
    width: BLUR_WIDTH,
    height: BLUR_WIDTH,
    // Low quality on a 40px image is inconsequential visually and keeps the
    // object comfortably under the server's ceiling for what counts as a blur.
    quality: 0.4,
  })
}

/**
 * Reorder profile photos via API
 */
export const reorderPhotos = async (userId: string, photoUrls: string[]): Promise<boolean> => {
  try {
    const result = await apiClient.updateProfile(userId, { photos: photoUrls })

    if (!result.success) {
      Logger.error('profile', 'photoUtils: Reorder failed', { error: result.error, userId })
      return false
    }

    Logger.info('profile', 'photoUtils: Photos reordered', { userId, count: photoUrls.length })
    return true
  } catch (error) {
    Logger.error('profile', 'photoUtils: Reorder error', { error, userId })
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
    Logger.error('profile', 'photoUtils: Get photos error', { error, userId })
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
      Logger.warn('profile', 'photoUtils: Photo verification issues', { issues: verification.issues })
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
    Logger.error('profile', 'photoUtils: Photo selection error', { error })
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
} 

/**
 * Build an optimised Supabase render URL for a public image URL.
 *
 * ## This currently returns its input, every time
 *
 * Two independent reasons, either of which alone would be enough:
 *
 * 1. `EXPO_PUBLIC_SUPABASE_IMAGE_TRANSFORMS_ENABLED` is unset, so the first
 *    branch returns early.
 * 2. The transform only rewrites `/storage/v1/object/public/` paths — Supabase
 *    — and uploads go to **Tigris** (see `lib/tigris.ts` in blendn-admin).
 *    Tigris is S3-compatible and has no image-render service, so there is no
 *    URL to rewrite to.
 *
 * So `OptimizedImage` optimises nothing: its `width`, `height`, `quality` and
 * `enableWebP` props are accepted and discarded, and every card downloads its
 * cover at full upload resolution and displays it at 400×200.
 *
 * **Not fixable here.** `events.cover_image_url` has no thumbnail counterpart
 * server-side — `thumbnail_url` exists only on `event_media` rows, and it is a
 * different picture from the cover, so substituting it would change what the
 * card shows rather than how much it weighs. The real fix is generating a
 * thumbnail for the cover, and because uploads go direct to Tigris through a
 * presigned URL the server never sees the bytes: it has to happen client-side
 * before upload, or in a worker that fetches and resizes afterwards. Either is
 * a piece of work, not a line.
 *
 * Left in place and documented rather than deleted, because the function is
 * correct for the Supabase case and the storage backend is not a settled
 * decision. What is not acceptable is the name promising something the body
 * cannot do — that is the failure this codebase's audit found seventeen times,
 * and this is the eighteenth.
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