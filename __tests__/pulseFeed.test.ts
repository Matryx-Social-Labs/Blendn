import { readFileSync } from 'fs'
import { join } from 'path'

import { mergeEventPage, pageHasMore, pulseEmptyCopy, pulseEmptyKind } from '../lib/pulseFeed'

const pulse = readFileSync(join(__dirname, '..', 'app/(tabs)/events.tsx'), 'utf8')

describe('the Pulse feed pages', () => {
  it('appends a page without repeating a row already on screen', () => {
    const merged = mergeEventPage(
      [{ id: 'a', v: 1 }, { id: 'b', v: 1 }],
      [{ id: 'b', v: 2 }, { id: 'c', v: 2 }, { id: 'c', v: 3 }]
    )
    expect(merged.map((e) => e.id)).toEqual(['a', 'b', 'c'])
    // The copy already drawn wins.
    expect(merged[1].v).toBe(1)
    expect(merged[2].v).toBe(2)
  })

  it('keeps the same array when a page adds nothing new', () => {
    const current = [{ id: 'a' }]
    expect(mergeEventPage(current, [{ id: 'a' }])).toBe(current)
    expect(mergeEventPage(current, [])).toBe(current)
  })

  it('treats a short page as the last one', () => {
    expect(pageHasMore(20, 20)).toBe(true)
    expect(pageHasMore(12, 20)).toBe(false)
    expect(pageHasMore(0, 20)).toBe(false)
  })

  it('asks for page two with the same filters as page one', () => {
    const fetchMore = pulse.slice(pulse.indexOf('const fetchMore = useCallback'))
    const body = fetchMore.slice(0, fetchMore.indexOf('\n  }, ['))
    expect(body).toContain('...filtersToQuery(filters)')
    expect(body).toContain('mergeEventPage(')
    expect(body).toContain('fetchMoreInFlightRef.current')
    expect(body).toContain('!hasMore')
    // A page for a list that has since been replaced is dropped.
    expect(body).toContain('generation !== feedGenerationRef.current')
    const deps = fetchMore.slice(fetchMore.indexOf('\n  }, ['), fetchMore.indexOf('])'))
    expect(deps).toContain('filters')
  })
})

describe('the Pulse empty states', () => {
  const base = { searching: false, filtered: false, city: 'Bengaluru', notLiveHere: false }

  it('says a filtered miss is about the filters, not the city', () => {
    const kind = pulseEmptyKind({ ...base, filtered: true })
    expect(kind).toBe('filters')
    expect(pulseEmptyCopy(kind, { city: 'Bengaluru', term: '' }).message).toBe(
      'Nothing matches these filters in Bengaluru.'
    )
    // Not the city's own empty.
    expect(pulseEmptyCopy(kind, { city: 'Bengaluru', term: '' }).title).not.toContain('Nothing on in')
  })

  it('puts a search ahead of filters', () => {
    expect(pulseEmptyKind({ ...base, searching: true, filtered: true })).toBe('search')
  })

  it('keeps the city empties for an unfiltered feed', () => {
    expect(pulseEmptyKind(base)).toBe('quiet')
    expect(pulseEmptyKind({ ...base, notLiveHere: true })).toBe('notLive')
    expect(pulseEmptyKind({ ...base, city: null })).toBe('noCity')
    expect(pulseEmptyCopy('quiet', { city: 'Bengaluru', term: '' }).title).toBe('Nothing on in Bengaluru')
  })

  it('offers exactly one way out of a filtered miss: Clear filters', () => {
    const branch = pulse.slice(pulse.indexOf("emptyKind === 'filters' ? ("))
    const clearFilters = branch.slice(0, branch.indexOf(') : ('))
    expect(clearFilters).toContain('Clear filters')
    expect(clearFilters).toContain('setFilters(NO_FILTERS)')
    expect(clearFilters).not.toContain('Change city')
  })

  it('shows a failed first load as an error, not as an empty city', () => {
    expect(pulse).toContain("events.length === 0 && !!netError")
    expect(pulse).toContain("Couldn&apos;t load events")
  })
})
