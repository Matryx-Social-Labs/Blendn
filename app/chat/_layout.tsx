import { Stack } from 'expo-router'

export default function ChatLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
    </Stack>
  )
}


