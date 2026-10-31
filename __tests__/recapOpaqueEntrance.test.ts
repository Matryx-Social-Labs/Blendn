import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * SCRUM-962: "the Room's people were visible behind the That's a wrap title". The Recap's layer faded in as a whole while the
 * Room above it faded out, so for a few frames the Room's grid showed through the title. The Recap is opaque from its first
 * frame (its blocks do the fading, #43) and the Room leaves at once when the night is over.
 */
const code = readFileSync(join(__dirname, '..', 'components', 'blendn', 'BlendnScreen.tsx'), 'utf8')

describe('the Recap never shows the Room through it', () => {
  it('its layer does not fade in as a whole: the page is opaque from the first frame', () => {
    const layer = code.split('\n').find((l) => l.includes('key="ended"')) ?? ''
    expect(layer).toContain('styles.layer')
    expect(layer).not.toMatch(/entering=/)
  })

  it('the Room above it leaves at once when the mode is ended, and fades out otherwise', () => {
    expect(code).toMatch(/exiting=\{mode === 'ended' \? undefined : FadeOut\.duration\(DURATION\.quick\)\}/)
  })
})
