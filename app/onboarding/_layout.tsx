import { Stack } from 'expo-router'

export default function OnboardingLayout() {
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