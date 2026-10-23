import React, { Component, ErrorInfo, ReactNode } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { COLOR, TYPE } from '../lib/design/tokens'
import { Sentry } from '../lib/sentry'
import { SUPPORT_EMAIL, supportMailto } from '../lib/support'
import { monoCaption } from './ds/MonoFamily'
import { StateScreen } from './ds/StateScreen'
import { stateScreenIn } from './motion/presence'
import { Backdrop, ORB_LEVEL } from './onboarding/Backdrop'

interface Props {
  children: ReactNode
  /** `errorId` is the one this screen shows and puts in the support email. */
  onError?: (error: Error, errorInfo: ErrorInfo, errorId: string) => void
  /**
   * Where it is: the route's name for one screen's boundary, the pathname for the root's. Reported with the error, and a
   * different one clears it — somebody who went somewhere else is not shown the last place's crash.
   */
  route?: string
  /** A way out of a screen that keeps failing ("Go back"), where there is somewhere to go back to. */
  onLeave?: () => void
}

interface State {
  hasError: boolean
  error: Error | null
  errorId: string | null
  /** When it was caught: the route change that comes with the crash itself is not somewhere new (`componentDidUpdate`). */
  caughtAt: number
  /** No mail app answered, so the address is shown to copy instead. */
  showAddress: boolean
}

/**
 * A route change this soon after the crash came with it, not from somebody going elsewhere: the root boundary unmounts the
 * navigator, and its state going moves the pathname at once. Clearing on that would remount straight into the same
 * crash, over and over.
 */
// ponytail: a time window, not a cause; a crash that settles slower than this could retry once per navigation.
const CRASH_SETTLE_MS = 1000

const CLEAR: State = {
  hasError: false,
  error: null,
  errorId: null,
  caughtAt: 0,
  showAddress: false,
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

    this.state = CLEAR
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorId: newErrorId(),
      caughtAt: Date.now(),
    }
  }

  /*
   * One report per crash: the exception itself (so Sentry has its stack), where it happened and what it said. RC drive 5's
   * had no route, went out twice (a message from the logger, the exception from the root layout), and from a local
   * release build went nowhere: it has no Sentry DSN.
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const errorId = this.state.errorId ?? newErrorId()
    const route = this.props.route ?? 'unknown'
    Sentry.captureException(error, {
      // The id the crash screen shows and puts in the support email.
      tags: { context: 'error-boundary', error_id: errorId, route },
      extra: { message: error.message, componentStack: errorInfo.componentStack },
    })
    // Read on a device with no Sentry (a local release build): the unified log carries console.error.
    console.error(`[error-boundary] ${errorId} at ${route}: ${error.name}: ${error.message}\n${errorInfo.componentStack ?? ''}`)

    this.setState({ error, errorId })
    this.props.onError?.(error, errorInfo, errorId)
  }

  // Somewhere else now: what failed back there is not this place's to show.
  componentDidUpdate(prev: Props) {
    if (this.state.hasError && prev.route !== this.props.route && Date.now() - this.state.caughtAt > CRASH_SETTLE_MS) this.resetErrorBoundary()
  }

  // Draws the children again: they were unmounted for the fallback, so this is a fresh mount, not the broken tree.
  resetErrorBoundary = () => {
    this.setState(CLEAR)
  }

  /*
   * An email to support with the error id in it. This sits above the toast
   * layer, so a phone with no mail app is shown the address on this screen,
   * as text that can be selected and copied, rather than in an alert that
   * disappears the moment you go to copy it.
   */
  contactSupport = async () => {
    // Required here, not at the top: every screen's boundary would otherwise load the API client with it, and a boundary
    // must not depend on the code it guards against. (`import()` is not transformed for jest here.)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCurrentUser } = require('../lib/useAuth') as typeof import('../lib/useAuth')
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
              // A screen that fails again on Try again is not a dead end: a modal has no back gesture.
              ...(this.props.onLeave ? [{ label: 'Go back', kind: 'secondary' as const, onPress: this.props.onLeave }] : []),
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
