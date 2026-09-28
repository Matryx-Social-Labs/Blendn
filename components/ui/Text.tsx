import { Text as RNText, type TextProps } from 'react-native'

import { MAX_FONT_SCALE, TYPE, type TypeRole } from '../../lib/theme'

/**
 * Text on the design system's type scale.
 *
 * A role, not a size: `variant="meta"` is a date or a venue wherever it
 * appears, so changing what a date looks like is one edit in `lib/theme.ts`.
 * `color` is the one thing a call site commonly varies, so it is a prop rather
 * than a style override.
 *
 * Each role also caps how far the phone's text size may grow it
 * (`MAX_FONT_SCALE`): reading text scales freely, text in a fixed box (a
 * button, a tab label) stops before it is clipped. A call site's own
 * `maxFontSizeMultiplier` wins.
 */
export function Text({
  variant = 'body',
  color,
  style,
  maxFontSizeMultiplier,
  ...rest
}: TextProps & { variant?: TypeRole; color?: string }) {
  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? MAX_FONT_SCALE[variant]}
      {...rest}
      style={[TYPE[variant], color ? { color } : null, style]}
    />
  )
}
