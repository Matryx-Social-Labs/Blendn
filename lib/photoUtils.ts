import AsyncStorage from '@react-native-async-storage/async-storage'
import * as FileSystem from 'expo-file-system'
import * as ImageManipulator from 'expo-image-manipulator'
import { BLUR_WIDTH } from './conversationReveal'
import * as ImagePicker from 'expo-image-picker'
import { Alert, Linking, Platform } from 'react-native'
import { apiClient } from './apiClient'
import { Logger } from './logger'
import { queryCache } from './queryCache'
import { refreshAuthUser } from './useAuth'

export interface PhotoUploadResult {
  success: boolean
  url?: string
  path?: string
  error?: string
  /**
   * The person changed their mind. Not a failure, and never an alert.
   *
   * A flag rather than a sentinel string, because there are **two** ways to
   * back out — dismissing the source sheet and dismissing the picker — and the
   * caller only ever suppressed the first. It matched `error === 'User
   * cancelled'`, so closing the photo library raised *"Upload Failed — No image
   * selected"* at somebody who had just decided not to upload one.
   *
   * A third way to back out will be covered by this field without the caller
   * changing; another string would not be.
   */
  cancelled?: true
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

/**
 * No crop at pick time, ratio kept, 1080 wide.
 *
 * `allowsEditing: true` with `aspect: [1, 1]` shipped, and it was two
 * different products: Android ran a full-screen cropper, iOS fell back to the
 * legacy UIImagePickerController (losing the privacy picker) whose small
 * "Move and Scale" step testers read as "no crop". Worse, the square it
 * enforced is the wrong shape for where the photo is shown — the profile
 * hero is `PROFILE_HERO_ASPECT = 751/390`, a tall portrait, so a square lost
 * the height the main surface needs and `cover` then cropped the sides too.
 *
 * The reference apps auto-fit to their card ratio (Tinder: 4:5 portrait,
 * 1080×1350 recommended) and, where they let you adjust, do it in-app after
 * upload rather than in the OS picker. Every surface here already renders
 * with `contentFit="cover"`, so the crop happens per surface at render;
 * an in-app reposition step is the design task, not the picker's editor.
 *
 * `width` only: expo-image-manipulator keeps the ratio when one dimension is
 * given and STRETCHES when both are — the old 800×800 squashed any photo
 * that reached it un-cropped.
 */
const DEFAULT_PHOTO_OPTIONS: PhotoOptions = {
  quality: 0.8,
  width: 1080,
  allowsEditing: false,
}

/**
 * Only the permission the SOURCE needs — and the library needs none.
 *
 * Both platforms pick photos out of process now: iOS presents
 * `PHPickerViewController` and Android 13+ the system Photo Picker, and
 * expo-image-picker's own module asks for nothing before either
 * (`getMediaLibraryPermissions` is an empty array on API 33+, and the iOS
 * `launchImageLibraryAsync` has no permission guard at all). The person picks
 * one photo; the OS hands over that one photo.
 *
 * The first version of this file asked for camera AND library for EITHER
 * source, and refused if either was declined. So "Photo Library" on an Android
 * phone prompted for the camera — the only prompt it produced — and somebody
 * who declined the camera could not add a photo from their gallery at all.
 * Testers reported exactly that.
 *
 * `blocked` is a denial the OS will not re-ask about (Android "don't ask
 * again"; iOS after the first refusal). Asking again does nothing there; the
 * only way back is Settings, so the caller has to offer it.
 */
type PermissionOutcome = 'granted' | 'denied' | 'blocked'

const ensureCameraPermission = async (): Promise<PermissionOutcome> => {
  const r = await ImagePicker.requestCameraPermissionsAsync()
  if (r.granted) return 'granted'
  return r.canAskAgain ? 'denied' : 'blocked'
}

/**
 * Alert buttons in the order each platform actually draws them.
 *
 * iOS draws the array in order and styles `cancel` itself. Android maps
 * index 0 → neutral (far left), 1 → negative, 2 → positive (bold, far right)
 * and ignores `style`, so an iOS-ordered `[action, action, Cancel]` renders
 * on Android with the actions swapped and CANCEL as the bold primary. Found
 * by the react pass, verified against react-native/Libraries/Alert/Alert.js.
 * Cancel goes first on Android so it lands in the neutral slot.
 */
type AlertBtn = { text: string; onPress?: () => void; style?: 'cancel' | 'default' | 'destructive' }
const alertButtons = (actions: AlertBtn[], cancel: AlertBtn): AlertBtn[] =>
  Platform.OS === 'android' ? [cancel, ...actions] : [...actions, cancel]

/**
 * The camera is not available — refused, blocked, or absent — so say what
 * still works. Resolves to the person's choice; the caller acts on it.
 *
 * "Choose from photos" is offered on every branch, because the thing they
 * actually want is a photo on their profile and the gallery gets them there
 * with no permission at all. Settings is offered only when it is the only way
 * back — a button that opens Settings for a prompt the OS would have shown
 * anyway teaches people to ignore it.
 */
const offerLibraryInstead = (
  reason: PermissionOutcome | 'unavailable'
): Promise<'library' | 'settings' | null> =>
  new Promise((resolve) => {
    const title = reason === 'unavailable' ? 'No camera here' : 'Camera access is off'
    const body =
      reason === 'unavailable'
        ? 'This device has no camera to use. You can still add a photo from your library.'
        : 'You can still add a photo from your library — that never needs the camera.'
    const actions: AlertBtn[] = [
      ...(reason === 'blocked'
        ? [{ text: 'Open Settings', onPress: () => resolve('settings') }]
        : []),
      // Last, so it is the positive (bold) button on Android and the trailing
      // one on iOS: the thing they actually want is a photo on the profile.
      { text: 'Choose from photos', onPress: () => resolve('library') },
    ]
    Alert.alert(title, body, alertButtons(actions, { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) }))
  })

/**
 * Show action sheet to choose photo source (camera or library)
 */
export const showPhotoSourceActionSheet = (): Promise<'camera' | 'library' | null> => {
  return new Promise((resolve) => {
    Alert.alert(
      'Select Photo',
      'Choose how you want to add a photo',
      alertButtons(
        [
          { text: 'Camera', onPress: () => resolve('camera') },
          { text: 'Photo Library', onPress: () => resolve('library') },
        ],
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) }
      )
    )
  })
}

const pickerOptions = (o: PhotoOptions) => ({
  // The string form; `MediaTypeOptions.Images` is deprecated in v16.
  mediaTypes: ['images'] as ImagePicker.MediaType[],
  // `aspect` is only read when editing; neither is passed by default, so both
  // platforms use their modern picker. See DEFAULT_PHOTO_OPTIONS.
  allowsEditing: o.allowsEditing ?? false,
  ...(o.allowsEditing && o.aspect ? { aspect: o.aspect } : {}),
  quality: o.quality,
})

/**
 * Pick an image from camera or library.
 *
 * `null` means the person ended up with no photo AND was told why, or chose
 * to stop — never "something was refused silently". A camera refusal is
 * turned into an offer of the library inside this function, so a caller that
 * asked for the camera may get a library photo back; that is the point.
 */
export const pickImage = async (
  source: 'camera' | 'library',
  options: PhotoOptions = {}
): Promise<ImagePicker.ImagePickerResult | null> => {
  const finalOptions = { ...DEFAULT_PHOTO_OPTIONS, ...options }

  if (source === 'library') {
    try {
      const result = await ImagePicker.launchImageLibraryAsync(pickerOptions(finalOptions))
      return result.canceled ? null : result
    } catch (error) {
      Logger.error('profile', 'Error picking image from library', { error })
      Alert.alert('Error', 'Failed to open your photos. Please try again.')
      return null
    }
  }

  let fallback: PermissionOutcome | 'unavailable' | null = null
  try {
    const permission = await ensureCameraPermission()
    if (permission !== 'granted') {
      fallback = permission
    } else {
      const result = await ImagePicker.launchCameraAsync(pickerOptions(finalOptions))
      return result.canceled ? null : result
    }
  } catch (error) {
    // No camera activity (emulators, some tablets), or the module refused
    // after we were told granted. Either way the gallery still works.
    Logger.warn('profile', 'Camera unavailable, offering the library', { error })
    fallback = 'unavailable'
  }

  const next = await offerLibraryInstead(fallback)
  if (next === 'library') return pickImage('library', options)
  if (next === 'settings') void Linking.openSettings()
  return null
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
    
    // One dimension, never both: both would stretch the image to fit. The
    // caller's own choice wins over the default width.
    const resize = options.height && options.width === undefined
      ? { height: options.height }
      : { width: finalOptions.width }
    const processedImage = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize }],
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
    // Width only, so the derivative keeps the photo's shape; the hero shows
    // it with `cover` at the same ratio as the real one.
    width: BLUR_WIDTH,
    // Low quality on a 40px image is inconsequential visually and keeps the
    // object comfortably under the server's ceiling for what counts as a blur.
    quality: 0.4,
  })
}

/**
 * Reorder profile photos via API
 */
export type PhotoWrite = { ok: true } | { ok: false; error: string }

/**
 * Write the photo list, and say why when it is refused.
 *
 * Returned as a result rather than a boolean because the server's refusals
 * are the useful part — "That looks like a blank image. Pick a photo of
 * yourself." tells a person what to do; "could not be added, try again"
 * sends them round the same loop.
 */
export const reorderPhotos = async (userId: string, photoUrls: string[]): Promise<PhotoWrite> => {
  try {
    const result = await apiClient.updateProfile(userId, { photos: photoUrls })

    if (!result.success) {
      Logger.error('profile', 'photoUtils: Reorder failed', { error: result.error, userId })
      return { ok: false, error: result.error || 'Could not save your photos' }
    }

    // The Me tab caches its view model under this key and refetches on focus
    // only when it is gone. Every add, remove and make-primary comes through
    // here, so this is the one place that has to say "the photos changed".
    queryCache.invalidate(`profile_${userId}`)
    // `user.image` mirrors photos[0] server-side; the in-memory user must follow.
    void refreshAuthUser()
    Logger.info('profile', 'photoUtils: Photos reordered', { userId, count: photoUrls.length })
    return { ok: true }
  } catch (error) {
    Logger.error('profile', 'photoUtils: Reorder error', { error, userId })
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save your photos' }
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
      return { success: false, cancelled: true, error: 'User cancelled' }
    }

    // Pick image
    const imageResult = await pickImage(source)
    if (!imageResult || imageResult.canceled) {
      return { success: false, cancelled: true, error: 'No image selected' }
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