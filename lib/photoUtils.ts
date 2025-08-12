import * as FileSystem from 'expo-file-system'
import * as ImageManipulator from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { Alert } from 'react-native'
import { supabase } from './supabase'

export interface PhotoUploadResult {
  success: boolean
  url?: string
  error?: string
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
 * Upload photo to Supabase Storage
 */
export const uploadPhoto = async (
  uri: string,
  userId: string,
  fileName?: string
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
    const finalFileName = fileName || `profile_${timestamp}.${fileExtension}`
    const filePath = `${userId}/${finalFileName}`

    // Prefer direct HTTP upload via FileSystem to avoid 0-byte blobs in RN fetch
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) {
      return { success: false, error: 'Missing Supabase configuration' }
    }

    const uploadUrl = `${supabaseUrl}/storage/v1/object/profile-photos/${filePath}`
    const { data: { session } } = await supabase.auth.getSession()
    const accessToken = session?.access_token
    const result = await FileSystem.uploadAsync(uploadUrl, processedUri, {
      httpMethod: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken || supabaseAnonKey}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'image/jpeg',
        'x-upsert': 'false',
      },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    })

    if (result.status < 200 || result.status >= 300) {
      console.error('Upload error (HTTP):', result.status, result.body)
      return { success: false, error: `Upload failed with status ${result.status}` }
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('profile-photos')
      .getPublicUrl(filePath)

    return {
      success: true,
      url: urlData.publicUrl
    }
  } catch (error) {
    console.error('Error uploading photo:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Upload failed' 
    }
  }
}

/**
 * Delete photo from Supabase Storage
 */
export const deletePhoto = async (photoUrl: string): Promise<boolean> => {
  try {
    // Extract file path from URL
    const url = new URL(photoUrl)
    const pathParts = url.pathname.split('/')
    const bucketIndex = pathParts.findIndex(part => part === 'profile-photos')
    
    if (bucketIndex === -1) {
      console.error('Invalid photo URL format')
      return false
    }

    const filePath = pathParts.slice(bucketIndex + 1).join('/')

    const { error } = await supabase.storage
      .from('profile-photos')
      .remove([filePath])

    if (error) {
      console.error('Delete error:', error)
      return false
    }

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

    // Upload image
    return await uploadPhoto(asset.uri, userId)
  } catch (error) {
    console.error('Error in photo selection flow:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
} 