import React, { ComponentType, lazy, memo, Suspense } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { Logger } from '../lib/logger'
import { ErrorBoundary } from './ErrorBoundary'
import { APP_COLORS } from '../lib/theme'

interface LazyLoadProps {
  fallback?: React.ReactNode
  errorFallback?: React.ReactNode
  name?: string
  delay?: number
}

interface LazyWrapperProps extends LazyLoadProps {
  children: React.ReactNode
}

// Default loading component
const DefaultFallback = memo(() => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color={APP_COLORS.accent} />
    <Text style={styles.loadingText}>Loading...</Text>
  </View>
))

DefaultFallback.displayName = 'DefaultFallback'

// Default error fallback
const DefaultErrorFallback = memo(({ error }: { error?: Error }) => (
  <View style={styles.errorContainer}>
    <Text style={styles.errorTitle}>Failed to load component</Text>
    <Text style={styles.errorMessage}>
      {error?.message || 'An unexpected error occurred'}
    </Text>
  </View>
))

DefaultErrorFallback.displayName = 'DefaultErrorFallback'

/**
 * Wrapper component for lazy-loaded components with error handling
 */
export const LazyWrapper = memo<LazyWrapperProps>(({ 
  children, 
  fallback = <DefaultFallback />, 
  errorFallback = <DefaultErrorFallback />,
  name = 'Unknown'
}) => {
  return (
    <ErrorBoundary
      fallback={errorFallback}
      onError={(error) => {
        Logger.error('general', `Lazy component error: ${name}`, { 
          error: error.message,
          stack: error.stack
        })
      }}
    >
      <Suspense fallback={fallback}>
        {children}
      </Suspense>
    </ErrorBoundary>
  )
})

LazyWrapper.displayName = 'LazyWrapper'

/**
 * Create a lazy-loaded component with built-in error handling
 */
export function createLazyComponent<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  options: LazyLoadProps = {}
): ComponentType<React.ComponentProps<T>> {
  const LazyComponent = lazy(async () => {
    try {
      const startTime = Date.now()
      
      // Add artificial delay if specified (for testing)
      if (options.delay) {
        await new Promise(resolve => setTimeout(resolve, options.delay))
      }
      
      const module = await importFn()
      const loadTime = Date.now() - startTime
      
      Logger.debug('general', `Lazy component loaded: ${options.name}`, {
        loadTime,
        hasDelay: !!options.delay
      })
      
      return module
    } catch (error) {
      Logger.error('general', `Failed to load lazy component: ${options.name}`, { error })
      throw error
    }
  })

  const WrappedComponent = memo((props: React.ComponentProps<T>) => (
    <LazyWrapper 
      fallback={options.fallback}
      errorFallback={options.errorFallback}
      name={options.name}
    >
      <LazyComponent {...props} />
    </LazyWrapper>
  ))

  WrappedComponent.displayName = `Lazy(${options.name || 'Component'})`
  
  return WrappedComponent
}

/**
 * Hook for preloading lazy components
 */
export const usePreload = () => {
  const preload = React.useCallback((importFn: () => Promise<any>, name?: string) => {
    Logger.debug('general', `Preloading component: ${name || 'Unknown'}`)
    
    importFn().catch(error => {
      Logger.warn('general', `Preload failed: ${name || 'Unknown'}`, { error })
    })
  }, [])

  return { preload }
}

/**
 * Bundle analyzer for development
 */
export const bundleAnalyzer = {
  logComponentLoad: (componentName: string, loadTime: number) => {
    if (__DEV__) {
      console.group(`🏗️ Component Load: ${componentName}`)
      console.log(`⏱️ Load time: ${loadTime}ms`)
      console.log(`📦 Bundle: Lazy loaded`)
      console.groupEnd()
    }
  },
  
  logBundleSize: (componentName: string, estimatedSize: number) => {
    if (__DEV__) {
      console.log(`📊 ${componentName}: ~${estimatedSize}KB`)
    }
  }
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: APP_COLORS.backgroundBase,
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: APP_COLORS.textSecondary,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: APP_COLORS.backgroundBase,
    padding: 20,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: APP_COLORS.destructive,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: APP_COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
})

export default LazyWrapper
