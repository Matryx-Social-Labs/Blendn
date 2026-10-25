import { useEffect, useState } from 'react'
import { StyleSheet } from 'react-native'
import Animated from 'react-native-reanimated'

import { MAP_THEME } from '../../lib/mapTheme'
import { SPACE } from '../../lib/theme'
import { Text } from '../ui/Text'
import { useReducedMotion } from '../../lib/motion'

const FADE = { transition: `opacity ${MAP_THEME.credit.fadeMs}ms ease-out` }

/**
 * The map's credit, in its top corner (OSMF attribution guidelines): there
 * when the map first draws, and again whenever what it credits changes — our
 * buildings drawing after a pick to Bengaluru, say (review H1) — each time
 * until the next gesture or a few seconds. It fades; with Reduce Motion it is
 * simply gone. About › Map data lists every credit with its link (`MAP_CREDITS`).
 *
 * `gestures` counts the person's gestures on the map: one after the credit
 * appeared puts it away.
 */
export function MapCredit({ text, top, gestures }: { text: string; top: number; gestures: number }) {
  const reduceMotion = useReducedMotion()
  // The credit as last put up: its line, the gesture count then, and whether its seconds are up.
  const [shown, setShown] = useState({ text, gestures, timedOut: false })
  // A new line is a new credit: up again (set during render, React's way to keep state from a prop).
  if (shown.text !== text) setShown({ text, gestures, timedOut: false })
  useEffect(() => {
    const timer = setTimeout(() => setShown((s) => (s.text === text ? { ...s, timedOut: true } : s)), MAP_THEME.credit.showForMs)
    return () => clearTimeout(timer)
  }, [text])
  const gone = shown.text !== text ? false : shown.timedOut || gestures !== shown.gestures
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
