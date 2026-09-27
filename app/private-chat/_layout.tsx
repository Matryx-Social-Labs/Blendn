import { Stack } from 'expo-router'
import { EMBER } from '../../lib/theme'

export default function PrivateChatLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: EMBER.bg },
      }}
    >
      <Stack.Screen name="[conversationId]" options={{ headerShown: false }} />
    </Stack>
  )
}
