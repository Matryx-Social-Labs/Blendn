import React, { Component, ErrorInfo, ReactNode } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { COLOR, TYPE } from '../lib/design/tokens'
import { Logger } from '../lib/logger'
import { SUPPORT_EMAIL, supportMailto } from '../lib/support'
import { getCurrentUser } from '../lib/useAuth'
import { monoCaption } from './ds/MonoFamily'
import { StateScreen } from './ds/StateScreen'
import { stateScreenIn } from './motion/presence'
import { Backdrop, ORB_LEVEL } from './onboarding/Backdrop'

interface Props {
  children: ReactNode
  /** `errorId` is the one this screen shows and puts in the support email. */
  onError?: (error: Error, errorInfo: ErrorInfo, errorId: string) => void
}

interface State {
  hasError: boolean
  error: Error | null
  errorId: string | null
  /** No mail app answered, so the address is shown to copy instead. */
  showAddress: boolean
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
      errorId: null,
      showAddress: false,
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
      errorId,
    })

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo, errorId)
  }

  resetErrorBoundary = () => {
    this.setState({
      hasError: false,
      error: null,
      errorId: null,
      showAddress: false,
    })
  }

  /*
   * An email to support with the error id in it. This sits above the toast
   * layer, so a phone with no mail app is shown the address on this screen,
   * as text that can be selected and copied, rather than in an alert that
   * disappears the moment you go to copy it.
   */
  contactSupport = async () => {
    const user = await getCurrentUser().catch(() => null)
    const url = supportMailto({ subject: "Blend’n crashed", userId: user?.id, errorId: this.state.errorId })
    Linking.openURL(url).catch(() => {
      this.setState({ showAddress: true })
    })
  }

  render() {
    if (!this.state.hasError) return this.props.children
    const { errorId, showAddress, error } = this.state
    return (
      <View style={styles.container}>
        <Backdrop level={ORB_LEVEL.form} />
        <Animated.View entering={stateScreenIn} style={styles.fill}>
          <StateScreen
            variant="screen"
            icon="triangle-alert"
            title="Something went wrong"
            body="This screen stopped working. Nothing you saved is lost. Try again, and if it keeps happening, tell us."
            // Try again is the screen's one primary (H.primary); Contact support is a text action that plays nothing.
            actions={[
              { label: 'Try again', onPress: this.resetErrorBoundary },
              { label: 'Contact support', kind: 'tertiary', onPress: () => void this.contactSupport() },
            ]}
            foot={
              <>
                {/*
                  The raw message is for us, not for the person holding the phone: in a release build it is a
                  stack-trace fragment that explains nothing and can leak internals. Development builds still show it.
                */}
                {__DEV__ && error?.message ? (
                  <Text style={styles.devMessage} selectable>
                    {error.message}
                  </Text>
                ) : null}
                {showAddress ? (
                  <Text style={styles.line} selectable accessibilityLiveRegion="polite">
                    Write to {SUPPORT_EMAIL} and mention {errorId ?? 'this error'}.
                  </Text>
                ) : null}
                {errorId ? (
                  <Text style={styles.errorId} selectable>
                    Error {errorId}
                  </Text>
                ) : null}
              </>
            }
            testID="error-boundary"
          />
        </Animated.View>
      </View>
    )
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.ink },
  fill: { flex: 1 },
  devMessage: { ...TYPE.meta, color: COLOR.destructive, textAlign: 'center' },
  // Where to write when no mail app answered: the address and the id, as text that can be selected and copied.
  line: { ...TYPE.meta, color: COLOR.textSecondary, textAlign: 'center' },
  // Geist Mono, selectable, so a message saying "it crashed" can be matched to the report that says why.
  errorId: { ...monoCaption(false), color: COLOR.textTertiary, textAlign: 'center' },
})
