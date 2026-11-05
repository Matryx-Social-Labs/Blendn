import { Image, View, useWindowDimensions } from 'react-native'

import { SPACE } from '../../lib/design/tokens'

import { assetAspect } from './authForm'

/*
 * The frame the intro animation lands on: the gradient mark and the white wordmark, generated from its last frame so the still
 * and the animation agree. The wordmark is this asset, never live text (Flow 1's `lockup`), and the whole is decorative.
 */
const LOCKUP = require('../../assets/logo/lockup-hero.png')
// Fallback only: the real ratio comes from the bundler, so re-exporting the art cannot distort the layout.
const LOCKUP_ASPECT = assetAspect(LOCKUP, 674 / 202)

/** 60 pt on the landing, 40 pt above a form (Flow 1). */
export const LOCKUP_HEIGHT = { landing: 60, form: 40 } as const

/**
 * The Blend'n lockup at a fixed height, its width from the file. Hidden from a screen reader: the screen's own words say
 * what it is for, and the name is not what somebody needs read to them here.
 *
 * Height drives it, not a percentage width: a percentage inside a percentage-width flex parent rendered the lockup several
 * times too large on device, and `maxWidth` means a wrong ratio can only letterbox.
 */
export function Lockup({ size, testID }: { size: keyof typeof LOCKUP_HEIGHT; testID?: string }) {
  const height = LOCKUP_HEIGHT[size]
  /*
   * The cap is a number, 86% of the window's content width. As `'86%'` it resolved against a parent that shrink-wraps the
   * image, i.e. against the image itself, and drew the lockup at 86% (the mockup diff, 2026-11-05: 14% under the board).
   */
  const maxWidth = MAX_SHARE * (useWindowDimensions().width - 2 * SPACE.gutter)
  return (
    <View testID={testID} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image testID={testID && `${testID}-image`} source={LOCKUP} resizeMode="contain" style={{ height, width: height * LOCKUP_ASPECT, maxWidth }} />
    </View>
  )
}

const MAX_SHARE = 0.86
