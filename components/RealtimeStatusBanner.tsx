import React from 'react'
import { StyleSheet, Text, View, ViewStyle } from 'react-native'
import { SocketConnectionStatus } from '../lib/socketClient'

interface RealtimeStatusBannerProps {
  status: SocketConnectionStatus
  style?: ViewStyle
}

export default function RealtimeStatusBanner({ status, style }: RealtimeStatusBannerProps) {
  if (status.state === 'connected') return null

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.text}>
        {status.state === 'reconnecting'
          ? 'Realtime reconnecting...'
          : 'Realtime disconnected. Syncing automatically.'}
      </Text>
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
  text: {
    color: '#FFDADA',
    fontSize: 12,
    fontWeight: '600',
  },
})
