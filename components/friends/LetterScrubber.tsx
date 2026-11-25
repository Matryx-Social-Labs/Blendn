import { useRef } from 'react'
import { StyleSheet, Text, View, type GestureResponderEvent } from 'react-native'

import { useSelection } from '../ds/shared'
import { H } from '../../lib/haptics'

// design-exception: the board's index letters are 600 10/13 with 1 between (fr.css `.frscrub`), smaller than any role, and fixed:
// an index column that grew with the text would no longer fit the screen.
const LETTER_SIZE = 10
const LETTER_LINE = 13
const LETTER_GAP = 1
const STEP = LETTER_LINE + LETTER_GAP
/** Wide enough for a thumb on a 10 pt column (the column's own width is the widest letter). */
const TOUCH_WIDTH = 24

/**
 * The A–Z index down the list's right edge (Flow 7 1-A, iOS Contacts): touch or drag over it and the list jumps to that letter,
 * a selection tick per letter crossed. Plain responder handlers on the JS thread: nothing here runs as a worklet.
 *
 * Hidden from screen readers: the letter heads are headers, so VoiceOver's and TalkBack's heading navigation already walks them,
 * and a 10 pt strip of 28 one-letter targets would only be noise.
 */
export function LetterScrubber({ letters, onLetter, testID }: { letters: readonly string[]; onLetter: (letter: string) => void; testID?: string }) {
  const sel = useSelection()
  const column = useRef<View>(null)
  const top = useRef(0)
  // The pitch the column was laid out at: Android rounds each letter to whole pixels (~14.3 on a 2.625 screen), so the fixed
  // `STEP` drifts a letter by the end of the column.
  const pitch = useRef(STEP)
  const last = useRef<string | null>(null)

  const pick = (e: GestureResponderEvent) => {
    const letter = letterAt(letters, e.nativeEvent.pageY - top.current, pitch.current)
    if (letter === last.current) return
    last.current = letter
    H.select()
    onLetter(letter)
  }

  return (
    <View
      ref={column}
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => {
        const { height } = e.nativeEvent.layout
        if (height > 0 && letters.length) pitch.current = (height + LETTER_GAP) / letters.length
        column.current?.measureInWindow((_x, y) => (top.current = y))
      }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={pick}
      onResponderMove={pick}
      onResponderRelease={() => (last.current = null)}
      onResponderTerminate={() => (last.current = null)}
      style={styles.column}
    >
      {letters.map((letter) => (
        <Text key={letter} allowFontScaling={false} style={[styles.letter, { color: sel.glyph }]}>
          {letter}
        </Text>
      ))}
    </View>
  )
}

/** Where a touch at `y` (from the column's top) lands, `step` apart. */
const letterAt = (letters: readonly string[], y: number, step: number) => letters[Math.min(letters.length - 1, Math.max(0, Math.floor(y / step)))]

const styles = StyleSheet.create({
  column: { width: TOUCH_WIDTH, alignItems: 'center', gap: LETTER_GAP },
  letter: { fontFamily: 'Satoshi_700Bold', fontSize: LETTER_SIZE, lineHeight: LETTER_LINE, textAlign: 'center' },
})
