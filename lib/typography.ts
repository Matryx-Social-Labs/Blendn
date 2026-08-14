// Centralized typography tokens and helpers
// Use these variants across the app for consistent text styling.
// Type scale sourced from Figma (Zi2KcUzhEcLRdqyit22LdQ): Plus Jakarta Sans for
// headings/display, Manrope for body/labels/buttons.

import { TextStyle } from 'react-native'
import { APP_FONTS } from './theme'

export type TypographyVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'body1'
  | 'body2'
  | 'caption'
  | 'tiny'
  | 'button'

type VariantConfig = {
  fontSize: number
  lineHeight: number
  fontFamily: string
  fontWeight: TextStyle['fontWeight']
  letterSpacing?: number
  textTransform?: TextStyle['textTransform']
}

export const TYPOGRAPHY_TOKENS: Record<TypographyVariant, VariantConfig> = {
  display: { fontSize: 56, lineHeight: 56, fontFamily: APP_FONTS.headingExtraBold, fontWeight: '800', letterSpacing: -2.8 },
  h1: { fontSize: 48, lineHeight: 48, fontFamily: APP_FONTS.headingExtraBold, fontWeight: '800', letterSpacing: -2.4 },
  h2: { fontSize: 36, lineHeight: 40, fontFamily: APP_FONTS.headingExtraBold, fontWeight: '800', letterSpacing: -1.8 },
  h3: { fontSize: 24, lineHeight: 32, fontFamily: APP_FONTS.heading, fontWeight: '700', letterSpacing: 2.4, textTransform: 'uppercase' },
  h4: { fontSize: 20, lineHeight: 28, fontFamily: APP_FONTS.heading, fontWeight: '700' },
  body1: { fontSize: 18, lineHeight: 29, fontFamily: APP_FONTS.body, fontWeight: '400' },
  body2: { fontSize: 16, lineHeight: 24, fontFamily: APP_FONTS.body, fontWeight: '400' },
  caption: { fontSize: 14, lineHeight: 20, fontFamily: APP_FONTS.body, fontWeight: '400' },
  tiny: { fontSize: 10, lineHeight: 15, fontFamily: APP_FONTS.bodyBold, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  button: { fontSize: 16, lineHeight: 24, fontFamily: APP_FONTS.bodyBold, fontWeight: '700' },
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
    fontFamily: base.fontFamily,
    fontWeight: base.fontWeight,
  }

  if (base.letterSpacing !== undefined) {
    style.letterSpacing = base.letterSpacing
  }

  if (base.textTransform) {
    style.textTransform = base.textTransform
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
