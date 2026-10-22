import { StyleSheet, Text, View } from 'react-native'

import { Button } from '../ds/Button'
import { font, useBoldText } from '../ds/shared'
import type { IconName } from '../ui/Icon'
import { COLOR, RADIUS, SPACE } from '../../lib/design/tokens'

/**
 * The card that asks for location in place (Flow 3's, shared by the Pulse's Nearby and Places' Near you): a
 * `surface` card, the reason in one line and one secondary Button. No new component of the design system's: it is
 * `surface` + `Button`, kept in one place so the two panes ask the same way.
 */
export function LocationAskCard({
  heading,
  body,
  label,
  icon,
  onAsk,
  testID,
}: {
  heading?: string
  body: string
  label: string
  icon?: IconName
  onAsk: () => void
  testID?: string
}) {
  const bold = useBoldText()
  return (
    <View style={styles.card} testID={testID}>
      {heading ? (
        <Text accessibilityRole="header" style={[font('heading', bold), styles.ink]}>
          {heading}
        </Text>
      ) : null}
      <Text style={[font('meta', bold), styles.secondary]}>{body}</Text>
      <Button kind="lit" size="raised" icon={icon} label={label} onPress={onAsk} style={styles.button} testID={testID && `${testID}-button`} />
    </View>
  )
}

const styles = StyleSheet.create({
  // design-exception: 20, as the Flow 3 location card (between SPACE.lg and SPACE.xl)
  card: { marginHorizontal: SPACE.gutter, borderRadius: RADIUS.mediaInCard, backgroundColor: COLOR.surface, padding: 20, gap: SPACE.sm + SPACE.xxs },
  button: { alignSelf: 'flex-start' },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
})
