import { useEffect, useState } from 'react'
import { StyleSheet } from 'react-native'
import Animated from 'react-native-reanimated'

import { MAP_THEME } from '../../lib/mapTheme'
import { SPACE } from '../../lib/theme'
import { Text } from '../ui/Text'
import { useReduceMotion } from './MapLitLayers'

const FADE = { transition: `opacity ${MAP_THEME.credit.fadeMs}ms ease-out` }

/**
 * The map's credit, in its top corner as the map opens (OSMF attribution
 * guidelines): it fades on the first gesture or after a few seconds, and with
 * Reduce Motion it is simply gone. Once gone it stays gone for this mount.
 * About › Map data lists every credit with its link (`MAP_CREDITS`).
 */
export function MapCredit({ text, top, dismissed }: { text: string; top: number; dismissed: boolean }) {
  const reduceMotion = useReduceMotion()
  const [timedOut, setTimedOut] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), MAP_THEME.credit.showForMs)
    return () => clearTimeout(timer)
  }, [])
  // The first gesture latches it: set during render, React's way to keep state from a prop.
  const [gestured, setGestured] = useState(false)
  if (dismissed && !gestured) setGestured(true)
  const gone = timedOut || gestured || dismissed
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden={gone}
      importantForAccessibility={gone ? 'no-hide-descendants' : 'auto'}
      style={[styles.credit, { top, opacity: gone ? 0 : MAP_THEME.credit.opacity }, !reduceMotion && FADE]}
    >
      <Text variant="caption" color={MAP_THEME.credit.color}>
        {text}
      </Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  credit: { position: 'absolute', left: SPACE.md, right: SPACE.md },
})
