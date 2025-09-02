import React from 'react'
import { Text, TextProps, TextStyle } from 'react-native'
import { getTypographyStyle, TypographyOptions, TypographyVariant } from '../lib/typography'

export interface TypographyProps extends Omit<TextProps, 'style'> {
  variant?: TypographyVariant
  color?: string
  align?: TextStyle['textAlign']
  transform?: TextStyle['textTransform']
  uppercaseButton?: boolean
  style?: TextStyle | TextStyle[]
}

export const Typography: React.FC<TypographyProps> = ({
  variant = 'body1',
  color,
  align,
  transform,
  uppercaseButton,
  style,
  children,
  ...rest
}) => {
  const base: TypographyOptions = {
    color,
    align,
    transform,
    uppercaseButton,
  }

  const textStyle = getTypographyStyle(variant, base)

  return (
    <Text {...rest} style={[textStyle, style]}>
      {children}
    </Text>
  )
}

export default Typography


