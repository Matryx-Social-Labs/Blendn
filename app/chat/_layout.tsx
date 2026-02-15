import { Stack } from 'expo-router'
import { APP_COLORS } from '../../lib/theme'

export default function ChatLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: APP_COLORS.backgroundBase },
      }}
    >
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
    </Stack>
  )
}
