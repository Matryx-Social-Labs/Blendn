import React, { useEffect, useState, useSyncExternalStore } from 'react'
import type { ViewStyle } from 'react-native'
import { connect, SocketConnectionStatus } from '../lib/socketClient'
import { getNetworkState, subscribeNetworkState, type NetworkState } from '../lib/networkStatus'
import Animated from 'react-native-reanimated'
import { Banner } from './ds/Banner'
import { bannerFadeIn, bannerIn, bannerOut } from './motion/presence'
import { useReducedMotion } from '../lib/motion'

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
  /** A full error state with its own Try again is on screen: the banner says what is wrong and offers no second one (rc7 D4). */
  withoutRetry?: boolean
}

/** How long the socket may be down before the banner says so. */
export const SOCKET_GRACE_MS = 3000

export default function RealtimeStatusBanner({
  status,
  style,
  showSocketIssues = true,
  withoutRetry = false,
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

  const reduceMotion = useReducedMotion()
  const kind = realtimeBannerKind({
    offline: isOffline,
    socketIssue: isSocketIssue,
    reconnecting: status.state === 'reconnecting' || retrying,
    // Refused at the handshake because the account is gone: no grace, and nothing to retry (Flow 15 #21).
    deleted: status.endedBy === 'deleted',
  })
  if (!kind) return null

  /*
   * What it means for the person, not which subsystem failed (the design's
   * system banners, Flow 5, Flow 7 pieces): offline is the error (actions will
   * fail); a dropped socket is a warning (what is on screen stops updating),
   * tinted apart by the DS Banner; while a reconnect runs it says so, in the
   * same warning tint and with nothing to press (frame 03).
   */
  const handleRetry = async () => {
    if (kind !== 'paused')
      return
    setRetrying(true)
    try {
      await connect()
    } finally {
      setRetrying(false)
    }
  }

  return (
    // DS #44: it slides 16 pt and fades in over `base`, leaves in a quick fade; Reduce Motion: the fade alone.
    <Animated.View entering={reduceMotion ? bannerFadeIn : bannerIn} exiting={bannerOut} style={style}>
      {kind === 'offline' ? <Banner kind="offline" text={OFFLINE} /> : null}
      {kind === 'deleted' ? <Banner kind="offline" icon="user-x" text={DELETED} testID="realtime-deleted" /> : null}
      {kind === 'reconnecting' ? <Banner kind="paused" text={RECONNECTING} testID="realtime-reconnecting" /> : null}
      {kind === 'paused' ? <Banner kind="paused" text={PAUSED} action={withoutRetry ? undefined : { label: 'Try again', onPress: handleRetry }} /> : null}
    </Animated.View>
  )
}

/** The design's system banners (Flow 5 #12, #13; Flow 7 pieces 03). */
export const OFFLINE = 'Offline. Some actions won’t work until you’re back.'
export const PAUSED = 'Updates paused. Trying to reconnect.'
/** While a reconnect runs: the warning tint, no action (Flow 7 pieces 03). */
export const RECONNECTING = 'Reconnecting…'

/** Evicted because the account was deleted: the reason, not "paused" (Flow 15 #21); the next request signs out to the landing. */
export const DELETED = 'Signed out. This account was deleted, so live updates stopped.'

export type RealtimeBannerKind = 'offline' | 'paused' | 'reconnecting' | 'deleted'

/**
 * Which banner, if any. Offline wins (actions will fail, and there is nothing to retry); a socket that has been down past
 * the grace is paused, with Try again, or reconnecting, with nothing to press, while a reconnect is under way.
 */
export function realtimeBannerKind({
  offline,
  socketIssue,
  reconnecting,
  deleted = false,
}: {
  offline: boolean
  socketIssue: boolean
  reconnecting: boolean
  deleted?: boolean
}): RealtimeBannerKind | null {
  if (deleted) return 'deleted'
  if (offline) return 'offline'
  if (!socketIssue) return null
  return reconnecting ? 'reconnecting' : 'paused'
}
