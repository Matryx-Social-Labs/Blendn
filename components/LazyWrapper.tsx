import React, { ComponentType, lazy, Suspense, memo } from 'react'
import { ActivityIndicator, StyleSheet, View, Text } from 'react-native'
import { ErrorBoundary } from './ErrorBoundary'
import { Logger } from '../lib/logger'

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
    <ActivityIndicator size="large" color="#007AFF" />
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
 * Lazy load screen components
 */
export const LazyScreens = {
  // Main tabs
  Events: createLazyComponent(
    () => import('../app/(tabs)/events'),
    { name: 'Events', fallback: <DefaultFallback /> }
  ),
  
  Match: createLazyComponent(
    () => import('../app/(tabs)/match'),
    { name: 'Match', fallback: <DefaultFallback /> }
  ),
  
  Chat: createLazyComponent(
    () => import('../app/(tabs)/chat'),
    { name: 'Chat', fallback: <DefaultFallback /> }
  ),
  
  Profile: createLazyComponent(
    () => import('../app/(tabs)/profile'),
    { name: 'Profile', fallback: <DefaultFallback /> }
  ),

  // Detail screens
  EventDetail: createLazyComponent(
    () => import('../app/event/[id]'),
    { name: 'EventDetail', fallback: <DefaultFallback /> }
  ),
  
  ChatDetail: createLazyComponent(
    () => import('../app/chat/[id]'),
    { name: 'ChatDetail', fallback: <DefaultFallback /> }
  ),
  
  PrivateChat: createLazyComponent(
    () => import('../app/private-chat/[conversationId]'),
    { name: 'PrivateChat', fallback: <DefaultFallback /> }
  ),
  
  UserProfile: createLazyComponent(
    () => import('../app/user/[id]'),
    { name: 'UserProfile', fallback: <DefaultFallback /> }
  ),

  // Settings and profile screens
  Settings: createLazyComponent(
    () => import('../app/settings'),
    { name: 'Settings', fallback: <DefaultFallback /> }
  ),
  
  EditProfile: createLazyComponent(
    () => import('../app/edit-profile'),
    { name: 'EditProfile', fallback: <DefaultFallback /> }
  ),
  
  BlockedUsers: createLazyComponent(
    () => import('../app/blocked-users'),
    { name: 'BlockedUsers', fallback: <DefaultFallback /> }
  ),

  // Onboarding flow
  OnboardingWelcome: createLazyComponent(
    () => import('../app/onboarding/welcome'),
    { name: 'OnboardingWelcome', fallback: <DefaultFallback /> }
  ),
  
  OnboardingBasicInfo: createLazyComponent(
    () => import('../app/onboarding/basic-info'),
    { name: 'OnboardingBasicInfo', fallback: <DefaultFallback /> }
  ),
  
  OnboardingInterests: createLazyComponent(
    () => import('../app/onboarding/interests'),
    { name: 'OnboardingInterests', fallback: <DefaultFallback /> }
  ),
  
  OnboardingPreferences: createLazyComponent(
    () => import('../app/onboarding/preferences'),
    { name: 'OnboardingPreferences', fallback: <DefaultFallback /> }
  ),
  
  OnboardingPhotos: createLazyComponent(
    () => import('../app/onboarding/photos'),
    { name: 'OnboardingPhotos', fallback: <DefaultFallback /> }
  ),
  
  OnboardingLocation: createLazyComponent(
    () => import('../app/onboarding/location'),
    { name: 'OnboardingLocation', fallback: <DefaultFallback /> }
  ),
  
  OnboardingGoals: createLazyComponent(
    () => import('../app/onboarding/goals'),
    { name: 'OnboardingGoals', fallback: <DefaultFallback /> }
  ),
  
  OnboardingComplete: createLazyComponent(
    () => import('../app/onboarding/complete'),
    { name: 'OnboardingComplete', fallback: <DefaultFallback /> }
  ),
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
    backgroundColor: '#f8f9fa',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#d32f2f',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
})

export default LazyWrapper