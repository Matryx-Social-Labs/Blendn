import React, { Suspense } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'

const MatchScreen = React.lazy(() => import('../../components/screens/MatchScreen'))

export default function Match() {
  return (
    <Suspense
      fallback={
        <View style={styles.fallback}>
          <ActivityIndicator size="large" color="#7E6CFF" />
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
    backgroundColor: 'transparent',
  },
})
