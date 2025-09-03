import { Stack } from 'expo-router'

export default function PrivateChatLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
      <Stack.Screen name="[conversationId]" options={{ headerShown: false }} />
    </Stack>
  )
}


