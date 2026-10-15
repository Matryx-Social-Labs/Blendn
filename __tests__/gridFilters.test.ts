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
 * The room, after the Blend'n rebuild. Source assertions: the roster needs a
 * check-in, a live socket and people in a room, none of which decides whether
 * a network failure is drawn as an empty room.
 *
 * The Grid (`MatchScreen` inside the `app/room.tsx` modal) is gone. The room is
 * a face grid in `components/blendn/BlendnScreen.tsx`, fed by `lib/useRoom.ts`.
 * The work-field filter chips went with it on purpose — a face grid has no
 * slot for them — so only the pure `lib/gridFilters.ts` tests above remain.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const code = (...p: string[]) =>
  readFileSync(join(__dirname, '..', ...p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
const SCREEN = () => code('components', 'blendn', 'BlendnScreen.tsx')
const USE_ROOM = () => code('lib', 'useRoom.ts')
const SECTIONS = () => code('components', 'blendn', 'RoomSections.tsx')

describe('the rebuilt room kept what the old Grid had', () => {
  it('still offers report and block from the card', () => {
    /*
     * The first rebuild dropped this and the lint caught it. Safety cannot get
     * quietly further away: without it the fastest route to "this person is
     * making me uncomfortable" goes from one tap to opening a profile and
     * finding a menu. The card is `PersonCard` now; its "more" button is it.
     */
    expect(code('components', 'blendn', 'PersonCard.tsx')).toContain('onPress={() => onSafety(p)}')
    const src = SCREEN()
    expect(src).toContain('onSafety={safety}')
    expect(src).toContain('showUserSafetyActions(p.name, p.id')
  })

  it('tells a failed load from an empty room', () => {
    /*
     * Identical once the list is empty, and not the same thing: one is "nobody
     * is here", the other is "we could not find out". Telling somebody the room
     * is empty when the network dropped is a lie they will act on.
     */
    const src = SCREEN()
    expect(src).toContain("mode === 'error' ? (")
    expect(src).toContain('Couldn&apos;t load the room')
    expect(src).toContain('onPress={room.retry}')
    // Both branches, because the whole point is that they say different things.
    expect(SECTIONS()).toContain('Nobody else is here yet')
  })

  it('still announces people arriving', () => {
    // The roster updates over the socket, so without this the grid grows under
    // your thumb and a new face is indistinguishable from one you scrolled past.
    expect(USE_ROOM()).toContain('subscribeToEventRoomCheckIn(eventId')
    expect(SCREEN()).toContain('walked in`')
    expect(SECTIONS()).toContain('walked in`')
  })

  it('virtualises the roster instead of rendering all of it', () => {
    /*
     * The Grid's roster was once a `shown.map()` inside a `ScrollView`: twenty
     * cards in one 98ms commit, six frames dropped, and the cost linear in how
     * busy the night was.
     *
     * The regression this guards is the easy one to make: a `.map()` reads as
     * simpler than a list and looks identical in a screenshot, because on a
     * seed room of twenty it *is* identical -- just slower, and worse the
     * fuller the room gets.
     *
     * `numColumns={3}` is right now (it was pinned *off* for the old
     * single-column cards): the room is a grid of faces.
     */
    const src = SCREEN()
    expect(src).toContain('<Animated.FlatList')
    // Three to a row for faces; the Crews view (step 9) is one card to a row in the same list.
    expect(src).toContain("numColumns={gridView === 'people' ? 3 : 1}")
    expect(src).toContain('renderItem=')
    expect(src).not.toMatch(/everyone\.map\(|people\.map\(/)
  })

  it('does not offer "Show more" over an empty room', () => {
    /*
     * A `ListFooterComponent` renders even when the list is empty. Ungarded,
     * "Show more" sits under "Nobody else is here yet" and offers to fetch a
     * second page of nobody.
     */
    expect(SCREEN()).toContain('room.hasMore && everyone.length > 0')
  })

  it('resolves the room chat once per room, not on every open', () => {
    /*
     * The Grid once called `getEventChat` on every mount for a button it no
     * longer had. `useRoom` resolves it once per room; the screen only asks
     * again when that answer was "not open", as you tap into the chat.
     */
    expect(USE_ROOM()).toContain('chatResolvedForRef.current === eventId')
    expect(SCREEN()).toMatch(/if \(!id && eventId\) \{[\s\S]{0,80}apiClient\.getEventChat\(eventId\)/)
  })

  it('never sends a filter to the server', () => {
    /*
     * The whole reason `lib/gridFilters.ts` exists: a `?workField=` param would
     * narrow on the real column while the response still suppressed it, so one
     * result would name a suppressed attribute by elimination.
     */
    for (const src of [SCREEN(), USE_ROOM()]) {
      expect(src).not.toMatch(/workField[s]?\s*[=:]\s*[`'"]/)
      const fetches = src.match(/apiClient\.\w+\([^)]*\)/g) ?? []
      expect(fetches.filter((f) => /workField|minShared/.test(f))).toEqual([])
    }
  })
})

describe('Join Chat is a door, not a pane', () => {
  it('navigates to the event room', () => {
    /*
     * The room once mounted the chat and hid it. That meant the event chat
     * existed twice — once embedded, once at `app/chat/[id]` — with one socket,
     * one moderation path and one composer duplicated across both. `ChatDock`
     * shows the last few lines; tapping it opens the real room.
     */
    const src = SCREEN()
    expect(src).toContain("pathname: '/chat/[id]'")
    expect(src).toContain('onOpen={() => void openChat()}')
    expect(src).not.toContain('<GroupChat')
    expect(code('components', 'blendn', 'ChatDock.tsx')).not.toContain('<GroupChat')
  })

  it('says so when the room has no chat yet', () => {
    // Otherwise the dock is a control that sometimes does nothing, which reads
    // as the app being broken rather than the chat not existing yet.
    expect(SCREEN()).toContain('The chat for this event is not open yet.')
  })
})

describe('the room says who is here now (SCRUM-495)', () => {
  it('builds the face stack under "here now" from people inside only', () => {
    expect(SECTIONS()).toContain('hereNowStack(arrivals, people, STACK)')
  })

  it('heads the face grid with what is true of everyone in it', () => {
    expect(SCREEN()).toMatch(/const head = everyoneHead\(everyone, \{ hasMore: room\.hasMore, hereCount: room\.hereCount \}\)/)
    expect(SCREEN()).toContain('<FaceGridHead title={head.title} count={head.count}')
    expect(SECTIONS()).toContain('<Text variant="heading">{title}</Text>')
  })

  it('names as just walked in only somebody who is still here', () => {
    expect(SECTIONS()).toContain('const latest = arrivals.find((a) => a.insideNow !== false)')
  })
})

describe('the face grid names people at a readable size (SCRUM-503)', () => {
  it('does not shrink the name to fit', () => {
    /*
     * On iOS the grid name's first render sometimes came out at a fraction of
     * its size — far below minimumFontScale — and stayed that way until
     * something else re-rendered the room. Seen on fresh launches with the
     * grid under no Meet next. One line, ellipsised, is always legible.
     * Meet next's card keeps shrink-to-fit: full size in every drive so far.
     */
    const src = SECTIONS()
    const grid = src.slice(src.indexOf('export const GridFace'), src.indexOf('export function FaceGridHead'))
    expect(grid).toMatch(/<Text variant="bodyStrong" numberOfLines=\{1\} style=\{styles\.centre\}>\s*\{person\.name\}/)
    expect(grid).not.toContain('adjustsFontSizeToFit')
  })
})
