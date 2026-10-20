import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Two things a Figma pass changed in behaviour, not looks (SCRUM-185).
 *
 * A secondary button wired to `skip()` advances without saving what is typed
 * on the screen, so its label must not promise a save. And the bio cap is one
 * number in three places (this screen, edit-profile, the server's schema); a
 * lower one here cuts a longer bio on its next edit.
 */
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('onboarding secondaries wired to skip()', () => {
  it.each(['journey', 'details', 'preferences'])('%s does not call it "Save"', (screen) => {
    const src = read(`app/onboarding/${screen}.tsx`)
    const label = src.match(/secondaryLabel="([^"]+)"/)?.[1] ?? ''
    expect(src).toContain('onSecondary={() => void skip()}')
    expect(label.toLowerCase()).not.toContain('save')
  })
})

describe('the bio cap', () => {
  it('is the same number on the onboarding step and the profile editor', () => {
    const limit = Number(read('app/onboarding/details.tsx').match(/const BIO_LIMIT = (\d+)/)?.[1])
    const editor = Number(read('app/edit-profile.tsx').match(/const BIO_LIMIT = (\d+)/)?.[1])
    expect(limit).toBe(editor)
    expect(limit).toBe(500)
  })
})

describe('the undrawn curation card is gone from basics (audit D2)', () => {
  it('draws no curation card, no art and no image under the date’s hint', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../app/onboarding/basics.tsx'), 'utf8')
    expect(src).not.toMatch(/curation|expo-image|expo-linear-gradient/i)
    expect(require('fs').existsSync(require('path').join(__dirname, '../assets/onboarding/curation.png'))).toBe(false)
  })
})
