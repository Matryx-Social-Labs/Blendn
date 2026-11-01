import { Text } from 'react-native'

import { GRADIENT } from '../../lib/design/tokens'
import { colourAt } from '../../lib/mapLit'

/**
 * Each glyph's colour, `GRADIENT.text` from the first to the last. One glyph takes the first stop.
 *
 * Glyph by glyph rather than a masked gradient: a mask is a native module (a new build for every client), and spans wrap
 * with the sentence. At display size the step between two glyphs is too small to see. The stops are measured AA against
 * the lit backdrop in `__tests__/onboardingDirectionA.test.tsx`.
 */
export function glyphColours(text: string): string[] {
  const glyphs = Array.from(text)
  return glyphs.map((_, i) => colourAt(GRADIENT.text.colors, glyphs.length > 1 ? i / (glyphs.length - 1) : 0))
}

/** The question's key words in the brand gradient. Nested in the question's `<Text>`, so a screen reader reads one sentence. */
export function GradientWords({ text }: { text: string }) {
  const colours = glyphColours(text)
  return (
    <>
      {Array.from(text).map((glyph, i) => (
        <Text key={i} style={{ color: colours[i] }}>
          {glyph}
        </Text>
      ))}
    </>
  )
}
