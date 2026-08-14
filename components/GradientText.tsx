import React from 'react'
import { StyleProp, Text, TextStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import MaskedView from '@react-native-masked-view/masked-view'
import { APP_COLORS } from '../lib/theme'

interface GradientTextProps {
  children: React.ReactNode
  style?: StyleProp<TextStyle>
  colors?: [string, string]
  numberOfLines?: number
}

// Renders text filled with the brand coral→pink gradient (Figma's 135deg accent gradient).
export default function GradientText({ children, style, colors = APP_COLORS.accentGradient, numberOfLines }: GradientTextProps) {
  return (
    <MaskedView maskElement={<Text style={style} numberOfLines={numberOfLines}>{children}</Text>}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Text style={[style, { opacity: 0 }]} numberOfLines={numberOfLines}>{children}</Text>
      </LinearGradient>
    </MaskedView>
  )
}
