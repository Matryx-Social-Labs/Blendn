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

/**
 * The screen, after the rebuild. Source assertions: the roster needs a check-in,
 * a live socket and people in a room, none of which decides whether a network
 * failure is drawn as an empty room.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const SCREEN = () =>
  readFileSync(join(__dirname, '..', 'components', 'screens', 'MatchScreen.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('the rebuilt Grid kept what the frame has no slot for', () => {
  it('still offers report and block from the card', () => {
    /*
     * The rebuild dropped this and the lint caught it. Safety cannot get
     * quietly further away: without it the fastest route to "this person is
     * making me uncomfortable" goes from one tap to opening a profile and
     * finding a menu.
     */
    expect(SCREEN()).toContain('onSafety={() => onSafetyPress(')
  })

  it('tells a failed load from an empty room', () => {
    /*
     * Identical once the list is empty, and not the same thing: one is "nobody
     * is here", the other is "we could not find out". Telling somebody the room
     * is empty when the network dropped is a lie they will act on.
     */
    const src = SCREEN()
    expect(src).toContain('{loadError ? (')
    expect(src).toContain('Could not load the room')
  })

  it('still announces people arriving', () => {
    // The roster updates over the socket, so without this the list grows under
    // your thumb and a new card is indistinguishable from one you scrolled past.
    expect(SCREEN()).toContain('{newJoinsCount} just arrived')
  })

  it('filters without re-ranking', () => {
    expect(SCREEN()).toContain('applyGridFilters(attendees, filters)')
  })

  it('does not re-probe the event room', () => {
    /*
     * `room.tsx` owns the chat segment and resolves the group when you switch to
     * it. The effect here called `getEventChat` on every mount for a button this
     * screen no longer has.
     */
    expect(SCREEN()).not.toContain('getEventChat')
  })

  it('never sends a filter to the server', () => {
    /*
     * The whole reason `lib/gridFilters.ts` exists: a `?workField=` param would
     * narrow on the real column while the response still suppressed it, so one
     * result would name a suppressed attribute by elimination.
     *
     * Asserted as "no query parameter", not "the word never appears" — the
     * screen holds `workFields` in local state, which is exactly the safe thing.
     */
    const src = SCREEN()
    expect(src).not.toMatch(/workField[s]?\s*[=:]\s*[`'"]/)
    const fetches = src.match(/apiClient\.\w+\([^)]*\)/g) ?? []
    expect(fetches.filter((f) => /workField|minShared/.test(f))).toEqual([])
  })
})
