import { photoNote, readyPhotos, withMainFirst, type PhotoTile } from '../components/onboarding/photoTiles'
import { isPreciseLocationOff } from '../components/onboarding/preciseLocation'
import { bioWithPrompt, DEFAULT_MAX_EXPERTISE, keepExpertise, stepPayload, toggleExpertise } from '../lib/onboarding'

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

describe('expertise', () => {
  const byField = { design: [{ slug: 'design_product' }, { slug: 'design_brand' }], finance: [{ slug: 'finance_banking' }] }
  it('keeps only what belongs to the field, and nothing for no field', () => {
    expect(keepExpertise(['design_product', 'finance_banking'], 'design', byField)).toEqual(['design_product'])
    expect(keepExpertise(['design_product'], 'finance', byField)).toEqual([])
    expect(keepExpertise(['design_product'], undefined, byField)).toEqual([])
    expect(keepExpertise(['design_product'], 'design', undefined)).toEqual([])
  })
  it('picks, puts back, and stops at the cap without hiding anything', () => {
    expect(toggleExpertise([], 'a')).toEqual(['a'])
    expect(toggleExpertise(['a', 'b'], 'a')).toEqual(['b'])
    expect(toggleExpertise(['a', 'b', 'c'], 'd')).toEqual(['a', 'b', 'c'])
    expect(toggleExpertise(['a', 'b', 'c'], 'c')).toEqual(['a', 'b'])
    expect(toggleExpertise(['a'], 'b', 1)).toEqual(['a'])
    expect(DEFAULT_MAX_EXPERTISE).toBe(3)
  })
  it('is a journey field, sent when answered and dropped when not', () => {
    expect(stepPayload('journey', { work_field: 'design', expertise: ['design_brand'] })).toEqual({ work_field: 'design', expertise: ['design_brand'] })
    expect(stepPayload('journey', { work_field: 'design' })).toEqual({ work_field: 'design' })
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
    expect(photoNote(1)).toMatch(/This is your main photo/)
    expect(photoNote(4)).toMatch(/Tap any photo/)
  })
})
