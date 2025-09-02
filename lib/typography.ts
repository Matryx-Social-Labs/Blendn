// Centralized typography tokens and helpers
// Use these variants across the app for consistent text styling.

import { TextStyle } from 'react-native'

export type TypographyVariant =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'body1'
  | 'body2'
  | 'caption'
  | 'button'

type VariantConfig = {
  fontSize: number
  lineHeight: number
  fontWeight: TextStyle['fontWeight']
  letterSpacing?: number
  textTransform?: TextStyle['textTransform']
}

// Base tokens derived from the provided spec.
export const TYPOGRAPHY_TOKENS: Record<TypographyVariant, VariantConfig> = {
  h1: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  h2: { fontSize: 22, lineHeight: 28, fontWeight: '600' },
  h3: { fontSize: 18, lineHeight: 24, fontWeight: '500' },
  body1: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  body2: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400', letterSpacing: 0.24 }, // tracking +2%
  button: { fontSize: 16, lineHeight: 20, fontWeight: '500' },
}

export type TypographyOptions = {
  color?: string
  align?: TextStyle['textAlign']
  transform?: TextStyle['textTransform']
  numberOfLines?: number
  // When true, applies all-caps for buttons (optional per spec)
  uppercaseButton?: boolean
}

export function getTypographyStyle(
  variant: TypographyVariant,
  options: TypographyOptions = {}
): TextStyle {
  const base = TYPOGRAPHY_TOKENS[variant]
  const style: TextStyle = {
    fontSize: base.fontSize,
    lineHeight: base.lineHeight,
    fontWeight: base.fontWeight,
  }

  if (base.letterSpacing !== undefined) {
    style.letterSpacing = base.letterSpacing
  }

  if (options.color) {
    style.color = options.color
  }

  if (options.align) {
    style.textAlign = options.align
  }

  if (options.transform) {
    style.textTransform = options.transform
  }

  if (variant === 'button' && options.uppercaseButton) {
    style.textTransform = 'uppercase'
  }

  return style
}


