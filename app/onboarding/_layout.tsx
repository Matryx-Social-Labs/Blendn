import { LinearGradient } from 'expo-linear-gradient'
import { Stack } from 'expo-router'
import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import { useAuth } from '../../lib/useAuth'

export default function OnboardingLayout() {
  const { user, loading } = useAuth()

  useEffect(() => {
    // Central router handles auth/navigation
  }, [loading, user])

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.bg} pointerEvents="none">
        <LinearGradient
          colors={["#480D37", "#000000"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="basic-info" />
        <Stack.Screen name="interests" />
        <Stack.Screen name="goals" />
        <Stack.Screen name="preferences" />
        <Stack.Screen name="photos" />
        <Stack.Screen name="location" />
        <Stack.Screen name="complete" />
      </Stack>
    </View>
  )
} 

const styles = StyleSheet.create({
  bg: {
    ...StyleSheet.absoluteFillObject,
  },
})