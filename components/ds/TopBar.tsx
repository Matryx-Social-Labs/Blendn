import { useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { type IconName } from '../ui/Icon'
import { Material } from '../ui/Material'
import { COLOR, FONT_FAMILY, MATERIAL, SIZE, SPACE } from '../../lib/design/tokens'
import { Button } from './Button'
import { IconButton } from './IconButton'
import { CONTROL_FONT_CAP, font, useBoldText, useIncreaseContrast } from './shared'

/** rest: no bar, straight on the body · scrolled: the bar glass behind · condensed: a 17 pt centred title. */
export type TopBarState = 'rest' | 'scrolled' | 'condensed'

export type TopBarProps = {
  title: string
  /** A line under the title ("4 people · 2 here now"). */
  sub?: string
  /** The screen decides from its scroll offset. */
  state?: TopBarState
  onBack: () => void
  /** Glass circles on the right, named by what they do. */
  actions?: readonly { icon: IconName; label: string; onPress: () => void }[]
  /** The Save pill: `H.primary` on press-in; `H.success` is the screen's, when the save lands. */
  save?: { onPress: () => void; saving?: boolean; disabled?: boolean }
  testID?: string
}

/**
 * The pushed screen's header (guidelines/components/TopBar.html): at rest no
 * bar, a glass back circle (44 iOS · 48 Android, chevron · arrow) and the
 * title in `heading` beside it, straight on the body. Scrolled, the bar glass
 * sits behind; further, the title condenses to 17 pt centred. Tab roots use
 * their display title, never this.
 *
 * The bar is mounted, not faded in: glass never fades (§5.2 rule 6, as the P0
 * toast and sheet), so Reduce Motion has nothing to change. Back is silent;
 * Save plays `H.primary`. The title caps at 1.3× in the fixed bar and
 * truncates; the sub line scales freely. Reduce Transparency: the solid bar
 * (through <Material>). Increase Contrast: the 50% hairline under the bar
 * (the circles draw their own).
 *
 * Save is the 48 pt `md` button: Button has no 44.
 */
export function TopBar({ title, sub, state = 'rest', onBack, actions = [], save, testID }: TopBarProps) {
  const android = Platform.OS === 'android'
  const insets = useSafeAreaInsets()
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const circle = android ? SIZE.circleButtonAndroid : SIZE.circleButton
  const condensed = state === 'condensed'
  const top = insets.top + SPACE.sm
  // The condensed title is centred, so it keeps clear of the wider side on both: the back circle, or the actions and Save.
  const [rightWidth, setRightWidth] = useState(0)
  const inset = SPACE.lg + Math.max(circle, rightWidth) + SPACE.md

  return (
    <View testID={testID} style={[styles.header, { paddingTop: top }, !condensed && styles.roomBelow]}>
      {state !== 'rest' ? (
        <View testID={testID && `${testID}-bar`} pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Material role="bar" style={StyleSheet.absoluteFill} />
          {contrast ? <View testID={testID && `${testID}-bar-contrast`} style={styles.contrast} /> : null}
        </View>
      ) : null}
      <View style={[styles.row, { minHeight: circle }]}>
        <IconButton icon={android ? 'arrow-left' : 'chevron-left'} accessibilityLabel="Back" onPress={onBack} />
        <View style={styles.titles}>
          {condensed ? null : (
            <>
              <Text
                accessibilityRole="header"
                style={[font('heading', bold), styles.ink]}
                maxFontSizeMultiplier={CONTROL_FONT_CAP}
                numberOfLines={1}
              >
                {title}
              </Text>
              {sub ? <Text style={[font('meta', bold), styles.sub]}>{sub}</Text> : null}
            </>
          )}
        </View>
        <View testID={testID && `${testID}-right`} onLayout={(e) => setRightWidth(e.nativeEvent.layout.width)} style={styles.right}>
          {actions.map((a) => (
            <IconButton key={a.label} icon={a.icon} accessibilityLabel={a.label} onPress={a.onPress} />
          ))}
          {save ? <Button label="Save" size="md" onPress={save.onPress} loading={save.saving} disabled={save.disabled} /> : null}
        </View>
      </View>
      {condensed ? (
        <View testID={testID && `${testID}-condensed`} pointerEvents="none" style={[styles.condensed, { top, height: circle, left: inset, right: inset }]}>
          <Text
            accessibilityRole="header"
            style={[font('bodyStrong', bold, FONT_FAMILY.brand[700]), styles.ink, styles.centre]}
            maxFontSizeMultiplier={CONTROL_FONT_CAP}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: SPACE.lg },
  roomBelow: { paddingBottom: SPACE.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  titles: { flex: 1, minWidth: 0 },
  ink: { color: COLOR.textPrimary },
  sub: { color: COLOR.textSecondary },
  right: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  condensed: { position: 'absolute', justifyContent: 'center' },
  centre: { textAlign: 'center' },
  contrast: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, backgroundColor: MATERIAL.hairlineIncreaseContrast },
})
