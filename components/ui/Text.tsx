import { Text as RNText, type TextProps } from 'react-native'

import { COLOR, MAX_FONT_SCALE, TYPE } from '../../lib/design/tokens'
import { font, useBoldText } from '../ds/shared'

export type TypeRole = keyof typeof TYPE

/** Secondary roles read in `textSecondary` unless the call site says otherwise; everything else in `textPrimary`. */
const SECONDARY: ReadonlySet<TypeRole> = new Set<TypeRole>(['meta', 'note', 'caption', 'label'])

/**
 * Text on the design system's type roles (`lib/design/tokens` TYPE: Satoshi for words, Geist Mono for labels).
 *
 * A role, not a size. `color` is the one thing a call site commonly varies, so it is a prop rather than a style
 * override. Bold Text steps the family up (`font`). Each role caps how far the phone's text size may grow it
 * (`MAX_FONT_SCALE`); a call site's own `maxFontSizeMultiplier` wins.
 */
export function Text({
  variant = 'body',
  color,
  style,
  maxFontSizeMultiplier,
  ...rest
}: TextProps & { variant?: TypeRole; color?: string }) {
  const bold = useBoldText()
  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? MAX_FONT_SCALE[variant]}
      {...rest}
      style={[font(variant, bold), { color: color ?? (SECONDARY.has(variant) ? COLOR.textSecondary : COLOR.textPrimary) }, style]}
    />
  )
}
