import { Stack } from 'expo-router'
import { EMBER } from '../../lib/theme'

export default function ChatLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: EMBER.bg },
      }}
    >
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
    </Stack>
  )
}
