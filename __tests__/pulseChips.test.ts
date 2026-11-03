import { NO_FILTERS, type EventFilters } from '../lib/eventFilters'
import { chipCount, extraApplied, NEAR_KM, quickChips, toggleQuick, vibeOf } from '../lib/pulseChips'

/**
 * The chips that are the Pulse's header (Flow 3 · Pulse, Option C): Tonight and This weekend with the server's counts,
 * Within 2 km only where distance means something, one vibe from the week's data, then Filters.
 */

const CATS = [
  { slug: 'music', name: 'Live music' },
  { slug: 'food', name: 'Food & drink' },
  { slug: 'sport', name: 'Run clubs' },
]
const VIBE = { slug: 'music', name: 'Live music' }

describe('chipCount', () => {
  it('groups thousands the US way and never shows a count under five', () => {
    expect(chipCount(1038)).toBe('1,038')
    expect(chipCount(214)).toBe('214')
    expect(chipCount(5)).toBe('5')
    expect(chipCount(4)).toBeUndefined()
    expect(chipCount(0)).toBeUndefined()
    expect(chipCount(null)).toBeUndefined()
  })
})

describe('quickChips', () => {
  const base = { filters: NO_FILTERS, counts: { tonight: 214, weekend: 1038 }, nearOn: true, vibe: VIBE }

  it('time first, then distance, then the vibe, with counts on the time chips only', () => {
    const chips = quickChips(base)
    expect(chips.map((c) => c.key)).toEqual(['tonight', 'weekend', 'near', 'vibe'])
    expect(chips.map((c) => c.label)).toEqual(['Tonight', 'This weekend', `Within ${NEAR_KM} km`, 'Live music'])
    expect(chips[0].count).toBe('214')
    expect(chips[1].count).toBe('1,038')
    expect(chips[2].count).toBeUndefined()
    expect(chips[3].count).toBeUndefined()
    expect(chips.every((c) => !c.selected)).toBe(true)
  })

  it('reads the count in the label, so a screen reader hears it', () => {
    const [tonight, weekend, near] = quickChips(base)
    expect(tonight.accessibilityLabel).toBe('Tonight, 214 events')
    expect(weekend.accessibilityLabel).toBe('This weekend, 1,038 events')
    expect(near.accessibilityLabel).toBe(`Within ${NEAR_KM} km`)
  })

  it('a quiet tonight shows the chip with no number', () => {
    const [tonight] = quickChips({ ...base, counts: { tonight: 3, weekend: null } })
    expect(tonight.count).toBeUndefined()
    expect(tonight.accessibilityLabel).toBe('Tonight')
  })

  it('no distance chip without a fix in the browsed city, and no vibe chip without data', () => {
    expect(quickChips({ ...base, nearOn: false, vibe: null }).map((c) => c.key)).toEqual(['tonight', 'weekend'])
  })

  it('each chip is lit by the filter it applies', () => {
    const on = (f: EventFilters) => quickChips({ ...base, filters: f }).filter((c) => c.selected).map((c) => c.key)
    expect(on({ when: 'today' })).toEqual(['tonight'])
    expect(on({ when: 'weekend', radiusKm: NEAR_KM })).toEqual(['weekend', 'near'])
    expect(on({ when: 'any', categorySlug: 'music' })).toEqual(['vibe'])
    // Control: a filter the chips do not stand for lights none of them.
    expect(on({ when: 'week', radiusKm: 5, categorySlug: 'food' })).toEqual([])
  })
})

describe('toggleQuick', () => {
  it('Tonight and This weekend are one choice: picking one replaces the other', () => {
    const tonight = toggleQuick(NO_FILTERS, 'tonight', VIBE)
    expect(tonight).toEqual({ when: 'today' })
    expect(toggleQuick(tonight, 'weekend', VIBE)).toEqual({ when: 'weekend' })
    expect(toggleQuick(tonight, 'tonight', VIBE)).toEqual({ when: 'any' })
  })

  it('distance and vibe toggle their own field and keep the rest', () => {
    const f: EventFilters = { when: 'today' }
    expect(toggleQuick(f, 'near', VIBE)).toEqual({ when: 'today', radiusKm: NEAR_KM })
    expect(toggleQuick({ when: 'today', radiusKm: NEAR_KM }, 'near', VIBE)).toEqual({ when: 'today', radiusKm: undefined })
    expect(toggleQuick(f, 'vibe', VIBE)).toEqual({ when: 'today', categorySlug: 'music' })
    expect(toggleQuick({ when: 'today', categorySlug: 'music' }, 'vibe', VIBE)).toEqual({ when: 'today', categorySlug: undefined })
  })

  it('returns a new object, never the one it was given', () => {
    const f: EventFilters = { when: 'any' }
    expect(toggleQuick(f, 'tonight', VIBE)).not.toBe(f)
    expect(f).toEqual({ when: 'any' })
  })
})

describe('extraApplied', () => {
  it('only filters the chips do not already show are drawn as removable chips', () => {
    expect(extraApplied({ when: 'today', radiusKm: NEAR_KM, categorySlug: 'music' }, CATS, VIBE)).toEqual([])
    expect(extraApplied({ when: 'week', radiusKm: 5, categorySlug: 'food' }, CATS, VIBE).map((a) => a.label)).toEqual(['Food & drink', 'This week', 'Under 5 km'])
  })
})

describe('vibeOf', () => {
  it('the busiest category in the loaded events, by its server name', () => {
    const events = [{ category_group: 'food' }, { category_group: 'music' }, { category_group: 'music' }, { category_group: null }]
    expect(vibeOf(events, CATS)).toEqual(VIBE)
  })
  it('none when nothing is categorised, or the list is empty', () => {
    expect(vibeOf([{ category_group: null }], CATS)).toBeNull()
    expect(vibeOf([], CATS)).toBeNull()
  })
})
