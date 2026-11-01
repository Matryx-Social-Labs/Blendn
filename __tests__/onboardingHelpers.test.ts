import { photoNote, readyPhotos, withMainFirst, type PhotoTile } from '../components/onboarding/photoTiles'
import { isPreciseLocationOff } from '../lib/preciseLocation'
import { bioWithPrompt, promptFits, stepPayload } from '../lib/onboarding'

describe('bioWithPrompt', () => {
  it('starts an empty bio with the prompt and a space to type after', () => {
    expect(bioWithPrompt('', 'Ask me about…', 500)).toBe('Ask me about… ')
    expect(bioWithPrompt('   ', 'Ask me about…', 500)).toBe('Ask me about… ')
  })
  it('adds to what is there on its own line', () => {
    expect(bioWithPrompt('Coffee person.  ', 'Ask me about…', 500)).toBe('Coffee person.\nAsk me about… ')
  })
  it('leaves the bio alone when the whole would not fit', () => {
    const bio = 'x'.repeat(495)
    expect(bioWithPrompt(bio, 'Ask me about…', 500)).toBe(bio)
  })
})

describe('promptFits', () => {
  it('is whether the prompt has room, so a chip that would do nothing can be dimmed', () => {
    expect(promptFits('', 'Ask me about…', 500)).toBe(true)
    expect(promptFits('x'.repeat(495), 'Ask me about…', 500)).toBe(false)
  })
})

describe('the journey fields', () => {
  it('belong to Edit profile now: no onboarding step sends them, even when an older draft holds them', () => {
    const draft = { location: 'Toronto', occupation: 'Designer', work_field: 'design', expertise: ['design_brand'], interests: ['Film'] }
    for (const step of ['basics', 'preferences', 'details', 'media', 'location', 'ready'] as const) {
      const body = stepPayload(step, draft)
      expect(body).not.toHaveProperty('occupation')
      expect(body).not.toHaveProperty('work_field')
      expect(body).not.toHaveProperty('expertise')
      expect(body).not.toHaveProperty('location')
    }
    expect(stepPayload('details', draft)).toEqual({ interests: ['Film'] })
  })
})

describe('isPreciseLocationOff', () => {
  it('is a granted-but-approximate location on either platform', () => {
    expect(isPreciseLocationOff({ granted: true, ios: { accuracy: 'reduced' } } as never)).toBe(true)
    expect(isPreciseLocationOff({ granted: true, android: { accuracy: 'coarse' } } as never)).toBe(true)
  })
  it('is not a refusal, a question not asked, or the full thing', () => {
    expect(isPreciseLocationOff({ granted: false, ios: { accuracy: 'reduced' } } as never)).toBe(false)
    expect(isPreciseLocationOff({ granted: true, ios: { accuracy: 'full' } } as never)).toBe(false)
    expect(isPreciseLocationOff({ granted: true, android: { accuracy: 'fine' } } as never)).toBe(false)
    expect(isPreciseLocationOff(null)).toBe(false)
  })
})

describe('photo tiles', () => {
  const tiles: PhotoTile[] = [
    { key: 'a', state: 'ready', url: 'u1' },
    { key: 'b', state: 'uploading', uri: 'f2', progress: 0.5 },
    { key: 'c', state: 'failed', uri: 'f3' },
    { key: 'd', state: 'ready', url: 'u4' },
  ]
  it('sends only the photos the server has, in order', () => {
    expect(readyPhotos(tiles)).toEqual(['u1', 'u4'])
  })
  it('moves the chosen one to the front and leaves an unknown key alone', () => {
    expect(withMainFirst(tiles, 'd').map((t) => t.key)).toEqual(['d', 'a', 'b', 'c'])
    expect(withMainFirst(tiles, 'zzz').map((t) => t.key)).toEqual(['a', 'b', 'c', 'd'])
  })
  it('captions by how many there are', () => {
    expect(photoNote(0)).toMatch(/main photo is the one people see/)
    // The limit is said once, by the subtitle (GO-11, A11).
    for (const n of [0, 1, 4]) expect(photoNote(n)).not.toMatch(/6|six/i)
    expect(photoNote(1)).toMatch(/This is your main photo/)
    expect(photoNote(4)).toMatch(/Tap any photo/)
  })
})
