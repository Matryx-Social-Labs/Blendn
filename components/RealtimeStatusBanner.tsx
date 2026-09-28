import React, { useEffect, useState, useSyncExternalStore } from 'react'
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native'
import { connect, SocketConnectionStatus } from '../lib/socketClient'
import { getNetworkState, subscribeNetworkState, type NetworkState } from '../lib/networkStatus'
import Animated from 'react-native-reanimated'
import { CONTROL, EMBER, EMBER_RADIUS, MAX_FONT_SCALE, OPACITY, SPACE, TYPE, tint } from '../lib/theme'
import { fadeInFast, fadeOutFast } from './motion/presence'

/**
 * Two different failures wearing one banner.
 *
 * **Offline** means actions will genuinely fail, and is worth saying anywhere.
 * **Socket not connected** only means missed *live* updates, and is worth
 * saying only on a screen that depends on them.
 *
 * The events home screen does not. Events arrive over HTTP, so a red "Realtime
 * disconnected" bar was sitting above a list that had loaded perfectly — crying
 * wolf about a subsystem the screen does not use, and training people to ignore
 * the bar on the screens where it does matter.
 */
interface RealtimeStatusBannerProps {
  status: SocketConnectionStatus
  style?: ViewStyle
  /**
   * Whether a dead socket is worth mentioning here.
   *
   * `false` on screens that read over HTTP. Offline is still reported — this
   * suppresses the socket half, not the banner.
   */
  showSocketIssues?: boolean
}

/** How long the socket may be down before the banner says so. */
export const SOCKET_GRACE_MS = 3000

export default function RealtimeStatusBanner({
  status,
  style,
  showSocketIssues = true,
}: RealtimeStatusBannerProps) {
  const networkState = useSyncExternalStore<NetworkState>(subscribeNetworkState, getNetworkState)
  const [retrying, setRetrying] = useState(false)

  const isOffline = networkState === 'offline'
  const socketDown = showSocketIssues && status.state !== 'connected'

  /*
   * A socket that is down for longer than a reconnect takes.
   *
   * Every return to the app reconnects, and that takes about a second, so a
   * banner shown the instant the state left "connected" flashed on every
   * foreground and taught people to ignore it (SCRUM-407). Offline is still
   * said at once: actions will fail, and that is worth knowing now.
   */
  const [downLong, setDownLong] = useState(false)
  // Back up: forget the last outage, during render so it never paints stale.
  const [wasDown, setWasDown] = useState(socketDown)
  if (socketDown !== wasDown) {
    setWasDown(socketDown)
    if (!socketDown) setDownLong(false)
  }
  useEffect(() => {
    if (!socketDown) return
    const timer = setTimeout(() => setDownLong(true), SOCKET_GRACE_MS)
    return () => clearTimeout(timer)
  }, [socketDown])
  const isSocketIssue = socketDown && downLong

  if (!isOffline && !isSocketIssue) return null

  const isReconnecting = status.state === 'reconnecting' || retrying

  /*
   * What it means for the person, not which subsystem failed: "Realtime
   * disconnected" named a socket. Offline is the error (actions will fail);
   * a dropped socket is a warning (what is on screen just stops updating),
   * so the two are tinted apart (docs/DESIGN_SYSTEM.md).
   */
  const message = isOffline
    ? "You're offline. Some actions won't work until you're back."
    : isReconnecting
    ? 'Reconnecting…'
    : 'Live updates paused.'

  const handleRetry = async () => {
    if (isOffline || isReconnecting) return
    setRetrying(true)
    try {
      await connect()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <Animated.View
      entering={fadeInFast}
      exiting={fadeOutFast}
      style={[styles.container, isOffline && styles.offlineContainer, style]}
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.text}>{message}</Text>
      {!isOffline && !isReconnecting && (
        <Pressable
          onPress={handleRetry}
          accessibilityRole="button"
          accessibilityLabel="Reconnect live updates"
          hitSlop={SPACE.md}
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
        >
          <Text style={styles.retryText} maxFontSizeMultiplier={MAX_FONT_SCALE.label}>
            TRY AGAIN
          </Text>
        </Pressable>
      )}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: tint(EMBER.warning, 0.16),
    borderWidth: 1,
    borderColor: tint(EMBER.warning, 0.35),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  offlineContainer: {
    backgroundColor: tint(EMBER.destructive, 0.22),
    borderColor: tint(EMBER.destructive, 0.5),
  },
  text: {
    ...TYPE.meta,
    color: EMBER.textPrimary,
    flex: 1,
  },
  retry: { minHeight: CONTROL.sm, justifyContent: 'center', marginLeft: SPACE.sm },
  retryText: {
    ...TYPE.label,
    color: EMBER.textPrimary,
  },
  pressed: { opacity: OPACITY.pressed },
})
