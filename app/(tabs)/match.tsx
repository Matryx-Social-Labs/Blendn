import React, { Suspense } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { APP_COLORS } from '../../lib/theme'

const MatchScreen = React.lazy(() => import('../../components/screens/MatchScreen'))

export default function Match() {
  return (
    <Suspense
      fallback={
        <View style={styles.fallback}>
          <ActivityIndicator size="large" color={APP_COLORS.accent} />
        </View>
      }
    >
      <MatchScreen />
    </Suspense>
  )
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: APP_COLORS.backgroundBase,
  },
})
