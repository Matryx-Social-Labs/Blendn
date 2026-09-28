import { Ionicons } from '@expo/vector-icons'
import React, { Component, ErrorInfo, ReactNode } from 'react'
import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Logger } from '../lib/logger'
import { SUPPORT_EMAIL, supportMailto } from '../lib/support'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, SPACE, TYPE } from '../lib/theme'
import { getCurrentUser } from '../lib/useAuth'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  /** `errorId` is the one this screen shows and puts in the support email. */
  onError?: (error: Error, errorInfo: ErrorInfo, errorId: string) => void
  resetOnPropsChange?: any[]
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  errorId: string | null
}

/**
 * A short id for one crash, readable aloud: "E-M1K2Q9-7F3A".
 *
 * Logged with the error and put in the support email, so a message saying
 * "it crashed" can be matched to the report that says why.
 */
const newErrorId = () =>
  `E-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase()

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)

    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorId: newErrorId(),
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const errorId = this.state.errorId ?? newErrorId()
    // Log the error with structured logging
    Logger.error('general', 'React Error Boundary caught an error', {
      errorId,
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
      errorInfo,
      errorId,
    })

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo, errorId)
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
      errorInfo: null,
      errorId: null,
    })
  }

  /*
   * An email to support with the error id in it. This sits above the toast
   * layer, so a phone with no mail app is told the address in an alert.
   */
  contactSupport = async () => {
    const user = await getCurrentUser().catch(() => null)
    const url = supportMailto({ subject: "Blend'n crashed", userId: user?.id, errorId: this.state.errorId })
    Linking.openURL(url).catch(() => {
      Alert.alert('Contact support', `Write to ${SUPPORT_EMAIL} and mention ${this.state.errorId ?? 'this error'}.`)
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
          {/*
            The raw message is for us, not for the person holding the phone: in
            a release build it is a stack-trace fragment that explains nothing
            and can leak internals. Development builds still show it.
          */}
          {__DEV__ && this.state.error?.message ? (
            <Text style={styles.devMessage} selectable>{this.state.error.message}</Text>
          ) : null}

          <TouchableOpacity
            style={styles.retryButton}
            onPress={this.resetErrorBoundary}
            accessibilityRole="button"
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.detailsButton}
            onPress={() => void this.contactSupport()}
            accessibilityRole="button"
            accessibilityLabel="Contact support"
          >
            <Text style={styles.detailsButtonText}>CONTACT SUPPORT</Text>
          </TouchableOpacity>
          {this.state.errorId ? (
            <Text style={styles.errorId} selectable>Error {this.state.errorId}</Text>
          ) : null}
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
  devMessage: {
    ...TYPE.meta,
    color: EMBER.destructive,
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
  detailsButtonText: TYPE.label,
  errorId: {
    ...TYPE.meta,
    color: EMBER.textTertiary,
    marginTop: SPACE.sm
  }
})
