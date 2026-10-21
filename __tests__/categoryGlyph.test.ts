/*
 * The glyph for a category slug: the server's emoji is no longer drawn, so each top-level category has a Lucide glyph and a
 * slug that has none gets none (the chip's light does the work).
 */
import { categoryGlyph } from '../lib/categoryGlyph'
import { GLYPH_VERB } from '../components/ui/Glyph'

describe('categoryGlyph', () => {
  it.each([
    ['music', 'music-2'],
    ['nightlife', 'moon'],
    ['food-drink', 'utensils'],
    ['sports', 'trophy'],
    ['arts-culture', 'palette'],
    ['tech', 'cpu'],
    ['networking', 'handshake'],
    ['outdoor', 'mountain'],
    ['comedy', 'mic-vocal'],
  ])('%s is %s', (slug, glyph) => {
    expect(categoryGlyph(slug)).toBe(glyph)
  })

  it('an unknown slug has no glyph, and neither has one that is only an Object property', () => {
    expect(categoryGlyph('underwater-basket-weaving')).toBeUndefined()
    expect(categoryGlyph('')).toBeUndefined()
    expect(categoryGlyph('toString')).toBeUndefined()
  })

  it('every glyph is one the Glyph verbs know: a category glyph is never a generic pop by accident', () => {
    for (const slug of ['music', 'nightlife', 'food-drink', 'sports', 'arts-culture', 'tech', 'networking', 'outdoor', 'comedy']) {
      expect(GLYPH_VERB[categoryGlyph(slug)!]).toBeDefined()
    }
  })
})
