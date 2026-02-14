import { Image, ImageContentFit, ImageSource } from 'expo-image'
import React, { memo, useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Animated, StyleSheet, View, ViewStyle } from 'react-native'
import { Logger } from '../lib/logger'
import { getOptimizedImageUrl } from '../lib/photoUtils'

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
  disableOptimization?: boolean
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
  enableProgressive = false, // Disabled by default - causes double loads
  priority = 'normal',
  disableOptimization = false,
  onLoad,
  onError,
  blurRadius,
  transition = 200, // Faster transition
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

  const effectiveEnableProgressive = enableProgressive && (!width || !height || Math.max(width, height) >= 220)

  // Get optimized URLs
  const { lowQualityUrl, highQualityUrl } = useOptimizedUrls(
    source,
    width,
    height,
    quality,
    enableWebP,
    effectiveEnableProgressive,
    disableOptimization
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
  }, [lowQualityOpacity, fadeIn])

  const handleHighQualityLoad = useCallback(() => {
    setLoadingState(prev => ({ ...prev, highQualityLoaded: true }))
    fadeOut(lowQualityOpacity)
    fadeIn(opacity)
    onLoad?.()
  }, [opacity, lowQualityOpacity, fadeIn, fadeOut, onLoad])

  const handleError = useCallback((error: any) => {
    setLoadingState(prev => ({ ...prev, hasError: true }))
    onError?.(error)
    // Only log errors for non-empty sources
    if (highQualityUrl) {
      Logger.warn('general', 'Image loading failed', {
        source: highQualityUrl,
        error: error?.message || error?.error || 'Unknown error',
        nativeError: JSON.stringify(error)
      })
    }
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
        {effectiveEnableProgressive && lowQualityUrl && (
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
        {highQualityUrl ? (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: loadingState.hasError ? 0 : 1 }]}>
            <Image
              source={{ uri: highQualityUrl }}
              style={[StyleSheet.absoluteFill]}
              contentFit={contentFit}
              onLoad={() => {
                Logger.info('general', 'Image loaded successfully', { url: highQualityUrl?.substring(0, 60) })
                if (effectiveEnableProgressive) {
                  handleHighQualityLoad()
                } else {
                  onLoad?.()
                }
              }}
              onError={(e) => {
                Logger.error('general', 'Image onError triggered', {
                  url: highQualityUrl,
                  event: JSON.stringify(e?.nativeEvent || e)
                })
                handleError(e)
              }}
              transition={effectiveEnableProgressive ? 0 : transition}
              cachePolicy={cachePolicy}
              priority={priority}
              blurRadius={blurRadius}
              testID={`${testID}-high-quality`}
            />
          </Animated.View>
        ) : null}

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
  enableProgressive: boolean = true,
  disableOptimization: boolean = false
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
        const progressiveEnabled = enableProgressive && (!width || !height || Math.max(width, height) >= 220)

        if (disableOptimization) {
          if (!cancelled) setUrls({ lowQualityUrl: '', highQualityUrl: sourceStr })
          return
        }

        // If the source is already a URL, use public optimizer
        if (/^https?:\/\//i.test(sourceStr)) {
          // Only optimize URLs from our own storage (Tigris/t3.storage.dev)
          // External URLs are used directly without optimization
          const isExternalUrl = !sourceStr.includes('supabase') &&
                                !sourceStr.includes('tigris') &&
                                !sourceStr.includes('t3.storage.dev')

          const highQualityUrl = isExternalUrl
            ? sourceStr
            : getOptimizedImageUrl(sourceStr, {
                ...baseOptions,
                quality,
                format: enableWebP ? 'webp' : 'jpg'
              })
          Logger.info('general', 'OptimizedImage URL resolved', {
            original: sourceStr.substring(0, 80),
            isExternal: isExternalUrl,
            optimized: highQualityUrl.substring(0, 80)
          })
          const lowQualityUrl = progressiveEnabled && !isExternalUrl ? getOptimizedImageUrl(sourceStr, {
            ...baseOptions,
            quality: Math.max(20, quality - 50),
            format: enableWebP ? 'webp' : 'jpg',
            width: width ? Math.floor(width / 3) : undefined,
            height: height ? Math.floor(height / 3) : undefined,
          }) : ''
          if (!cancelled) setUrls({ lowQualityUrl, highQualityUrl })
          return
        }

        // Non-http sources should already be resolved (backend/CDN). Do not sign on client.
        if (!cancelled) setUrls({ lowQualityUrl: '', highQualityUrl: sourceStr })
      } catch {
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
  // Deduplicate URLs to avoid redundant preloads
  const uniqueUrls = [...new Set(urls)]
  return Promise.allSettled(
    uniqueUrls.map(url => Image.prefetch(url).catch(() => Promise.reject()))
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
