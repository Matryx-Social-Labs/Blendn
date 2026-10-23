import { Stack } from 'expo-router'
import { textSizeLayout } from '../../components/TextSizeBoundary'
import { COLOR } from '../../lib/design/tokens'

export default function ChatLayout() {
  return (
    <Stack
      // Laid out afresh when the text size changes (RC drive D2).
      screenLayout={textSizeLayout}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLOR.ink },
      }}
    />
  )
}
