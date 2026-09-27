import { Text as RNText, type TextProps } from 'react-native'

import { TYPE, type TypeRole } from '../../lib/theme'

/**
 * Text on the design system's type scale.
 *
 * A role, not a size: `variant="meta"` is a date or a venue wherever it
 * appears, so changing what a date looks like is one edit in `lib/theme.ts`.
 * `color` is the one thing a call site commonly varies, so it is a prop rather
 * than a style override.
 */
export function Text({
  variant = 'body',
  color,
  style,
  ...rest
}: TextProps & { variant?: TypeRole; color?: string }) {
  return <RNText {...rest} style={[TYPE[variant], color ? { color } : null, style]} />
}
