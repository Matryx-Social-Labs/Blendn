import { Ionicons } from '@expo/vector-icons'
import React, { Component, ErrorInfo, ReactNode } from 'react'
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Logger } from '../lib/logger'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, SPACE, TYPE } from '../lib/theme'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  resetOnPropsChange?: any[]
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error with structured logging
    Logger.error('general', 'React Error Boundary caught an error', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      errorInfo: {
        componentStack: errorInfo.componentStack
      },
      timestamp: new Date().toISOString()
    })

    this.setState({
      error,
      errorInfo
    })

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo)
  }

  componentDidUpdate(prevProps: Props) {
    // Reset error boundary when specified props change
    if (this.props.resetOnPropsChange && this.state.hasError) {
      const hasChanged = this.props.resetOnPropsChange.some(
        (prop, index) => prop !== prevProps.resetOnPropsChange?.[index]
      )
      
      if (hasChanged) {
        this.resetErrorBoundary()
      }
    }
  }

  resetErrorBoundary = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    })
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback UI or default error UI
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <View style={styles.container}>
          <Ionicons name="warning-outline" size={48} color={EMBER.destructive} />
          <Text style={styles.title}>Oops! Something went wrong</Text>
          <Text style={styles.subtitle}>
            We encountered an unexpected error. Don&apos;t worry, your data is safe.
          </Text>
          
          <TouchableOpacity 
            style={styles.retryButton} 
            onPress={this.resetErrorBoundary}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.detailsButton}
            onPress={() => {
              Alert.alert(
                'Error Details',
                `${this.state.error?.message || 'Unknown error'}\n\nIf this problem persists, please contact support.`,
                [{ text: 'OK' }]
              )
            }}
          >
            <Text style={styles.detailsButtonText}>VIEW DETAILS</Text>
          </TouchableOpacity>
        </View>
      )
    }

    return this.props.children
  }
}

// Convenience wrapper for functional components
export function withErrorBoundary<T extends object>(
  Component: React.ComponentType<T>,
  errorBoundaryProps?: Omit<Props, 'children'>
) {
  const WrappedComponent = (props: T) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  )
  
  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`
  return WrappedComponent
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: GUTTER,
    backgroundColor: EMBER.bg
  },
  title: {
    ...TYPE.title,
    marginTop: SPACE.lg,
    marginBottom: SPACE.sm,
    textAlign: 'center'
  },
  subtitle: {
    ...TYPE.body,
    color: EMBER.textSecondary,
    textAlign: 'center',
    marginBottom: SPACE.xxl
  },
  retryButton: {
    height: CONTROL.lg,
    justifyContent: 'center',
    backgroundColor: EMBER.accent,
    paddingHorizontal: SPACE.xl,
    borderRadius: EMBER_RADIUS.pill,
    marginBottom: SPACE.lg
  },
  retryButtonText: {
    ...TYPE.button,
    color: EMBER.onGradient
  },
  detailsButton: {
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm
  },
  detailsButtonText: TYPE.label
})
