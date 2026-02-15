import { Stack } from 'expo-router'
import { APP_COLORS } from '../../lib/theme'

export default function PrivateChatLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: APP_COLORS.backgroundBase },
      }}
    >
      <Stack.Screen name="[conversationId]" options={{ headerShown: false }} />
    </Stack>
  )
}
