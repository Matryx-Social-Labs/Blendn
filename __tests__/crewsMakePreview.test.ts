/**
 * D-L17: Make a crew's stand-in emblem was any of twelve palettes (an off-hue blue on a rose screen). It is drawn on the
 * rose palette now, stable for its seed; a made crew's own seed (Edit crew) is drawn as the server drew it.
 * Negative control: returning the seed unchanged fails the first test for most seeds (11 in 12).
 */
import { EMBLEM_PALETTES, emblemFor } from '../components/ds/CrewEmblem'
import { previewEmblemSeed } from '../components/crews/MakeSteps'

describe('the stand-in emblem in Make a crew', () => {
  it('is on the rose palette for any new crew’s seed, and the same every render', () => {
    for (const seed of ['preview-a1', 'preview-zz9', 'preview-k3j2', 'preview-0']) {
      const drawn = previewEmblemSeed(seed)
      expect(emblemFor(drawn).palette).toBe(EMBLEM_PALETTES.length - 1)
      expect(previewEmblemSeed(seed)).toBe(drawn)
    }
  })

  it('leaves a made crew’s own emblem as the server drew it', () => {
    expect(previewEmblemSeed('e7c1d2')).toBe('e7c1d2')
  })
})
