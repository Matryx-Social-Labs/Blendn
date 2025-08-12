import { router, Stack } from 'expo-router'
import { useEffect } from 'react'
import { useAuth } from '../../lib/useAuth'

export default function OnboardingLayout() {
  const { user, loading } = useAuth()

  useEffect(() => {
    // Guard onboarding routes: if unauthenticated, go to login
    if (!loading && !user) {
      router.replace('/')
    }
  }, [loading, user])

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="basic-info" />
      <Stack.Screen name="interests" />
      <Stack.Screen name="goals" />
      <Stack.Screen name="preferences" />
      <Stack.Screen name="photos" />
      <Stack.Screen name="location" />
      <Stack.Screen name="complete" />
    </Stack>
  )
} 