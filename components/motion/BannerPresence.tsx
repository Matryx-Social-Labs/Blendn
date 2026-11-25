import type { ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import Animated from 'react-native-reanimated'

import { useReducedMotion } from '../../lib/motion'
import { bannerFadeIn, bannerIn, bannerOut } from './presence'

/**
 * A banner that comes and goes with what it says (DS #44): it slides 16 pt and fades in over `base`, and leaves in a
 * quick fade; Reduce Motion keeps the fade. Render it conditionally (`{error ? <BannerPresence>…` ), never a bare
 * `<Banner>`: a bare one pops in and cuts out (motion audit M7, M15, M28; `__tests__/bannerPresence.test.ts`).
 */
export function BannerPresence({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduceMotion = useReducedMotion()
  return (
    <Animated.View entering={reduceMotion ? bannerFadeIn : bannerIn} exiting={bannerOut} style={style}>
      {children}
    </Animated.View>
  )
}
