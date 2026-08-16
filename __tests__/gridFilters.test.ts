import {
  applyGridFilters,
  availableWorkFields,
  emptyReason,
  hasActiveFilters,
  maxSharedInterests,
  NO_GRID_FILTERS,
} from '../lib/gridFilters'

/**
 * Narrowing the Grid. Pure, because the security property lives here: the
 * filter must never become a server parameter.
 */
const P = (workField: string | null, shared: string[] = []) => ({
  workField,
  sharedInterests: shared,
})

const ROOM = [
  P('Design', ['Techno', 'Board games']),
  P('Design', ['Techno']),
  P('Engineering', ['Board games', 'Techno', 'Film']),
  P('Finance', []),
  P(null, ['Film']),
]

describe('the chips offer only what is in the room', () => {
  it('lists professions present, commonest first', () => {
    // A filter listing twenty professions when eleven are present is a menu of
    // dead ends, and one empty result teaches people to stop using it.
    expect(availableWorkFields(ROOM)).toEqual(['Design', 'Engineering', 'Finance'])
  })

  it('offers nothing when every profession is suppressed', () => {
    /*
     * Which is every room below 8 people: the server nulls `workField` there,
     * because "29, Bengaluru, works in fintech, into techno and board games" is
     * one specific person in a room of eight.
     *
     * So the control is safe by construction rather than by a check — there is
     * simply nothing to offer.
     */
    expect(availableWorkFields([P(null), P(null), P(null)])).toEqual([])
  })

  it('ignores blank and whitespace fields', () => {
    expect(availableWorkFields([P('  '), P('Design')])).toEqual(['Design'])
  })
})

describe('filtering shows fewer, never different', () => {
  it('preserves the server ranking', () => {
    /*
     * `rankMatches` ordered this list. Narrowing must not re-order it -- that is
     * why these are filters and not sorts, and why a shared-interest sort was
     * rejected: the ranking already accounts for shared interests, so a second
     * ordering would disagree with the first about the same list.
     */
    const out = applyGridFilters(ROOM, { workFields: ['Design'], minShared: 0 })
    expect(out).toEqual([ROOM[0], ROOM[1]])
  })

  it('treats an empty selection as everyone', () => {
    // Not as nobody. Unticking your last chip should clear the filter, not empty
    // the room -- which reads as everyone leaving.
    expect(applyGridFilters(ROOM, NO_GRID_FILTERS)).toHaveLength(ROOM.length)
  })

  it('excludes people whose profession is unknown from a profession filter', () => {
    /*
     * Keeping unknowns in every result would let you infer suppressed values by
     * watching who never disappears, whatever you tick.
     */
    const out = applyGridFilters(ROOM, { workFields: ['Design'], minShared: 0 })
    expect(out.some((p) => p.workField === null)).toBe(false)
  })

  it('filters on overlap size', () => {
    const out = applyGridFilters(ROOM, { workFields: [], minShared: 2 })
    expect(out).toEqual([ROOM[0], ROOM[2]])
  })

  it('combines both as AND', () => {
    const out = applyGridFilters(ROOM, { workFields: ['Design'], minShared: 2 })
    expect(out).toEqual([ROOM[0]])
  })

  it('reports the best overlap in the room', () => {
    expect(maxSharedInterests(ROOM)).toBe(3)
    expect(maxSharedInterests([])).toBe(0)
  })
})

describe('an empty screen says which kind of empty it is', () => {
  it('tells a filtered-out room from an empty one', () => {
    /*
     * Different situations, different fixes. Telling somebody the room is empty
     * when they filtered it themselves is the kind of small lie that makes
     * people stop trusting a screen.
     */
    expect(emptyReason(5, 0, { workFields: ['Finance'], minShared: 2 })).toBe('filtered-out')
    expect(emptyReason(0, 0, NO_GRID_FILTERS)).toBe('room-empty')
    expect(emptyReason(5, 0, NO_GRID_FILTERS)).toBe('room-empty')
  })

  it('is null while anything is showing', () => {
    expect(emptyReason(5, 3, NO_GRID_FILTERS)).toBeNull()
  })

  it('knows when a clear affordance is needed', () => {
    expect(hasActiveFilters(NO_GRID_FILTERS)).toBe(false)
    expect(hasActiveFilters({ workFields: [], minShared: 1 })).toBe(true)
    expect(hasActiveFilters({ workFields: ['Design'], minShared: 0 })).toBe(true)
  })
})
