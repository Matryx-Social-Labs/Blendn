import {
  applyGridFilters,
  availableWorkFields,
  emptyReason,
  hasActiveFilters,
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
    const out = applyGridFilters(ROOM, { workFields: ['Design'] })
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
    const out = applyGridFilters(ROOM, { workFields: ['Design'] })
    expect(out.some((p) => p.workField === null)).toBe(false)
  })



})

describe('an empty screen says which kind of empty it is', () => {
  it('tells a filtered-out room from an empty one', () => {
    /*
     * Different situations, different fixes. Telling somebody the room is empty
     * when they filtered it themselves is the kind of small lie that makes
     * people stop trusting a screen.
     */
    expect(emptyReason(5, 0, { workFields: ['Finance'] })).toBe('filtered-out')
    expect(emptyReason(0, 0, NO_GRID_FILTERS)).toBe('room-empty')
    expect(emptyReason(5, 0, NO_GRID_FILTERS)).toBe('room-empty')
  })

  it('is null while anything is showing', () => {
    expect(emptyReason(5, 3, NO_GRID_FILTERS)).toBeNull()
  })

  it('knows when a clear affordance is needed', () => {
    expect(hasActiveFilters(NO_GRID_FILTERS)).toBe(false)
    expect(hasActiveFilters({ workFields: ['Design'] })).toBe(true)
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

const ROOM_SCREEN = () =>
  readFileSync(join(__dirname, '..', 'app', 'room.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('the room carries the shared header', () => {
  it('uses PulseTopBar rather than a screen-local bar', () => {
    /*
     * Frame `1141:5129` is that component: same `rgba(15,14,14,0.8)`, same 12pt
     * blur, same accent wordmark. The frame sets the wordmark at 24/32 and the
     * shared bar is 16/24 — the bar wins, because the point of a shared bar is
     * that it does not vary per screen. Raised with the designer instead.
     */
    expect(ROOM_SCREEN()).toContain('<PulseTopBar')
  })

  it('offsets the content below the overlay', () => {
    /*
     * `PulseTopBar` draws over the content at absolute position, so the heading
     * must clear it or it renders behind the blur — which is what the first
     * screenshot of this change showed.
     *
     * The offset is `TOP_BAR_HEIGHT` alone, not `insets.top + TOP_BAR_HEIGHT`:
     * this screen is a sheet, and the notch is accounted for once by the bar's
     * own `topInset`. See the sheet block below for why adding it here was the
     * bug rather than the fix.
     */
    const src = ROOM_SCREEN()
    expect(src).toContain('paddingTop: TOP_BAR_HEIGHT + 8')
    // And the safe area must not inset the screen a second time.
    expect(src).toContain("edges={['left', 'right']}")
  })
})

describe('Join Chat is a door, not a pane', () => {
  it('navigates to the event room', () => {
    /*
     * The screen used to mount the chat here and hide it. That meant the event
     * chat existed twice — once embedded, once at `app/chat/[id]` — with one
     * socket, one moderation path and one composer duplicated across both.
     */
    const src = ROOM_SCREEN()
    expect(src).toContain("pathname: '/chat/[id]'")
    expect(src).not.toContain('<GroupChat')
  })

  it('says so when the room has no chat yet', () => {
    // Otherwise the toggle is a control that sometimes does nothing, which
    // reads as the app being broken rather than the chat not existing yet.
    expect(ROOM_SCREEN()).toContain('The chat for this event is not open yet.')
  })

  it('takes the roster count from the screen that fetched it', () => {
    // Rather than a second request for a number already in memory one level
    // down.
    expect(ROOM_SCREEN()).toContain('<MatchScreen onRosterCount={setRosterCount} />')
  })

  it('draws no subtitle until both halves are real', () => {
    // "0 people at undefined" is worse than no subtitle.
    expect(ROOM_SCREEN()).toContain('eventTitle && rosterCount > 0')
  })
})

describe('the sheet does not pay for the notch twice', () => {
  it('passes topInset 0 to the shared bar', () => {
    /*
     * `/room` is `presentation: 'modal'`, and iOS already drops a sheet below
     * the notch. `useSafeAreaInsets()` reads the nearest provider and the app's
     * lives at the root, so inside the sheet it still reports the *device's*
     * inset -- the bar padded by a notch that was not there, and the heading
     * offset by `insets.top + TOP_BAR_HEIGHT` counted the same 62pt again.
     *
     * That is the black band above the header, and it was invisible in the code.
     */
    const src = ROOM_SCREEN()
    expect(src).toContain('topInset={0}')
    expect(src).toContain('paddingTop: TOP_BAR_HEIGHT + 8')
    expect(src).not.toContain('insets.top + TOP_BAR_HEIGHT')
  })

  it('keeps the override optional, so every other screen is unchanged', () => {
    // The Pulse, the Scene and the Banter are pushed, not presented, and their
    // inset is correct. Defaulting to `insets.top` leaves them alone.
    const bar = readFileSync(
      join(__dirname, '..', 'components', 'pulse', 'PulseTopBar.tsx'),
      'utf8'
    )
    expect(bar).toContain('topInset ?? insets.top')
  })
})

describe('the toggle is the frame’s pill', () => {
  it('is a track holding two buttons, not two stretched segments', () => {
    /*
     * Frame `1141:4959`: `#211F1F` at p6 around the pair, centred and
     * content-width. The unselected side is a hole in the track rather than a
     * second button -- stretching both to full width makes it read as a tab bar.
     */
    const src = ROOM_SCREEN()
    expect(src).toContain('styles.segmentTrack')
    const track = src.slice(src.indexOf('segmentTrack: {'))
    const body = track.slice(0, track.indexOf('},'))
    expect(body).toContain('padding: 6')
    expect(body).toContain('backgroundColor: EMBER.surfaceSunken')
  })

  it('raises only the selected side, and accents its label', () => {
    // Frame `1141:4961`: `#2D2C2C` with a drop shadow; `1141:4963`: the accent.
    const src = ROOM_SCREEN()
    expect(src.slice(src.indexOf('segmentOn: {'))).toContain("backgroundColor: '#2D2C2C'")
    expect(src).toContain('segmentTextOn: { color: EMBER.accent }')
  })

  it('does not stretch the buttons', () => {
    const src = ROOM_SCREEN()
    const seg = src.slice(src.indexOf('  segment: {'))
    expect(seg.slice(0, seg.indexOf('},'))).not.toContain('flex: 1')
  })
})
