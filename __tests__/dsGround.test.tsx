/*
 * The ground a control sits on (prompt 13 §0): the resting chip fill and the segmented track follow it, so no call site
 * passes a fill.
 */
import { chipRest, trackFill } from '../components/ds/shared'
import { COLOR } from '../lib/design/tokens'

describe('chipRest', () => {
  it('is the surface on ink, the sunken surface on a card, the glass fill on glass', () => {
    expect(chipRest('ink')).toBe(COLOR.surface)
    expect(chipRest('surface')).toBe(COLOR.surfaceSunken)
    expect(chipRest('glass')).toBe(COLOR.chipFillOnGlass)
  })
})

describe('trackFill', () => {
  it('is solid on every ground: never glass', () => {
    expect(trackFill('ink')).toBe(COLOR.surface)
    expect(trackFill('glass')).toBe(COLOR.surface)
    expect(trackFill('surface')).toBe(COLOR.surfaceSunken)
  })
})
