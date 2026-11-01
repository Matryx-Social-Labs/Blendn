import { Text } from 'react-native'

import { GRADIENT, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { colourAt } from '../../lib/mapLit'

/**
 * Each glyph's colour, `GRADIENT.text` from the first to the last. One glyph takes the first stop.
 *
 * Glyph by glyph rather than a masked gradient: a mask is a native module (a new build for every client), and spans wrap
 * with the sentence. At display size the step between two glyphs is too small to see. The stops are measured AA against
 * the lit backdrop in `__tests__/onboardingDirectionA.test.tsx`.
 */
export function glyphColours(text: string): string[] {
  const glyphs = pieces(text)
  return glyphs.map((_, i) => colourAt(GRADIENT.text.colors, glyphs.length > 1 ? i / (glyphs.length - 1) : 0))
}

/**
 * Latin (Basic, Latin-1, Extended-A and B) and its punctuation, with no combining marks: safe to split into code points.
 * Plain ranges rather than `\p{Script=…}`, which an older Hermes may not parse.
 */
const SPLITS_CLEANLY = /^[\u0020-\u024F\u2018-\u201F\u2026]*$/

/**
 * What gets a colour of its own. A name in a script that shapes across letters (Devanagari, Tamil, Arabic) or that carries
 * combining marks would come apart in separate spans, so it goes word by word, each word whole.
 */
function pieces(text: string): string[] {
  return SPLITS_CLEANLY.test(text) ? Array.from(text) : text.split(/(\s+)/).filter(Boolean)
}

/** The question's key words in the brand gradient. Nested in the question's `<Text>`, so a screen reader reads one sentence. */
export function GradientWords({ text }: { text: string }) {
  const colours = glyphColours(text)
  return (
    <>
      {pieces(text).map((glyph, i) => (
        <Text key={i} maxFontSizeMultiplier={MAX_FONT_SCALE.display} style={{ color: colours[i] }}>
          {glyph}
        </Text>
      ))}
    </>
  )
}
