import React from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'

import { COLOR, DURATION, RADIUS } from '../lib/design/tokens'
import { SPINNER_GRACE_MS } from './ds/shared'

type SkeletonProps = {
  width?: number | string
  height?: number
  borderRadius?: number
  style?: StyleProp<ViewStyle>
}

/*
 * A skeleton is a still shape (DS #17): nothing loops, and nothing is drawn for a wait under ~300 ms — a load that
 * fast just shows its content, with no flash of grey first. Past that it fades in over `quick`, and the screen
 * crossfades to its content when the data lands (each screen, only when a skeleton was actually shown).
 *
 * The same under Reduce Motion (#17 rm "Same"): a fade is not movement.
 */
const appear = FadeIn.delay(SPINNER_GRACE_MS).duration(DURATION.quick)

export const Skeleton: React.FC<SkeletonProps> = ({ width = '100%', height = 12, borderRadius = RADIUS.thumb, style }) => (
  <Animated.View entering={appear} style={[{ width, height, borderRadius, backgroundColor: COLOR.surfaceSunken } as ViewStyle, style]} />
)

export const SkeletonLine: React.FC<Pick<SkeletonProps, 'width' | 'style'>> = ({ width = '100%', style }) => (
  <Skeleton width={width} height={12} borderRadius={RADIUS.capsule} style={style} />
)

export const SkeletonCircle: React.FC<Pick<SkeletonProps, 'width' | 'style'>> = ({ width = 40, style }) => (
  <Skeleton width={width} height={Number(width)} borderRadius={RADIUS.capsule} style={style} />
)

export const SkeletonBlock = Skeleton

