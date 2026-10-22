import { Image, ImageContentFit, ImageSource } from 'expo-image'
import React, { memo, useCallback, useEffect, useState } from 'react'
import { Animated, StyleSheet, View, ViewStyle } from 'react-native'
import Reanimated from 'react-native-reanimated'
import { Logger } from '../lib/logger'
import { getOptimizedImageUrl } from '../lib/photoUtils'
import { COLOR } from '../lib/design/tokens'
import { SKELETON_APPEAR } from './Skeleton'

interface OptimizedImageProps {
  source: string | ImageSource
  style?: ViewStyle | ViewStyle[]
  contentFit?: ImageContentFit
  placeholder?: ImageSource
  width?: number
  height?: number
  quality?: number
  enableProgressive?: boolean
  priority?: 'low' | 'normal' | 'high'
  transition?: number
  cachePolicy?: 'none' | 'disk' | 'memory' | 'memory-disk'
  /**
   * What this view is *for*, so a recycled one cannot arrive holding the last
   * card's picture.
   *
   * `expo-image` reuses native views inside a virtualised list. Without a key
   * it has no way to know that the view it just handed you was showing
   * something else, so a card scrolling into place paints the **previous
   * card's photograph** for a frame or two and then dissolves into its own.
   * It reads as a flicker, it is worst on exactly the fast scroll a feed
   * invites, and it is invisible in a screenshot.
   *
   * `SceneHeroMedia` has always passed one — it uses `expo-image` directly.
   * This component did not expose the prop at all, so nothing rendered through
   * it could. The feed is a `FlatList` of many cards and is where recycling
   * actually happens.
   *
   * Pass the image's own URL. Anything stable and unique per picture works.
   */
  recyclingKey?: string
  accessibilityLabel?: string
  accessibilityRole?: string
  /** Make the wrapper an accessibility element (it is not by default). */
  accessible?: boolean
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
  width,
  height,
  quality = 75,
  enableProgressive = false, // Disabled by default - causes double loads
  priority = 'normal',
  transition = 200, // Faster transition
  cachePolicy = 'memory-disk',
  recyclingKey,
  accessibilityLabel,
  accessible,
  accessibilityRole,
}) => {
  const [loadingState, setLoadingState] = useState<ProgressiveLoadingState>({
    lowQualityLoaded: false,
    highQualityLoaded: false,
    hasError: false
  })
  
  const [lowQualityOpacity] = useState(new Animated.Value(0))

  const effectiveEnableProgressive = enableProgressive && (!width || !height || Math.max(width, height) >= 220)

  // Get optimized URLs
  const { lowQualityUrl, highQualityUrl } = useOptimizedUrls(
    source,
    width,
    height,
    quality,
    effectiveEnableProgressive
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
  }, [lowQualityOpacity, fadeOut])

  const handleError = useCallback((error: any) => {
    setLoadingState(prev => ({ ...prev, hasError: true }))
    // Only log errors for non-empty sources
    if (highQualityUrl) {
      Logger.warn('general', 'Image loading failed', {
        source: highQualityUrl,
        error: error?.message || error?.error || 'Unknown error',
        nativeError: JSON.stringify(error)
      })
    }
  }, [highQualityUrl])

  // Reset state when source changes: the flags during render, so a new source
  // never renders with the last one's; the animated values after commit.
  const [prevSource, setPrevSource] = useState(source)
  if (source !== prevSource) {
    setPrevSource(source)
    setLoadingState({
      lowQualityLoaded: false,
      highQualityLoaded: false,
      hasError: false
    })
  }
  useEffect(() => {
    lowQualityOpacity.setValue(0)
  }, [source, lowQualityOpacity])

  const hasSource = (typeof source === 'string' ? source : (source as { uri?: string } | null)?.uri ?? '') !== ''

  const renderContent = () => {
    return (
      <>
        {/* Placeholder */}
        {placeholder && !loadingState.lowQualityLoaded && !loadingState.highQualityLoaded && (
          <Image
            source={placeholder}
            style={[StyleSheet.absoluteFill]}
            contentFit={contentFit}
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
              recyclingKey={recyclingKey}
              blurRadius={4}
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
                handleHighQualityLoad()
              }}
              onError={(e) => {
                Logger.error('general', 'Image onError triggered', {
                  url: highQualityUrl,
                  event: JSON.stringify(e as Record<string, unknown>)
                })
                handleError(e)
              }}
              transition={effectiveEnableProgressive ? 0 : transition}
              cachePolicy={cachePolicy}
              recyclingKey={recyclingKey}
              priority={priority}
            />
          </Animated.View>
        ) : null}

        {/* Placeholder — only while there is something to load. An empty
            source never loads and never fails, so it showed for ever: every
            person without a photo on the Banter (SCRUM-404). */}
        {hasSource && !loadingState.highQualityLoaded && !loadingState.hasError && (
          // A still shape, like every skeleton (DS #17): nothing turns, nothing is drawn for a load under 300 ms, so
          // there is nothing to loop past 5 s (#48). The picture replaces it when it lands.
          <Reanimated.View entering={SKELETON_APPEAR} style={styles.placeholder} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        )}
      </>
    )
  }

  return (
    <View
      style={[styles.container, style]}
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole as any}
    >
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
        const progressiveEnabled = enableProgressive && (!width || !height || Math.max(width, height) >= 220)

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
                format: 'webp'
              })
          Logger.info('general', 'OptimizedImage URL resolved', {
            original: sourceStr.substring(0, 80),
            isExternal: isExternalUrl,
            optimized: highQualityUrl.substring(0, 80)
          })
          const lowQualityUrl = progressiveEnabled && !isExternalUrl ? getOptimizedImageUrl(sourceStr, {
            ...baseOptions,
            quality: Math.max(20, quality - 50),
            format: 'webp',
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
  }, [source, width, height, quality, enableProgressive])

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

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  placeholder: {
    ...StyleSheet.absoluteFill,
    backgroundColor: COLOR.surfaceSunken,
  },
})
