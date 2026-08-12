import React, { useEffect, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native'
import { connect, SocketConnectionStatus } from '../lib/socketClient'
import { getNetworkState, subscribeNetworkState, type NetworkState } from '../lib/networkStatus'

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

export default function RealtimeStatusBanner({
  status,
  style,
  showSocketIssues = true,
}: RealtimeStatusBannerProps) {
  const [networkState, setNetworkState] = useState<NetworkState>(getNetworkState())
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    setNetworkState(getNetworkState())
    return subscribeNetworkState(setNetworkState)
  }, [])

  const isOffline = networkState === 'offline'
  const isSocketIssue = showSocketIssues && status.state !== 'connected'

  if (!isOffline && !isSocketIssue) return null

  const isReconnecting = status.state === 'reconnecting' || retrying

  const message = isOffline
    ? 'You are offline. Some actions may not work.'
    : isReconnecting
    ? 'Reconnecting...'
    : 'Realtime disconnected.'

  const handleRetry = async () => {
    if (isOffline || isReconnecting) return
    setRetrying(true)
    await connect()
    setRetrying(false)
  }

  return (
    <View style={[styles.container, isOffline && styles.offlineContainer, style]}>
      <Text style={styles.text}>{message}</Text>
      {!isOffline && !isReconnecting && (
        <TouchableOpacity onPress={handleRetry} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,107,107,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  offlineContainer: {
    backgroundColor: 'rgba(255,80,80,0.22)',
    borderColor: 'rgba(255,80,80,0.5)',
  },
  text: {
    color: '#FFDADA',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  retryText: {
    color: '#FFDADA',
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline',
    marginLeft: 8,
  },
})
