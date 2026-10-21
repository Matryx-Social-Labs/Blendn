import { appliedFilters, NO_FILTERS, withoutFilter } from '../lib/eventFilters'
import { eventShareText, peekActions } from '../lib/pulsePeek'

describe('what the peek offers, in the frame\'s order', () => {
  it('Save, Share, Preview for an event you are not at', () => {
    expect(peekActions({ interested: false, checkedIn: false, withinFence: false })).toEqual(['save', 'share', 'preview'])
  })
  it('a saved event offers to take it back, not Save', () => {
    expect(peekActions({ interested: true, checkedIn: false, withinFence: false })).toEqual(['unsave', 'share', 'preview'])
  })
  it('inside the fence it adds Check in (the pass\'s hold); checked in it adds Check out instead, never both', () => {
    expect(peekActions({ interested: false, checkedIn: false, withinFence: true })).toEqual(['save', 'share', 'preview', 'checkIn'])
    expect(peekActions({ interested: false, checkedIn: true, withinFence: true })).toEqual(['save', 'share', 'preview', 'checkOut'])
    expect(peekActions({ interested: false, checkedIn: true, withinFence: false })).toEqual(['save', 'share', 'preview', 'checkOut'])
  })
  it('shares the name, the venue and the address, skipping what is missing', () => {
    expect(eventShareText({ title: 'Vinyl Night', venue_name: 'Toit', address: '100 Feet Road' })).toBe('Vinyl Night\nToit\n100 Feet Road')
    expect(eventShareText({ title: 'Vinyl Night', venueName: 'Toit', address: null })).toBe('Vinyl Night\nToit')
  })
})

describe('the applied filters, as removable chips', () => {
  const categories = [{ slug: 'music', name: 'Live music' }]
  it('is empty with no filter, and says each choice that is on', () => {
    expect(appliedFilters(NO_FILTERS, categories)).toEqual([])
    expect(appliedFilters({ categorySlug: 'music', when: 'weekend', radiusKm: 5 }, categories)).toEqual([
      { field: 'categorySlug', label: 'Live music' },
      { field: 'when', label: 'This weekend' },
      { field: 'radiusKm', label: 'Within 5 km' },
    ])
  })
  it('a category the list no longer knows is named by its slug, not hidden', () => {
    expect(appliedFilters({ categorySlug: 'gone', when: 'any' }, categories)).toEqual([{ field: 'categorySlug', label: 'gone' }])
  })
  it('taking one back leaves the others', () => {
    const f = { categorySlug: 'music', when: 'weekend' as const, radiusKm: 5 }
    expect(withoutFilter(f, 'when')).toEqual({ categorySlug: 'music', when: 'any', radiusKm: 5 })
    expect(withoutFilter(f, 'radiusKm').radiusKm).toBeUndefined()
    expect(withoutFilter(f, 'categorySlug')).toMatchObject({ when: 'weekend', radiusKm: 5 })
  })
})
