import { Pressable, StyleSheet, Text, View } from 'react-native'

import { GlyphWell } from '../ds/StateScreen'
import { font, PRESSED_WASH, useBoldText } from '../ds/shared'
import { Icon } from '../ui/Icon'
import { COLOR, ICON, RADIUS, SPACE } from '../../lib/design/tokens'
import { GONE, type GoneKind } from '../../lib/goneCopy'

/**
 * "This isn't here any more" (guidelines/flow-15 `gone`, #11): a solid card, the 56 pt well, the object's own sentence and
 * a line under it, a chevron that says back. One component for every object that went away; tapping it goes back. It
 * replaces the content (the screen fades it in over `base`), plays no haptic, and is never a raw error.
 */
export function GoneCard({ kind, onBack, testID }: { kind: GoneKind; onBack: () => void; testID?: string }) {
  const bold = useBoldText()
  const copy = GONE[kind]
  return (
    <Pressable
      testID={testID}
      onPress={onBack}
      accessibilityRole="button"
      accessibilityLabel={`${copy.title}. ${copy.body}`}
      accessibilityHint="Goes back"
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: PRESSED_WASH.ios }]}
    >
      <GlyphWell icon={copy.icon} />
      <View style={styles.text}>
        <Text style={[font('bodyStrong', bold), styles.title]}>{copy.title}</Text>
        <Text style={[font('meta', bold), styles.body]}>{copy.body}</Text>
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon name="chevron-left" size={ICON.inline} color={COLOR.textTertiary} />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md + SPACE.xxs,
    padding: SPACE.lg,
    borderRadius: RADIUS.sheet,
    backgroundColor: COLOR.surface,
  },
  text: { flex: 1, minWidth: 0 },
  title: { color: COLOR.textPrimary },
  body: { color: COLOR.textSecondary },
})
