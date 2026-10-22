import { Stack } from 'expo-router'
import { COLOR } from '../../lib/design/tokens'

export default function PrivateChatLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLOR.ink },
      }}
    />
  )
}
