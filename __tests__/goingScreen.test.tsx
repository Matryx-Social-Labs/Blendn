/**
 * The Going tab on the real screen, at scale: a person with hundreds of past nights, dozens of saves and a long run of RSVPs.
 * The server returns a page and the true total (`pagination`); the tab draws what it holds, says what is left as it is, and asks
 * for the next page when the reader does (or, for Past, reaches the end). Venue visits, a night that moved, and the row's ⋯.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { AppState } from 'react-native'

jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() } }))
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), navigate: jest.fn() },
  // Once, as a focus is: the real hook runs on the focus, not on every render.
  useFocusEffect: (cb: () => void) => require('react').useEffect(() => cb(), []),
  useScrollToTop: () => {},
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
  SafeAreaView: 'View',
}))
jest.mock('../app/(tabs)/_layout', () => ({ TAB_BAR_CLEARANCE: 80 }))
const mockUser = { id: 'me' }
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: mockUser }) }))
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getUserFavorites: jest.fn(),
    getMyRsvps: jest.fn(),
    getMyAttendance: jest.fn(),
    getMyEventRating: jest.fn(() => Promise.resolve({ success: true, data: {} })),
    removeFavorite: jest.fn(),
    addFavorite: jest.fn(),
  },
}))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
jest.mock('../lib/shareRow', () => ({ shareEvent: jest.fn() }))
jest.mock('../lib/blendnOverlay', () => ({ openBlendn: jest.fn() }))
jest.mock('../lib/paywall', () => ({ openTonight: jest.fn() }))

/* eslint-disable import/first */
import { router } from 'expo-router'
import Going from '../app/(tabs)/going'
import { apiClient } from '../lib/apiClient'
import { showSheet } from '../lib/sheet'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>
const day = (n: number, h = 20) => new Date(2026, 8, n, h).toISOString()
const night = (i: number, over: object = {}) => ({
  id: `p${i}`,
  title: `Night ${i}`,
  cover_image_url: null,
  start_time: day(1, 20),
  end_time: day(1, 23),
  venue_name: 'Toit',
  city: null,
  attendedAt: day(1, 20),
  ...over,
})
const nights = (from: number, n: number) => Array.from({ length: n }, (_, i) => night(from + i))
const upcoming = (id: string, over: object = {}) => ({
  id,
  title: `Event ${id}`,
  venueName: 'Toit',
  startTime: new Date(Date.now() + 86_400_000 * 3).toISOString(),
  endTime: new Date(Date.now() + 86_400_000 * 3 + 7_200_000).toISOString(),
  status: 'published',
  ...over,
})
const page = (page: number, totalCount: number, hasMore: boolean) => ({ page, limit: 30, totalCount, hasMore })

beforeEach(() => {
  jest.clearAllMocks()
  api.getUserFavorites.mockResolvedValue({ success: true, data: { events: [], pagination: page(1, 0, false) } } as never)
  api.getMyRsvps.mockResolvedValue({ success: true, data: { events: [], pagination: page(1, 0, false) } } as never)
  api.getMyAttendance.mockResolvedValue({ success: true, data: { events: [], pagination: page(1, 0, false), lockedCount: 0 } } as never)
})

const open = async () => {
  await render(<Going />)
  await act(async () => {})
}

describe('hundreds of past nights', () => {
  // Four rows to a page keeps the section's end inside the first window; the server's real page is 30.
  const pageOf = (n: number) => ({ success: true, data: { events: nights((n - 1) * 4, 4), pagination: page(n, 312, true), lockedCount: 0 } })
  beforeEach(() => {
    api.getMyAttendance.mockImplementation((_limit?: number, n = 1) => Promise.resolve(pageOf(n)) as never)
  })
  const more = () => screen.getByTestId('going-more-past')
  const left = () => Number(/\d+/.exec(more().props.accessibilityLabel)?.[0])

  it('draws a page, the true count in the header, and says what is left', async () => {
    await open()
    expect(await screen.findByText('Night 3')).toBeTruthy()
    expect(screen.getByLabelText('Past, 312')).toBeTruthy()
    // What is left is the server's total less what is held, whatever has been asked for since.
    expect(left()).toBe(308)
  })

  it('reading the first page asks for a page by size, not for everything', async () => {
    await open()
    expect(api.getMyAttendance).toHaveBeenCalledWith(30, 1, null)
    expect(api.getUserFavorites).toHaveBeenCalledWith('me', 1, 30, null)
  })

  it('the next page is asked for by number, and what comes is added after what is held', async () => {
    await open()
    await fireEvent.press(await screen.findByTestId('going-more-past'))
    await waitFor(() => expect(api.getMyAttendance).toHaveBeenCalledWith(30, 2, null))
    await waitFor(() => expect(screen.getByText('Night 7')).toBeTruthy())
    expect(left()).toBe(304)
    expect(screen.getByText('Night 0')).toBeTruthy()
    expect(screen.getByLabelText('Past, 312')).toBeTruthy()
  })

  it('a refused page says so on the row, keeps what is held, and asks again when the row is pressed', async () => {
    api.getMyAttendance.mockImplementation((_limit?: number, n = 1) => Promise.resolve(n === 1 ? pageOf(1) : { success: false, error: 'boom' }) as never)
    await open()
    await fireEvent.press(await screen.findByTestId('going-more-past'))
    await waitFor(() => expect(more().props.accessibilityLabel).toBe('Couldn’t load more. Try again'))
    expect(screen.getByText('Night 0')).toBeTruthy()
    // The scroll does not ask again by itself: a refusal is not a loop.
    const asked = api.getMyAttendance.mock.calls.length
    await act(async () => {})
    expect(api.getMyAttendance.mock.calls.length).toBe(asked)
    api.getMyAttendance.mockImplementation((_limit?: number, n = 1) => Promise.resolve(pageOf(n)) as never)
    await fireEvent.press(more())
    await waitFor(() => expect(screen.getByText('Night 7')).toBeTruthy())
  })

  it('the last page leaves no row and no claim: the header goes back to a bare word', async () => {
    api.getMyAttendance.mockResolvedValue({ success: true, data: { events: nights(0, 12), pagination: page(1, 12, false), lockedCount: 0 } } as never)
    await open()
    expect(await screen.findByText('Night 0')).toBeTruthy()
    expect(screen.queryByTestId('going-more-past')).toBeNull()
    expect(screen.getByLabelText('Past')).toBeTruthy()
  })
})

describe('RSVPs and saves are paged the same way', () => {
  it('a long run of RSVPs and of saves each end with their own count', async () => {
    api.getMyRsvps.mockResolvedValue({
      success: true,
      data: { events: Array.from({ length: 3 }, (_, i) => ({ ...upcoming(`g${i}`), rsvpStatus: 'going' })), pagination: page(1, 80, true) },
    } as never)
    api.getUserFavorites.mockResolvedValue({
      success: true,
      data: { events: Array.from({ length: 3 }, (_, i) => upcoming(`s${i}`)), pagination: page(1, 41, true) },
    } as never)
    await open()
    expect(await screen.findByTestId('going-more-going')).toBeTruthy()
    expect(screen.getByTestId('going-more-going').props.accessibilityLabel).toBe('Show 77 more')
    expect(screen.getByTestId('going-more-saved').props.accessibilityLabel).toBe('Show 38 more')
    expect(screen.getByLabelText('Saved, 41')).toBeTruthy()
  })
})

describe('Past: the places you went live at (Flow 4, frame 01)', () => {
  const visit = night(1, { id: 'v1', kind: 'venue_day', title: 'bookkeeping title', venue_name: 'Toit', stay_minutes: 100 })

  it('is the place\'s name, "Live here · date · how long", and a Venue tag, with no rating to ask for', async () => {
    api.getMyAttendance.mockResolvedValue({ success: true, data: { events: [visit], pagination: page(1, 1, false), lockedCount: 0 } } as never)
    await open()
    expect(await screen.findByText('Toit')).toBeTruthy()
    expect(screen.queryByText('bookkeeping title')).toBeNull()
    expect(screen.getByText('Venue')).toBeTruthy()
    expect(screen.getByLabelText(/^Toit, live here, .*1h 40m$/)).toBeTruthy()
    expect(screen.queryByText('Rate who you met')).toBeNull()
    expect(api.getMyEventRating).not.toHaveBeenCalled()
  })

  it('without a place id it is read and not offered', async () => {
    api.getMyAttendance.mockResolvedValue({ success: true, data: { events: [visit], pagination: page(1, 1, false), lockedCount: 0 } } as never)
    await open()
    expect((await screen.findByLabelText(/^Toit, live here/)).props.accessibilityRole).toBe('text')
  })

  it('with the place\'s id (when the server sends it) it opens the place', async () => {
    api.getMyAttendance.mockResolvedValue({ success: true, data: { events: [{ ...visit, venue_id: 'v-toit' }], pagination: page(1, 1, false), lockedCount: 0 } } as never)
    await open()
    await fireEvent.press(await screen.findByLabelText(/^Toit, live here/))
    expect(router.push).toHaveBeenCalledWith({ pathname: '/venue/[id]', params: { id: 'v-toit' } })
  })
})

describe('a night that moved, and the row\'s ⋯', () => {
  const rows = [
    { ...upcoming('a'), rsvpStatus: 'going' },
    { ...upcoming('b'), rsvpStatus: 'going', changedFields: ['time'] },
    { ...upcoming('c'), rsvpStatus: 'going', changedFields: ['venue'] },
  ]
  beforeEach(() => {
    api.getMyRsvps.mockResolvedValue({ success: true, data: { events: rows, pagination: page(1, 3, false) } } as never)
  })

  it('says "New time" or "New venue" on the row it moved, and nothing from a server that does not send it', async () => {
    await open()
    expect(await screen.findByText('New time')).toBeTruthy()
    expect(screen.getByText('New venue')).toBeTruthy()
    expect(screen.getAllByText(/^New /)).toHaveLength(2)
  })

  it('the ⋯ opens the row\'s actions in the app\'s Sheet: Share, Directions, Add to calendar, The Board, Cancel', async () => {
    await open()
    await fireEvent.press((await screen.findAllByLabelText(/^More about Event b/))[0])
    const sheet = (showSheet as jest.Mock).mock.calls[0][0]
    expect(sheet.title).toBe('Event b')
    expect(sheet.actions.map((a: { label: string }) => a.label)).toEqual(['Share', 'Directions', 'Add to calendar', 'The Board', 'Cancel'])
    expect(router.push).not.toHaveBeenCalled()
  })
})

describe('refreshing with more than one page held (Going, hundreds of nights)', () => {
  const pageOf = (n: number, all: string[]) => ({
    success: true,
    data: { events: all.slice((n - 1) * 4, n * 4).map((id) => night(Number(id.slice(1)))), pagination: page(n, all.length, n * 4 < all.length), lockedCount: 0 },
  })
  const ids = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `p${from + i}`)
  let foreground: (state: string) => void
  beforeEach(() => {
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (s: string) => void) => {
      foreground = fn
      return { remove: jest.fn() }
    }) as never)
  })
  afterEach(() => jest.restoreAllMocks())

  it('reads every held page again, so a row removed on page 2 is gone and a moved one is where it is now', async () => {
    let all = ids(10)
    api.getMyAttendance.mockImplementation((_l?: number, n = 1) => Promise.resolve(pageOf(n, all)) as never)
    await open()
    await fireEvent.press(await screen.findByTestId('going-more-past'))
    await waitFor(() => expect(screen.getByText('Night 7')).toBeTruthy())
    expect(screen.getByText('Night 5')).toBeTruthy()
    api.getMyAttendance.mockClear()
    // Night 5 (held on page 2) is removed elsewhere; night 8 moves up into page 2.
    all = ids(10).filter((id) => id !== 'p5')
    await act(async () => foreground('active'))
    await waitFor(() => expect(screen.queryByText('Night 5')).toBeNull())
    expect(api.getMyAttendance.mock.calls.map((c) => c[1]).sort()).toEqual([1, 2])
    expect(screen.getByText('Night 8')).toBeTruthy()
    expect(screen.getByText('Night 0')).toBeTruthy()
  })

  it('by cursor it follows the cursors from the head', async () => {
    const cursorPage = (c: string | null) => {
      const n = c ? Number(c.slice(1)) : 1
      const all = ids(10)
      const hasMore = n * 4 < all.length
      return { success: true, data: { events: all.slice((n - 1) * 4, n * 4).map((id) => night(Number(id.slice(1)))), pagination: { ...page(n, all.length, hasMore), nextCursor: hasMore ? `c${n + 1}` : null }, lockedCount: 0 } }
    }
    api.getMyAttendance.mockImplementation((_l?: number, _n?: number, cursor?: string | null) => Promise.resolve(cursorPage(cursor ?? null)) as never)
    await open()
    await fireEvent.press(await screen.findByTestId('going-more-past'))
    expect(api.getMyAttendance).toHaveBeenLastCalledWith(30, 2, 'c2')
    await waitFor(() => expect(screen.getByText('Night 7')).toBeTruthy())
    api.getMyAttendance.mockClear()
    await act(async () => foreground('active'))
    await waitFor(() => expect(api.getMyAttendance).toHaveBeenCalledTimes(2))
    expect(api.getMyAttendance.mock.calls.map((c) => c[2])).toEqual([null, 'c2'])
  })

  it('a refused page of the refresh keeps what is on screen', async () => {
    const all = ids(10)
    api.getMyAttendance.mockImplementation((_l?: number, n = 1) => Promise.resolve(pageOf(n, all)) as never)
    await open()
    await fireEvent.press(await screen.findByTestId('going-more-past'))
    await waitFor(() => expect(screen.getByText('Night 7')).toBeTruthy())
    api.getMyAttendance.mockImplementation((_l?: number, n = 1) => Promise.resolve(n === 2 ? { success: false, error: 'x' } : pageOf(n, all)) as never)
    await act(async () => foreground('active'))
    await act(async () => {})
    expect(screen.getByText('Night 7')).toBeTruthy()
  })
})

describe('two triggers in one frame (the row pressed as the list ends)', () => {
  it('ask for the next page once, and count it once', async () => {
    const all = Array.from({ length: 10 }, (_, i) => i)
    const pageOf = (n: number) => ({ success: true, data: { events: all.slice((n - 1) * 4, n * 4).map((i) => night(i)), pagination: page(n, 312, true), lockedCount: 0 } })
    api.getMyAttendance.mockImplementation((_l?: number, n = 1) => Promise.resolve(pageOf(n)) as never)
    await open()
    const row = await screen.findByTestId('going-more-past')
    await act(async () => {
      fireEvent.press(row)
      fireEvent.press(row)
      fireEvent(screen.getByTestId('going-list'), 'endReached')
    })
    await act(async () => {})
    expect(api.getMyAttendance.mock.calls.filter((c) => c[1] === 2)).toHaveLength(1)
    // The next page after that is the third, not the fourth.
    await fireEvent.press(screen.getByTestId('going-more-past'))
    expect(api.getMyAttendance).toHaveBeenLastCalledWith(30, 3, null)
  })
})

describe('the row\'s ⋯ and the visit\'s art', () => {
  it('a cancelled night\'s sheet offers Share only: no directions to nowhere, no calendar entry', async () => {
    api.getMyRsvps.mockResolvedValue({
      success: true,
      data: { events: [{ ...upcoming('a'), rsvpStatus: 'going' }, { ...upcoming('c', { status: 'cancelled' }), rsvpStatus: 'going' }], pagination: page(1, 2, false) },
    } as never)
    await open()
    await fireEvent.press((await screen.findAllByLabelText(/^More about Event c/))[0])
    expect((showSheet as jest.Mock).mock.calls[0][0].actions.map((a: { label: string }) => a.label)).toEqual(['Share', 'Cancel'])
  })

  it('the controls beside each other keep their reaches apart', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'app', '(tabs)', 'going.tsx'), 'utf8') as string
    expect(src).toContain("trailing: { flexDirection: 'row', alignItems: 'center', gap: minTarget() - HEART }")
  })

  it('a visit\'s thumb is its place\'s type when the server says it', async () => {
    api.getMyAttendance.mockResolvedValue({ success: true, data: { events: [night(1, { id: 'v1', kind: 'venue_day', venue_type: 'cafe' })], pagination: page(1, 1, false), lockedCount: 0 } } as never)
    await open()
    expect(await screen.findByText('Toit')).toBeTruthy()
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'app', '(tabs)', 'going.tsx'), 'utf8') as string
    expect(src).toContain("plate={visit.venueType ?? 'bar'}")
  })
})

describe('Next up, the rows and the lock (GO-14, audit C11/C13/C14)', () => {
  const rows = [
    { ...upcoming('a', { title: 'QA Scale coming up on a long night out' }), rsvpStatus: 'going' },
    { ...upcoming('b', { startTime: new Date(Date.now() + 86_400_000 * 9).toISOString(), endTime: new Date(Date.now() + 86_400_000 * 9 + 7_200_000).toISOString() }), rsvpStatus: 'going' },
  ]
  type Node = { type: string; props: Record<string, unknown>; children: (Node | string)[] | null }
  const uncapped = (n: Node, found: string[] = []): string[] => {
    // An icon font's glyph is a private-use character in a Text; it does not scale with the type size, so it needs no cap.
    const glyph = n.children?.length === 1 && typeof n.children[0] === 'string' && /^[\uE000-\uF8FF]$/u.test(n.children[0])
    if (n.type === 'Text') return n.props.maxFontSizeMultiplier || glyph ? found : [...found, JSON.stringify(n.children)]
    return (n.children ?? []).reduce<string[]>((acc, c) => (typeof c === 'object' ? uncapped(c, acc) : acc), found)
  }

  it('Next up stops every line at its role (jest’s window is at 2, an accessibility size), and its title takes two lines', async () => {
    api.getMyRsvps.mockResolvedValue({ success: true, data: { events: rows, pagination: page(1, 2, false) } } as never)
    await open()
    await screen.findByText('QA Scale coming up on a long night out')
    const find = (n: Node | Node[] | null, id: string): Node | null => {
      if (!n) return null
      if (Array.isArray(n)) return n.map((c) => find(c, id)).find(Boolean) ?? null
      if (n.props?.testID === id) return n
      return find((n.children ?? []).filter((c): c is Node => typeof c === 'object'), id)
    }
    const hero = find(screen.toJSON() as never, 'going-next')
    expect(hero).not.toBeNull()
    expect(uncapped(hero as Node)).toEqual([])
    expect(screen.getByText('QA Scale coming up on a long night out').props.numberOfLines).toBe(2)
  })

  it('Directions is the world’s lit action: the one positive action on the card (Direction C)', async () => {
    api.getMyRsvps.mockResolvedValue({ success: true, data: { events: rows, pagination: page(1, 2, false) } } as never)
    await open()
    expect(await screen.findByTestId('going-directions')).toBeTruthy()
  })

  it('a row past today carries its own day, since headings are by week now', async () => {
    api.getMyRsvps.mockResolvedValue({ success: true, data: { events: rows, pagination: page(1, 2, false) } } as never)
    await open()
    const row = await screen.findByLabelText(/^Event b/)
    expect(row.props.accessibilityLabel).toMatch(/, \d+ [A-Z][a-z]{2} · /)
  })

  it('the lock is Plus’s: violet, and spelt Blend’n+', async () => {
    api.getMyAttendance.mockResolvedValue({ success: true, data: { events: [], pagination: page(1, 0, false), lockedCount: 45 } } as never)
    await open()
    const lock = await screen.findByLabelText('45 more nights with Blend’n+')
    expect(lock.props.accessibilityHint).toBe('Opens Blend’n+')
    const { COLOR } = require('../lib/design/tokens')
    const { StyleSheet } = require('react-native')
    expect(StyleSheet.flatten(lock.props.style).backgroundColor).toBe(COLOR.selectionVioletFill)
  })
})

describe('the category plate (GO-14, DS-12 wiring, audit C10)', () => {
  it('a row and the Next up hero with no cover draw their category plate, not an empty box', async () => {
    const rows = [
      { ...upcoming('a', { categories: [{ slug: 'music' }] }), rsvpStatus: 'going' },
      { ...upcoming('b', { categories: [{ slug: 'music' }] }), rsvpStatus: 'going' },
    ]
    api.getMyRsvps.mockResolvedValue({ success: true, data: { events: rows, pagination: page(1, 2, false) } } as never)
    await open()
    expect(await screen.findByTestId('event-cover-plate', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getAllByTestId('going-row-b-plate', { includeHiddenElements: true })).toHaveLength(1)
  })
})

describe('the Board from Going (OUT-02, decision E2)', () => {
  const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()
  const labels = (sheet: { actions: { label: string }[] }) => sheet.actions.map((a) => a.label)
  // The first RSVP is Next up (it has no ⋯); the second is a list row.
  const two = (over: object) => [{ ...upcoming('a', over), rsvpStatus: 'going' }, { ...upcoming('b', over), rsvpStatus: 'going' }]
  const rsvps = (events: object[]) =>
    api.getMyRsvps.mockResolvedValue({ success: true, data: { events, pagination: page(1, events.length, false) } } as never)
  const trayOf = async (title: RegExp) => {
    await fireEvent.press((await screen.findAllByLabelText(title))[0])
    return (showSheet as jest.Mock).mock.calls[0][0]
  }

  it('before doors: the Next-up card carries the Scene\'s Board row, and a row\'s tray the action; both open the Board', async () => {
    rsvps(two({}))
    await open()
    await fireEvent.press(await screen.findByLabelText(/^The Board\./))
    expect(router.push).toHaveBeenCalledWith({ pathname: '/board/[eventId]', params: { eventId: 'a' } })

    const sheet = await trayOf(/^More about Event b/)
    expect(labels(sheet)).toContain('The Board')
    sheet.actions.find((a: { label: string }) => a.label === 'The Board').then()
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/board/[eventId]', params: { eventId: 'b' } })
  })

  it('a saved night offers it in the tray too', async () => {
    api.getUserFavorites.mockResolvedValue({ success: true, data: { events: [upcoming('s')], pagination: page(1, 1, false) } } as never)
    await open()
    expect(labels(await trayOf(/^More about Event s/))).toContain('The Board')
  })

  it('after doors: neither the card row nor the tray action', async () => {
    rsvps(two({ startTime: hours(-1), endTime: hours(2) }))
    await open()
    await screen.findByTestId('going-next')
    expect(screen.queryByLabelText(/^The Board\./)).toBeNull()
    expect(labels(await trayOf(/^More about Event b/))).not.toContain('The Board')
  })

  it('a cancelled night: neither', async () => {
    rsvps(two({ status: 'cancelled' }))
    await open()
    await screen.findByTestId('going-next')
    expect(screen.queryByLabelText(/^The Board\./)).toBeNull()
    expect(labels(await trayOf(/^More about Event b/))).not.toContain('The Board')
  })
})
