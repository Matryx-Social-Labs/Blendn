import { useState } from 'react'
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'

import ScalePress from '../motion/ScalePress'
import { Icon, type IconName } from '../ui/Icon'
import { COLOR, FONT_FAMILY, ICON, PRESS, RADIUS, SPACE } from '../../lib/design/tokens'
import { font, IC_HAIRLINE, PRESSED_WASH, useBoldText, useIncreaseContrast } from './shared'

/** The tile's floor (the page); it grows with its text, nothing is capped. */
const TILE_HEIGHT = 76
/** Decision 66: seven or more fold behind a "+N more" tile after the first five. */
const FOLD_AT = 7
const SHOWN_FOLDED = 5

export type AmenityTileProps = {
  /** Uppercase in the string ("DOORS"): it is read as written. */
  label: string
  value: string
  /** Numbers, times and counts: Geist Mono, tabular. Words stay Satoshi. */
  mono?: boolean
  icon?: IconName
  /** A tile that pushes (Where → the map) is a button; the rest are text. */
  onPress?: () => void
  testID?: string
  /** Placement only (the grid's basis); never the look. */
  style?: StyleProp<ViewStyle>
}

/**
 * The Scene's bento and the venue page's "Good to know"
 * (guidelines/components/AmenityTile.html): a 76 pt surface tile at radius 16,
 * a Geist Mono label on top and one value at the foot. A fact, so no haptic;
 * read as "{label}, {value}". Increase Contrast: the label goes white and the
 * tile takes the 50% hairline. Bold Text steps both up.
 */
export function AmenityTile({ label, value, mono = false, icon, onPress, testID, style }: AmenityTileProps) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const android = Platform.OS === 'android'
  const ink = contrast ? COLOR.textPrimary : COLOR.textTertiary
  const body = (
    <>
      <View style={styles.label}>
        {icon ? (
          <View testID={testID && `${testID}-icon`}>
            <Icon name={icon} size={ICON.inline} color={ink} />
          </View>
        ) : null}
        <Text style={[font('label', bold), { color: ink }]}>{label}</Text>
      </View>
      {mono ? (
        <Text style={[font('bodyStrong', bold, FONT_FAMILY.mono[500]), styles.value, styles.tabular]}>{value}</Text>
      ) : (
        <Text numberOfLines={1} style={[font('bodyStrong', bold), styles.value]}>
          {value}
        </Text>
      )}
    </>
  )
  const look = [styles.tile, contrast && IC_HAIRLINE, style]
  const name = `${label}, ${value}`

  if (!onPress) {
    return (
      <View testID={testID} accessible accessibilityLabel={name} style={look}>
        {body}
      </View>
    )
  }
  return (
    <ScalePress
      testID={testID}
      onPress={onPress}
      pressedScale={android ? 1 : PRESS.scale}
      android_ripple={{ color: PRESSED_WASH.android, foreground: true }}
      accessibilityRole="button"
      accessibilityLabel={name}
      style={look}
    >
      {body}
    </ScalePress>
  )
}

/**
 * Tiles 2-up with 12 pt gutters; a lone last tile takes the full width. Seven
 * or more show the first five and a "+N more" tile, which expands in place.
 */
export function AmenityGrid({ tiles, testID }: { tiles: AmenityTileProps[]; testID?: string }) {
  const [open, setOpen] = useState(false)
  const folded = !open && tiles.length >= FOLD_AT
  const shown = folded ? tiles.slice(0, SHOWN_FOLDED) : tiles
  return (
    <View testID={testID} style={styles.grid}>
      {shown.map((t, i) => (
        <AmenityTile key={`${t.label}-${t.value}`} testID={testID && `${testID}-${i}`} {...t} style={styles.cell} />
      ))}
      {folded ? (
        <AmenityTile
          label="AND MORE"
          value={`+${tiles.length - SHOWN_FOLDED} more`}
          onPress={() => setOpen(true)}
          testID={testID && `${testID}-more`}
          style={styles.cell}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  tile: {
    minHeight: TILE_HEIGHT,
    borderRadius: RADIUS.rowInCard,
    backgroundColor: COLOR.surface,
    padding: SPACE.md,
    justifyContent: 'space-between',
    gap: SPACE.sm,
    overflow: 'hidden',
  },
  label: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  value: { color: COLOR.textPrimary },
  tabular: { fontVariant: ['tabular-nums'] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md },
  cell: { flexGrow: 1, flexBasis: '40%' },
})
