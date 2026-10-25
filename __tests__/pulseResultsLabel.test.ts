/**
 * The Pulse's search results overline ("3 EVENTS · BENGALURU", GO-16, audit A37): chrome over a list, so it stops at
 * CONTROL_FONT_CAP rather than wrapping to two giant lines at AX sizes. A source pin: the label lives inside the
 * Pulse screen, which is too large to render for one Text.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

it('caps the results overline at CONTROL_FONT_CAP', () => {
  const src = readFileSync(join(__dirname, '../app/(tabs)/events.tsx'), 'utf8')
  expect(src).toMatch(/<Text style=\{styles\.resultsLabelText\} accessibilityRole="header" maxFontSizeMultiplier=\{CONTROL_FONT_CAP\}>/)
})
