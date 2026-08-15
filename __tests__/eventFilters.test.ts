import {
  activeFilterCount,
  filtersToQuery,
  hasActiveFilters,
  NO_FILTERS,
  whenToRange,
  type EventFilters,
} from '../lib/eventFilters'

/*
 * The filter vocabulary.
 *
 * Only one thing here can be wrong in a way nobody notices: the translation
 * from a word a person picked to a pair of instants. "This weekend" returning
 * next week's Saturday is a screen with the wrong events on it, not an error,
 * and on a Saturday night it is the single worst time to get it wrong.
 *
 * Dates are pinned rather than taken from the clock — a test that passes on a
 * Tuesday and fails on a Saturday is worse than no test.
 */

const at = (iso: string) => new Date(iso)

describe('whenToRange', () => {
  it('asks for nothing when nothing was asked', () => {
    expect(whenToRange('any', at('2026-08-19T14:00:00'))).toEqual({})
  })

  it('today runs from now to the end of the local day', () => {
    // Not from the start of the day: an event that finished this morning is not
    // something you can still go to.
    const now = at('2026-08-19T14:00:00')
    const r = whenToRange('today', now)
    expect(r.startDate).toBe(now.toISOString())
    expect(new Date(r.endDate!).getHours()).toBe(23)
    expect(new Date(r.endDate!).getDate()).toBe(19)
  })

  it('midweek, the weekend is the coming Saturday and Sunday', () => {
    // Wednesday 19 Aug 2026 -> Sat 22, Sun 23.
    const r = whenToRange('weekend', at('2026-08-19T14:00:00'))
    expect(new Date(r.startDate!).getDate()).toBe(22)
    expect(new Date(r.startDate!).getHours()).toBe(0)
    expect(new Date(r.endDate!).getDate()).toBe(23)
    expect(new Date(r.endDate!).getHours()).toBe(23)
  })

  it('on a Saturday, the weekend is today and tomorrow', () => {
    /*
     * The case that matters. Somebody opening this on Saturday evening wants
     * tonight, and a naive "next Saturday" implementation answers with an empty
     * screen and eight days' notice.
     */
    const now = at('2026-08-22T19:00:00')
    expect(now.getDay()).toBe(6)
    const r = whenToRange('weekend', now)
    expect(r.startDate).toBe(now.toISOString())
    expect(new Date(r.endDate!).getDate()).toBe(23)
  })

  it('on a Sunday, the weekend is the rest of today', () => {
    const now = at('2026-08-23T11:00:00')
    expect(now.getDay()).toBe(0)
    const r = whenToRange('weekend', now)
    expect(r.startDate).toBe(now.toISOString())
    expect(new Date(r.endDate!).getDate()).toBe(23)
  })

  it('this week is now through the end of the seventh day', () => {
    const r = whenToRange('week', at('2026-08-19T14:00:00'))
    expect(new Date(r.endDate!).getDate()).toBe(25)
  })

  it('uses local days, not UTC ones', () => {
    // 23:30 local is still today. Reading the boundary in UTC would roll it to
    // tomorrow and drop every late-night event out of "Today" — which is the
    // category where this is least forgivable.
    const now = at('2026-08-19T23:30:00')
    const r = whenToRange('today', now)
    expect(new Date(r.endDate!).getDate()).toBe(19)
  })
})

describe('activeFilterCount', () => {
  it('is zero for the default', () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0)
    expect(hasActiveFilters(NO_FILTERS)).toBe(false)
  })

  it('counts each choice once', () => {
    const f: EventFilters = { categorySlug: 'social', when: 'weekend', radiusKm: 5 }
    expect(activeFilterCount(f)).toBe(3)
    expect(hasActiveFilters(f)).toBe(true)
  })

  it('does not count a distance of zero as absent', () => {
    // `if (f.radiusKm)` would drop this. 0 is not a distance anybody picks, but
    // a truthiness check here is the same bug that would drop it at 0.5.
    expect(activeFilterCount({ when: 'any', radiusKm: 0 })).toBe(1)
  })
})

describe('filtersToQuery', () => {
  it('sends nothing at all when nothing is filtered', () => {
    expect(filtersToQuery(NO_FILTERS, at('2026-08-19T14:00:00'))).toEqual({})
  })

  it('omits radius rather than sending a large one', () => {
    /*
     * The server has **no default radius**, deliberately — a 10km box applied
     * to anyone who merely sent coordinates is what blanked this feed once.
     * "Any distance" must therefore remove the parameter, not widen it.
     */
    const q = filtersToQuery({ when: 'any', categorySlug: 'music' }, at('2026-08-19T14:00:00'))
    expect(q).not.toHaveProperty('radius')
    expect(q.categorySlug).toBe('music')
  })

  it('sends radius when it was chosen', () => {
    const q = filtersToQuery({ when: 'any', radiusKm: 5 }, at('2026-08-19T14:00:00'))
    expect(q.radius).toBe(5)
  })

  it('never sends an empty category', () => {
    // `categorySlug=` is a filter matching nothing, which is not the same as no
    // filter — and it would empty the screen with no way to tell why.
    const q = filtersToQuery({ when: 'any', categorySlug: '' }, at('2026-08-19T14:00:00'))
    expect(q).not.toHaveProperty('categorySlug')
  })

  it('carries the date range through', () => {
    const q = filtersToQuery({ when: 'today' }, at('2026-08-19T14:00:00'))
    expect(q.startDate).toBeDefined()
    expect(q.endDate).toBeDefined()
  })
})
