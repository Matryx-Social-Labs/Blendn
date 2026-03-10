import React, { useEffect, useState } from 'react'
import { StyleSheet, Text, View, ViewStyle } from 'react-native'
import { SocketConnectionStatus } from '../lib/socketClient'
import { getNetworkState, subscribeNetworkState, type NetworkState } from '../lib/networkStatus'

interface RealtimeStatusBannerProps {
  status: SocketConnectionStatus
  style?: ViewStyle
}

export default function RealtimeStatusBanner({ status, style }: RealtimeStatusBannerProps) {
  const [networkState, setNetworkState] = useState<NetworkState>(getNetworkState())

  useEffect(() => {
    setNetworkState(getNetworkState())
    return subscribeNetworkState(setNetworkState)
  }, [])

  const isOffline = networkState === 'offline'
  const isSocketIssue = status.state !== 'connected'

  if (!isOffline && !isSocketIssue) return null

  const message = isOffline
    ? 'You are offline. Some actions may not work.'
    : status.state === 'reconnecting'
    ? 'Reconnecting...'
    : 'Realtime disconnected. Syncing automatically.'

  return (
    <View style={[styles.container, isOffline && styles.offlineContainer, style]}>
      <Text style={styles.text}>{message}</Text>
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
  },
  offlineContainer: {
    backgroundColor: 'rgba(255,80,80,0.22)',
    borderColor: 'rgba(255,80,80,0.5)',
  },
  text: {
    color: '#FFDADA',
    fontSize: 12,
    fontWeight: '600',
  },
})
