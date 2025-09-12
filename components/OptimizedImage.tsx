import { Image, ImageContentFit, ImageSource } from 'expo-image'
import React, { memo, useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Animated, StyleSheet, View, ViewStyle } from 'react-native'
import { Logger } from '../lib/logger'
import { getOptimizedImageUrl } from '../lib/photoUtils'
import { supabase } from '../lib/supabase'

interface OptimizedImageProps {
  source: string | ImageSource
  style?: ViewStyle | ViewStyle[]
  contentFit?: ImageContentFit
  placeholder?: ImageSource
  fallback?: ImageSource
  width?: number
  height?: number
  quality?: number
  enableWebP?: boolean
  enableProgressive?: boolean
  priority?: 'low' | 'normal' | 'high'
  onLoad?: () => void
  onError?: (error: any) => void
  blurRadius?: number
  transition?: number
  cachePolicy?: 'none' | 'disk' | 'memory' | 'memory-disk'
  testID?: string
}

interface ProgressiveLoadingState {
  lowQualityLoaded: boolean
  highQualityLoaded: boolean
  hasError: boolean
}

export const OptimizedImage = memo<OptimizedImageProps>(({
  source,
  style,
  contentFit = 'cover',
  placeholder,
  fallback,
  width,
  height,
  quality = 75,
  enableWebP = true,
  enableProgressive = true,
  priority = 'normal',
  onLoad,
  onError,
  blurRadius,
  transition = 300,
  cachePolicy = 'memory-disk',
  testID,
}) => {
  const [loadingState, setLoadingState] = useState<ProgressiveLoadingState>({
    lowQualityLoaded: false,
    highQualityLoaded: false,
    hasError: false
  })
  
  const [opacity] = useState(new Animated.Value(0))
  const [lowQualityOpacity] = useState(new Animated.Value(0))

  // Get optimized URLs
  const { lowQualityUrl, highQualityUrl } = useOptimizedUrls(
    source,
    width,
    height,
    quality,
    enableWebP,
    enableProgressive
  )

  const fadeIn = useCallback((animatedValue: Animated.Value, duration: number = transition) => {
    Animated.timing(animatedValue, {
      toValue: 1,
      duration,
      useNativeDriver: true,
    }).start()
  }, [transition])

  const fadeOut = useCallback((animatedValue: Animated.Value, duration: number = transition) => {
    Animated.timing(animatedValue, {
      toValue: 0,
      duration: duration / 2,
      useNativeDriver: true,
    }).start()
  }, [transition])

  const handleLowQualityLoad = useCallback(() => {
    setLoadingState(prev => ({ ...prev, lowQualityLoaded: true }))
    fadeIn(lowQualityOpacity)
    Logger.debug('general', 'Low quality image loaded', { source: lowQualityUrl })
  }, [lowQualityOpacity, fadeIn, lowQualityUrl])

  const handleHighQualityLoad = useCallback(() => {
    setLoadingState(prev => ({ ...prev, highQualityLoaded: true }))
    fadeOut(lowQualityOpacity)
    fadeIn(opacity)
    onLoad?.()
    Logger.debug('general', 'High quality image loaded', { source: highQualityUrl })
  }, [opacity, lowQualityOpacity, fadeIn, fadeOut, onLoad, highQualityUrl])

  const handleError = useCallback((error: any) => {
    setLoadingState(prev => ({ ...prev, hasError: true }))
    onError?.(error)
    Logger.warn('general', 'Image loading failed', { 
      source: highQualityUrl,
      error: error?.message || 'Unknown error'
    })
  }, [onError, highQualityUrl])

  // Reset state when source changes
  useEffect(() => {
    setLoadingState({
      lowQualityLoaded: false,
      highQualityLoaded: false,
      hasError: false
    })
    opacity.setValue(0)
    lowQualityOpacity.setValue(0)
  }, [source, opacity, lowQualityOpacity])

  const renderContent = () => {
    if (loadingState.hasError && fallback) {
      return (
        <Image
          source={fallback}
          style={[StyleSheet.absoluteFill]}
          contentFit={contentFit}
          cachePolicy={cachePolicy}
          testID={`${testID}-fallback`}
        />
      )
    }

    return (
      <>
        {/* Placeholder */}
        {placeholder && !loadingState.lowQualityLoaded && !loadingState.highQualityLoaded && (
          <Image
            source={placeholder}
            style={[StyleSheet.absoluteFill]}
            contentFit={contentFit}
            blurRadius={blurRadius}
            testID={`${testID}-placeholder`}
          />
        )}

        {/* Low quality image for progressive loading */}
        {enableProgressive && lowQualityUrl && (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: lowQualityOpacity }]}>
            <Image
              source={{ uri: lowQualityUrl }}
              style={[StyleSheet.absoluteFill]}
              contentFit={contentFit}
              onLoad={handleLowQualityLoad}
              onError={handleError}
              cachePolicy={cachePolicy}
              priority={priority}
              blurRadius={blurRadius ? blurRadius + 2 : 4}
              testID={`${testID}-low-quality`}
            />
          </Animated.View>
        )}

        {/* High quality image */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
          <Image
            source={{ uri: highQualityUrl }}
            style={[StyleSheet.absoluteFill]}
            contentFit={contentFit}
            onLoad={enableProgressive ? handleHighQualityLoad : onLoad}
            onError={handleError}
            transition={enableProgressive ? 0 : transition}
            cachePolicy={cachePolicy}
            priority={priority}
            blurRadius={blurRadius}
            testID={`${testID}-high-quality`}
          />
        </Animated.View>

        {/* Loading indicator */}
        {!loadingState.highQualityLoaded && !loadingState.hasError && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#ffffff80" />
          </View>
        )}
      </>
    )
  }

  return (
    <View style={[styles.container, style]} testID={testID}>
      {renderContent()}
    </View>
  )
})

OptimizedImage.displayName = 'OptimizedImage'

// Hook to generate optimized or signed URLs
const useOptimizedUrls = (
  source: string | ImageSource,
  width?: number,
  height?: number,
  quality: number = 75,
  enableWebP: boolean = true,
  enableProgressive: boolean = true
) => {
  const [urls, setUrls] = React.useState<{ lowQualityUrl: string; highQualityUrl: string }>({ lowQualityUrl: '', highQualityUrl: '' })

  useEffect(() => {
    let cancelled = false
    const resolveUrls = async () => {
      try {
        const sourceStr = typeof source === 'string' ? source : (source as any)?.uri || ''
        if (!sourceStr) {
          if (!cancelled) setUrls({ lowQualityUrl: '', highQualityUrl: '' })
          return
        }

        const baseOptions = { width, height, resize: 'cover' as const }

        // If the source is already a URL, use public optimizer
        if (/^https?:\/\//i.test(sourceStr)) {
          const highQualityUrl = getOptimizedImageUrl(sourceStr, {
            ...baseOptions,
            quality,
            format: enableWebP ? 'webp' : 'jpg'
          })
          const lowQualityUrl = enableProgressive ? getOptimizedImageUrl(sourceStr, {
            ...baseOptions,
            quality: Math.max(20, quality - 50),
            format: enableWebP ? 'webp' : 'jpg',
            width: width ? Math.floor(width / 3) : undefined,
            height: height ? Math.floor(height / 3) : undefined,
          }) : ''
          if (!cancelled) setUrls({ lowQualityUrl, highQualityUrl })
          return
        }

        // Otherwise treat as private storage path in `profile-photos` bucket
        const expiresIn = 60 * 30 // 30 minutes
        const bucket = 'profile-photos'

        const transformHigh: any = {
          width: width || undefined,
          height: height || undefined,
          resize: 'cover',
          quality: quality,
          format: enableWebP ? 'webp' : 'jpg',
        }

        const transformLow: any = enableProgressive ? {
          width: width ? Math.floor(width / 3) : undefined,
          height: height ? Math.floor(height / 3) : undefined,
          resize: 'cover',
          quality: Math.max(20, quality - 50),
          format: enableWebP ? 'webp' : 'jpg',
        } : null

        const path = sourceStr.replace(/^\/+/, '')
        let highQualityUrl = ''
        let lowQualityUrl = ''
        try {
          const { data: high } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn, { transform: transformHigh })
          highQualityUrl = high?.signedUrl || ''
        } catch (e) {
          // Fallback: signed URL without transform
          const { data: high } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn)
          highQualityUrl = high?.signedUrl || ''
        }
        if (transformLow) {
          try {
            const { data: low } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn, { transform: transformLow })
            lowQualityUrl = low?.signedUrl || ''
          } catch {
            lowQualityUrl = ''
          }
        }
        if (!cancelled) setUrls({ lowQualityUrl, highQualityUrl })
      } catch (error) {
        Logger.warn('general', 'Failed to resolve signed image URLs', { error })
        if (!cancelled) setUrls({ lowQualityUrl: '', highQualityUrl: '' })
      }
    }

    resolveUrls()
    return () => { cancelled = true }
  }, [source, width, height, quality, enableWebP, enableProgressive])

  return urls
}

// Preload images for better performance
export const preloadImages = (urls: string[], priority: 'low' | 'normal' | 'high' = 'low') => {
  Logger.debug('general', `Preloading ${urls.length} images`, { priority })
  
  return Promise.allSettled(
    urls.map(url => 
      Image.prefetch(url).catch(error => {
        Logger.warn('general', 'Image preload failed', { url, error })
        return Promise.reject(error)
      })
    )
  )
}

// Image cache management
export const clearImageCache = () => {
  Logger.info('general', 'Clearing image cache')
  return Image.clearMemoryCache()
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)'
  }
})

export default OptimizedImage