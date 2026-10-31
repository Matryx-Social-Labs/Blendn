/**
 * The Scene screen (Flow 3 `scene`), state by state: the failed and not-found pages, the ⋯ menu (Report for anyone;
 * and nothing else: an organiser's tools are the dashboard's), the facts as tiles, the banners and the one dock button.
 * What it does with an RSVP, a save or a check-in is unchanged and pinned by the source tests beside this one.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() } }))
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: () => ({ id: 'e1' }),
  useFocusEffect: () => {},
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }))
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getEvent: jest.fn(),
    getRoomPreview: jest.fn(() => Promise.resolve({ success: false })),
    toggleInterest: jest.fn(),
    rsvpToEvent: jest.fn(),
    cancelRsvp: jest.fn(),
    getEventChat: jest.fn(),
  },
}))
jest.mock('../lib/socketClient', () => ({
  subscribeToEventCheckIn: () => () => {},
  subscribeToEventInterest: () => () => {},
}))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
jest.mock('../components/scene/SceneHeroMedia', () => ({ SceneHeroMedia: () => null, HERO_CAPTION_FOOT: 40 }))
jest.mock('../components/scene/SceneLightbox', () => ({ SceneLightbox: () => null }))
jest.mock('../components/board/BoardSections', () => {
  const { View } = jest.requireActual('react-native')
  return { BoardEntry: () => <View testID="board-entry" /> }
})
jest.mock('../lib/blendnOverlay', () => ({ openBlendn: jest.fn(), openPass: jest.fn(), openRoomOf: jest.fn(), useRoomUp: () => false }))
jest.mock('../lib/calendar', () => ({ addToCalendar: jest.fn() }))
jest.mock('../lib/openInMaps', () => ({ openInMaps: jest.fn() }))
jest.mock('../lib/safetyUtils', () => ({ showEventReportOptions: jest.fn() }))
const mockCached = jest.fn((): unknown => null)
jest.mock('../lib/eventDetailCache', () => ({ getEventDetailCache: () => mockCached(), setEventDetailCache: jest.fn(), forgetEventDetailCache: jest.fn() }))
jest.mock('react-native-maps', () => {
  const { View } = jest.requireActual('react-native')
  return { __esModule: true, default: (p: object) => <View {...p} testID="map" />, Marker: () => null }
})
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
jest.mock('../lib/checkIn', () => ({ subscribeCheckInChanged: () => () => {} }))
// Each glyph names itself, so a test can say which one a control draws.
jest.mock('../components/ui/Icon', () => {
  const { View } = jest.requireActual('react-native')
  return { ...jest.requireActual('../components/ui/Icon'), Icon: ({ name }: { name: string }) => <View testID={`icon-${name}`} /> }
})
// The phone's last fix, for WHERE's distance; null is no fix (never an ask).
const mockLastFix = jest.fn()
jest.mock('expo-location', () => ({ ...jest.requireActual('expo-location'), getLastKnownPositionAsync: (...a: unknown[]) => mockLastFix(...a) }))

/* eslint-disable import/first */
import { router as mockRouter } from 'expo-router'
import EventDetail from '../components/screens/EventDetailScreen'
import { apiClient } from '../lib/apiClient'
import { openInMaps } from '../lib/openInMaps'
import { showEventReportOptions } from '../lib/safetyUtils'
import { showSheet } from '../lib/sheet'
import { markOffline, markOnline } from '../lib/networkStatus'
import { clockTime, refreshPhoneZone } from '../lib/time'
import { MAX_FONT_SCALE } from '../lib/design/tokens'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>
const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()

const detail = (over: Record<string, unknown> = {}, status: Record<string, unknown> = {}) => ({
  success: true,
  data: {
    id: 'e1',
    title: 'Vinyl Night',
    description: 'A night of records.',
    venueName: 'Toit',
    city: 'Bengaluru',
    address: 'Indiranagar',
    startTime: hours(3),
    endTime: hours(6),
    status: 'published',
    minAge: 18,
    doorPolicy: 'open',
    maxCapacity: 0,
    latitude: 12.9,
    longitude: 77.6,
    organizer: { id: 'org', name: 'Toit' },
    stats: { rsvpCount: 42, favoriteCount: 0, checkInCount: 0 },
    userStatus: { isFavorited: false, isCheckedIn: false, rsvpStatus: null, ...status },
    media: [],
    amenities: [],
    ...over,
  },
})

beforeEach(() => {
  jest.clearAllMocks()
  mockLastFix.mockResolvedValue({ coords: { latitude: 12.92, longitude: 77.6 } })
  mockCached.mockReturnValue(null)
  markOnline()
})
const open = async () => {
  await render(<EventDetail />)
  await act(async () => {})
}

it('a missing event is the calm "No longer available" landing (Flow 15 #10), with no retry and nothing about the connection', async () => {
  api.getEvent.mockResolvedValue({ success: false, error: 'Event not found', errorCode: 'NOT_FOUND' } as never)
  await open()
  expect(await screen.findByText('No longer available')).toBeTruthy()
  expect(screen.getByText('This event was taken down. Anything you saved or said has gone with it, and nothing was shared.')).toBeTruthy()
  expect(screen.queryByText('Couldn’t load this event')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  await fireEvent.press(screen.getByRole('button', { name: 'See what’s on tonight' }))
  expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/events')
  // The back circle is still the way out.
  await fireEvent.press(screen.getByTestId('scene-back'))
  expect(mockRouter.back).toHaveBeenCalled()
})

describe('the organizer was suspended (Flow 15 #10, SCRUM-749)', () => {
  // blendn-admin #716, event-changed-scene.itest.ts: the 404 keeps `errorCode: NOT_FOUND` and says why in `reasonCode`.
  const suspended = { success: false, errorCode: 'NOT_FOUND', reasonCode: 'ORGANISER_SUSPENDED', error: 'Event not found' }

  it('is the "No longer available" landing, by the code and not by the sentence', async () => {
    api.getEvent.mockResolvedValue({ ...suspended, error: 'This event is not available.' } as never)
    await open()
    expect(await screen.findByText('No longer available')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.queryByText('Couldn’t load this event')).toBeNull()
  })

  it('replaces a copy the page opened on: going to the night, opening it from what you had, and it is gone', async () => {
    mockCached.mockReturnValue(detail().data)
    api.getEvent.mockResolvedValue(suspended as never)
    await open()
    expect(await screen.findByText('No longer available')).toBeTruthy()
    expect(screen.queryByText('The experience')).toBeNull()
  })

  it('a plain network failure over a copy it already has keeps the copy', async () => {
    mockCached.mockReturnValue(detail().data)
    api.getEvent.mockResolvedValue({ success: false, error: 'network' } as never)
    await open()
    expect(await screen.findByText('The experience')).toBeTruthy()
    expect(screen.queryByText('No longer available')).toBeNull()
  })
})

describe('what changed while you were going (Flow 3 · 3.1)', () => {
  // event-changed-scene.itest.ts: a time and a venue moved; the live values are in the event, what they were in `changedFrom`.
  const moved = {
    startTime: hours(5),
    venueName: 'The New Room',
    changedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    changedFields: ['time', 'venue'],
    changedFrom: { startTime: hours(3), endTime: hours(6), venueName: 'The Old Room' },
  }

  it('says what moved, to somebody going: the old struck through and the new beside it', async () => {
    api.getEvent.mockResolvedValue(detail(moved, { rsvpStatus: 'going' }) as never)
    await open()
    const time = await screen.findByTestId('scene-change-time')
    expect(time.props.accessibilityLabel).toMatch(/^Updated, new start time\. Was .+, now .+\. Changed 2 hours ago\.$/)
    expect(screen.getByTestId('scene-change-venue').props.accessibilityLabel).toMatch(/^Updated, new venue\. Was The Old Room, now The New Room\./)
  })

  // DS-22: every text has a cap; a sentence to read grows to its role's (meta, 2×) and wraps, never to 3.571×.
  it('grows with the reader\'s type to its role\'s cap, and 48 is its minimum height', async () => {
    api.getEvent.mockResolvedValue(detail(moved, { rsvpStatus: 'going' }) as never)
    await open()
    const line = await screen.findByTestId('scene-change-time')
    expect(StyleSheet.flatten(line.props.style).minHeight).toBe(48)
    expect(StyleSheet.flatten(line.props.style).height).toBeUndefined()
    const sentence = within(line).getByText(/Updated/, { includeHiddenElements: true }).parent
    expect(sentence?.props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.meta)
  })

  it('says it to somebody who saved the night, not only to those who RSVP', async () => {
    api.getEvent.mockResolvedValue(detail(moved, { isFavorited: true }) as never)
    await open()
    expect(await screen.findByTestId('scene-change-time')).toBeTruthy()
  })

  it('is not drawn for somebody who has no stake in the night', async () => {
    api.getEvent.mockResolvedValue(detail(moved) as never)
    await open()
    await screen.findByTestId('scene-tiles')
    expect(screen.queryByTestId('scene-changed')).toBeNull()
  })

  it('is not drawn for an event that has not changed (null, [] and null), or for an older server', async () => {
    api.getEvent.mockResolvedValue(detail({ changedAt: null, changedFields: [], changedFrom: null }, { rsvpStatus: 'going' }) as never)
    await open()
    await screen.findByTestId('scene-tiles')
    expect(screen.queryByTestId('scene-changed')).toBeNull()
  })

  it('leaves a cancel to the cancelled banner: no line', async () => {
    api.getEvent.mockResolvedValue(
      detail({ status: 'cancelled', changedAt: new Date().toISOString(), changedFields: ['cancelled'], changedFrom: null }, { rsvpStatus: 'going' }) as never
    )
    await open()
    expect(await screen.findByTestId('scene-cancelled')).toBeTruthy()
    expect(screen.queryByTestId('scene-changed')).toBeNull()
  })
})

describe('the days of a run (Flow 3 · 3.2, #724 window)', () => {
  // event-changed-scene.itest.ts "the days of a run": three days, the third called off, today the second. The dates are the event's
  // own, in its own zone: "today" is judged there, never by the phone.
  const ZONE = 'Asia/Kolkata'
  const localDate = (offsetDays: number) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(Date.now() + offsetDays * 86_400_000)
  const day = (offset: number, over: Record<string, unknown> = {}) => ({ date: localDate(offset), startTime: hours(3), endTime: hours(6), cancelled: false, cancelledAt: null, ...over })
  const run = (todayIsSecond: boolean) => ({
    timezone: ZONE,
    days: [day(todayIsSecond ? -1 : 1), day(todayIsSecond ? 0 : 2), day(todayIsSecond ? 1 : 3, { cancelled: true })],
    dayCount: 3,
    daysFrom: 1,
    dayNumber: 2,
  })

  it('says where today is in the Doors tile when the session is today, and draws the strip, a called-off day struck and labelled', async () => {
    api.getEvent.mockResolvedValue(detail(run(true)) as never)
    await open()
    expect((await screen.findByTestId('scene-tile-doors')).props.accessibilityLabel).toBe('TODAY, Day\u00a02 of\u00a03')
    expect(screen.getByTestId('scene-day-1').props.accessibilityLabel).toMatch(/, day 1 of 3$/)
    expect(screen.getByTestId('scene-day-2').props.accessibilityLabel).toMatch(/, day 2 of 3, today$/)
    expect(screen.getByTestId('scene-day-3').props.accessibilityLabel).toMatch(/, cancelled$/)
    expect(screen.getByText('Cancelled', { includeHiddenElements: true })).toBeTruthy()
  })

  it('between days it keeps the clock time and says it is the NEXT doors, and the chip says next, never today', async () => {
    api.getEvent.mockResolvedValue(detail(run(false)) as never)
    await open()
    const tile = await screen.findByTestId('scene-tile-doors')
    expect(tile.props.accessibilityLabel).toMatch(/^NEXT DOORS, \d/)
    expect(tile.props.accessibilityLabel).not.toMatch(/Day\s2\sof\s3/)
    expect(screen.getByTestId('scene-day-2').props.accessibilityLabel).toMatch(/, day 2 of 3, next$/)
  })

  it('the hero says the run\'s own dates in place of the next doors (frame 04)', async () => {
    api.getEvent.mockResolvedValue(detail(run(true)) as never)
    await open()
    await screen.findByTestId('scene-when')
    // Three days: the first day's date to the last, the month said once (twice when the run crosses a month end).
    expect(screen.getByLabelText(/^Vinyl Night\. \w{3} \d+( \w{3})? to \w{3} \d+ \w{3}\./)).toBeTruthy()
  })

  it('between days, to somebody who is going, the pill says when the next day starts and is still the RSVP\'s off-switch (frame 06)', async () => {
    api.getEvent.mockResolvedValue(detail({ ...run(false), startTime: hours(-30), endTime: hours(60), session: { startTime: hours(3), endTime: hours(6) } }, { rsvpStatus: 'going' }) as never)
    await open()
    const pill = await screen.findByLabelText(/^Day 2 starts .*\. You’re going$/)
    expect(pill.props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }))
    expect(screen.queryByText('You’re going')).toBeNull()
    await fireEvent.press(pill)
    expect(showSheet).toHaveBeenCalledWith(expect.objectContaining({ title: 'Cancel your RSVP?' }))
  })

  it('before the first day there is no "between": the pill is the RSVP\'s own words even when the next day is not today', async () => {
    // The run has not begun: the session is day 1, and its start is in the future (no day has opened yet).
    const r = run(false)
    api.getEvent.mockResolvedValue(detail({ ...r, startTime: hours(30), endTime: hours(60) }, { rsvpStatus: 'going' }) as never)
    await open()
    expect(await screen.findByLabelText('You’re going')).toBeTruthy()
    expect(screen.queryByLabelText(/starts/)).toBeNull()
  })

  it('between days the pill keeps its check and says how to cancel', async () => {
    api.getEvent.mockResolvedValue(detail({ ...run(false), startTime: hours(-30), endTime: hours(60), session: { startTime: hours(3), endTime: hours(6) } }, { rsvpStatus: 'going' }) as never)
    await open()
    const pill = await screen.findByLabelText(/^Day 2 starts .*\. You’re going$/)
    expect(pill.props.accessibilityHint).toBe('Double-tap to cancel your RSVP')
  })

  it('not going, or on the day itself, the pill is the RSVP\'s own words', async () => {
    api.getEvent.mockResolvedValue(detail(run(false)) as never)
    await open()
    expect(await screen.findByLabelText('I’m going')).toBeTruthy()
    expect(screen.queryByLabelText(/starts/)).toBeNull()
  })

  it('the DOORS tile is the event’s own clock, not the phone’s: a Berlin phone, an IST night (drive 5 D-4)', async () => {
    const zone = process.env.TZ
    process.env.TZ = 'Europe/Berlin'
    refreshPhoneZone()
    try {
      const start = hours(3)
      api.getEvent.mockResolvedValue(detail({ timezone: ZONE, startTime: start, days: [day(0, { startTime: start })], dayCount: 1, daysFrom: 1, dayNumber: 1 }) as never)
      await open()
      const tile = await screen.findByTestId('scene-tile-doors')
      // The event's clock, named because the phone is elsewhere: "9 AM IST".
      expect(tile.props.accessibilityLabel).toBe(`DOORS, ${clockTime(start, ZONE)} IST`)
      expect(clockTime(start, ZONE)).not.toBe(clockTime(start))
    } finally {
      process.env.TZ = zone
      refreshPhoneZone()
    }
  })

  it('a one-day event has no strip and keeps its doors', async () => {
    api.getEvent.mockResolvedValue(detail({ timezone: ZONE, days: [day(0)], dayCount: 1, daysFrom: 1, dayNumber: 1 }) as never)
    await open()
    expect(await screen.findByTestId('scene-tile-doors')).toBeTruthy()
    expect(screen.queryByTestId('scene-days')).toBeNull()
    expect(screen.getByTestId('scene-tile-doors').props.accessibilityLabel).toMatch(/^DOORS, \d/)
  })

  it('every day called off says no day, and keeps the doors tile as it was', async () => {
    const r = run(true)
    api.getEvent.mockResolvedValue(detail({ ...r, days: r.days.map((d) => ({ ...d, cancelled: true })), dayNumber: null }) as never)
    await open()
    expect(await screen.findByTestId('scene-days')).toBeTruthy()
    expect(screen.getByTestId('scene-tile-doors').props.accessibilityLabel).toMatch(/^DOORS, \d/)
  })

  it('a 60-day run is a window: the whole run\'s "Day 40 of 60", the strip from a day before today\'s, and a bounded number of stops', async () => {
    // A window of 31 from day 30 (blendn-admin lib/occurrences.ts: first = min(index - 2, dayCount - 31)); today is day 40, index 10.
    const days = Array.from({ length: 31 }, (_, i) => day(i - 10))
    api.getEvent.mockResolvedValue(detail({ timezone: ZONE, days, dayCount: 60, daysFrom: 30, dayNumber: 40 }) as never)
    await open()
    expect((await screen.findByTestId('scene-tile-doors')).props.accessibilityLabel).toBe('TODAY, Day\u00a040 of\u00a060')
    expect(screen.getByLabelText('Days 30 to 60 of 60')).toBeTruthy()
    expect(screen.getByTestId('scene-day-40').props.accessibilityLabel).toMatch(/, day 40 of 60, today$/)
    // It opens a day before today's, not at the window's start, and never draws the whole window.
    expect(screen.queryByTestId('scene-day-30')).toBeNull()
    expect(screen.getAllByTestId(/^scene-day-\d+$/).length).toBeLessThanOrEqual(15)
  })
})

describe('an event link that cannot open (Flow 15 #9)', () => {
  const refused = (errorCode: string, error: string) => api.getEvent.mockResolvedValue({ success: false, errorCode, error } as never)

  it('under 18, known: no fix, no way to retry, never "check your connection"', async () => {
    refused('AGE_RESTRICTED', 'This event is 21+.')
    await open()
    expect(await screen.findByText('This event is 18+')).toBeTruthy()
    expect(screen.getByText('Blend’n events are for adults. This link can’t open for you.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Add your age|Try again/ })).toBeNull()
    expect(screen.queryByText(/connection/)).toBeNull()
  })

  it('an age that is not on file: Add your age opens Edit profile, and coming back asks again (the link is held)', async () => {
    refused('AGE_RESTRICTED', 'This event is 18+. Add your age to your profile to check in.')
    await open()
    expect(await screen.findByText('Add your age to open this')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Add your age' }))
    expect(mockRouter.push).toHaveBeenCalledWith('/edit-profile')
  })

  it('an unfinished profile: Finish my profile, and we hold the link', async () => {
    refused('FORBIDDEN', 'Finish setting up your profile first.')
    await open()
    expect(await screen.findByText('Finish your profile first')).toBeTruthy()
    expect(screen.getByText('Add a name and a photo, then this link opens. We’ll hold it.')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Finish my profile' }))
    expect(mockRouter.push).toHaveBeenCalledWith('/edit-profile')
  })

  it('a link missing a part is broken, with one way on and no retry', async () => {
    refused('VALIDATION_FAILED', 'Invalid event id')
    await open()
    expect(await screen.findByText('This link is broken')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Go to the Pulse' }))
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/events')
  })
})

it('a dropped connection is "Couldn’t load this event" with Try again, which asks again', async () => {
  api.getEvent.mockResolvedValue({ success: false, error: 'network' } as never)
  await open()
  expect(await screen.findByText('Couldn’t load this event')).toBeTruthy()
  api.getEvent.mockResolvedValue(detail() as never)
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('The experience')).toBeTruthy()
})

it('draws the four facts as tiles: Doors, Where (how far), Going and Door, and Where opens the map', async () => {
  api.getEvent.mockResolvedValue(detail() as never)
  await open()
  expect(await screen.findByTestId('scene-tile-doors')).toBeTruthy()
  expect(screen.getByTestId('scene-tile-crowd').props.accessibilityLabel).toBe('GOING, 42')
  expect(screen.getByTestId('scene-tile-door').props.accessibilityLabel).toBe('ENTRY, 18+')
  // Never the venue again (the hero and the Location card say it): how far, from the last fix (D16).
  expect(screen.getByTestId('scene-tile-where').props.accessibilityLabel).toBe('WHERE, 2.2km away')
  await fireEvent.press(screen.getByTestId('scene-tile-where'))
  expect(openInMaps).toHaveBeenCalled()
})

describe('one word per state, and only facts the page does not already say (TG-05)', () => {
  it('no fix: no WHERE tile, never the venue name a third time', async () => {
    mockLastFix.mockResolvedValue(null)
    api.getEvent.mockResolvedValue(detail() as never)
    await open()
    await screen.findByTestId('scene-tile-doors')
    expect(screen.queryByTestId('scene-tile-where')).toBeNull()
  })

  it('cancelled: no people tile and no people section (never "GOING 29" under "Your RSVP is released")', async () => {
    api.getEvent.mockResolvedValue(detail({ status: 'cancelled' }, { rsvpStatus: 'going' }) as never)
    await open()
    await screen.findByTestId('scene-cancelled')
    expect(screen.queryByTestId('scene-tile-crowd')).toBeNull()
    expect(screen.queryByTestId('scene-attendees')).toBeNull()
  })

  it('live: "Here now" in the tile and the section alike, with one count', async () => {
    api.getEvent.mockResolvedValue(detail({ startTime: hours(-1), endTime: hours(2), stats: { rsvpCount: 516, favoriteCount: 0, checkInCount: 483 } }) as never)
    await open()
    expect((await screen.findByTestId('scene-tile-crowd')).props.accessibilityLabel).toBe('HERE NOW, 483')
    expect(within(screen.getByTestId('scene-attendees')).getByRole('header', { name: 'Here now, 483' })).toBeTruthy()
  })

  it('past: "Went", and Rate who you met carries the star, not the live glyph', async () => {
    api.getEvent.mockResolvedValue(detail({ startTime: hours(-6), endTime: hours(-3), stats: { rsvpCount: 30, favoriteCount: 0, checkInCount: 21 } }, { checkInStatus: 'checked_out' }) as never)
    await open()
    expect((await screen.findByTestId('scene-tile-crowd')).props.accessibilityLabel).toBe('WENT, 21')
    expect(within(screen.getByTestId('scene-attendees')).getByRole('header', { name: 'Went, 21' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Rate who you met/ })).toBeTruthy()
    expect(screen.queryAllByTestId('icon-star', { includeHiddenElements: true }).length).toBeGreaterThan(0)
    expect(screen.queryAllByTestId('icon-radio', { includeHiddenElements: true })).toHaveLength(0)
  })
})

it('says the age floor and the door in the Door tile and an age pill above 18', async () => {
  api.getEvent.mockResolvedValue(detail({ minAge: 21, doorPolicy: 'guest_list' }) as never)
  await open()
  expect((await screen.findByTestId('scene-tile-door')).props.accessibilityLabel).toBe('ENTRY, 21+ · Guest list')
  expect(screen.getByTestId('scene-pill-age')).toBeTruthy()
})

describe('the ⋯ menu', () => {
  it('an attendee gets Report, which opens the event report', async () => {
    api.getEvent.mockResolvedValue(detail() as never)
    await open()
    await fireEvent.press(await screen.findByRole('button', { name: 'More options' }))
    expect(screen.queryByRole('button', { name: 'Edit event' })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Report this event' }))
    expect(showEventReportOptions).toHaveBeenCalledWith('Vinyl Night', 'e1')
  })

  it('the organizer gets the same menu: no Edit, Announce or Delete on the Scene (they are the dashboard\'s, owner ruling D3)', async () => {
    api.getEvent.mockResolvedValue(detail({ organizer: { id: 'me', name: 'Me' } }) as never)
    await open()
    await fireEvent.press(await screen.findByRole('button', { name: 'More options' }))
    const names = within(screen.getByTestId('scene-menu')).getAllByRole('button').map((n) => n.props.accessibilityLabel)
    expect(names).toEqual(['Report this event'])
    expect(screen.queryByRole('button', { name: 'Edit event' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete event' })).toBeNull()
  })

  it('the screen carries no organizer sheet, state or handler any more', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'components', 'screens', 'EventDetailScreen.tsx'), 'utf8') as string
    expect(src).not.toMatch(/AnnouncementSheet|EditEventSheet|isOrganizer|sendAnnouncement|updateEvent|deleteEvent/)
    expect(require('fs').existsSync(require('path').join(__dirname, '..', 'components', 'scene', 'EventSheets.tsx'))).toBe(false)
  })
})

describe('banners and the dock', () => {
  it('cancelled: the banner, the quiet Cancelled button, and nothing to press', async () => {
    api.getEvent.mockResolvedValue(detail({ status: 'cancelled' }, { rsvpStatus: 'going' }) as never)
    await open()
    expect(await screen.findByTestId('scene-cancelled')).toBeTruthy()
    const cta = screen.getByRole('button', { name: 'Cancelled' })
    expect(cta.props.accessibilityState).toMatchObject({ disabled: true })
  })

  it('waitlisted: the paused banner, and the button says so (never "You’re going")', async () => {
    api.getEvent.mockResolvedValue(detail({}, { rsvpStatus: 'waitlisted' }) as never)
    await open()
    expect(await screen.findByTestId('scene-waitlisted')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'On the waitlist' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'You’re going' })).toBeNull()
  })

  it('before the doors the primary is "I’m going"', async () => {
    api.getEvent.mockResolvedValue(detail() as never)
    await open()
    expect(await screen.findByRole('button', { name: 'I’m going' })).toBeTruthy()
  })

  it('says it is offline, under the hero, while it still shows what it had', async () => {
    api.getEvent.mockResolvedValue(detail() as never)
    await open()
    await screen.findByText('The experience')
    expect(screen.queryByTestId('scene-offline')).toBeNull()
    await act(async () => markOffline())
    await waitFor(() => expect(screen.getByText('Offline. Showing what you had.')).toBeTruthy())
    expect(screen.getByText('The experience')).toBeTruthy()
  })
})

describe('the RSVP answers are the app\'s Sheet, not a tray', () => {
  it('"You’re going" asks before it lets go: Keep it, or the destructive Cancel RSVP (whose press plays the haptic)', async () => {
    api.getEvent.mockResolvedValue(detail({}, { rsvpStatus: 'going' }) as never)
    await open()
    await fireEvent.press(await screen.findByRole('button', { name: 'You’re going' }))
    const sheet = (showSheet as jest.Mock).mock.calls[0][0]
    expect(sheet).toMatchObject({ kind: 'actions', title: 'Cancel your RSVP?' })
    expect(sheet.actions.map((a: { label: string; variant: string }) => [a.label, a.variant])).toEqual([
      ['Keep it', 'secondary'],
      ['Cancel RSVP', 'destructive'],
    ])
    // Nothing is cancelled until the destructive action runs.
    expect(api.cancelRsvp).not.toHaveBeenCalled()
    api.cancelRsvp.mockResolvedValue({ success: true, data: { rsvpCount: 41 } } as never)
    await act(async () => sheet.actions[1].then())
    expect(api.cancelRsvp).toHaveBeenCalledWith('e1')
  })

  it('a cancel says it worked: the CTA is the RSVP again and a toast confirms it (SCRUM-881)', async () => {
    api.getEvent.mockResolvedValue(detail({}, { rsvpStatus: 'going' }) as never)
    await open()
    await fireEvent.press(await screen.findByRole('button', { name: 'You’re going' }))
    const sheet = (showSheet as jest.Mock).mock.calls[0][0]
    api.cancelRsvp.mockResolvedValue({ success: true, data: { rsvpStatus: null, rsvpCount: 41 } } as never)
    await act(async () => sheet.actions[1].then())
    expect(mockShowToast).toHaveBeenCalledWith('RSVP cancelled.', 'success')
    expect(await screen.findByRole('button', { name: 'I’m going' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'You’re going' })).toBeNull()
  })

  it('leaving the waitlist says so', async () => {
    api.getEvent.mockResolvedValue(detail({}, { rsvpStatus: 'waitlisted' }) as never)
    await open()
    await fireEvent.press(await screen.findByRole('button', { name: 'On the waitlist' }))
    const sheet = (showSheet as jest.Mock).mock.calls[0][0]
    api.cancelRsvp.mockResolvedValue({ success: true, data: { rsvpStatus: null, rsvpCount: 42 } } as never)
    await act(async () => sheet.actions[1].then())
    expect(mockShowToast).toHaveBeenCalledWith('You’ve left the waitlist.', 'success')
  })

  it('a refused cancel keeps "You’re going" and says nothing worked', async () => {
    api.getEvent.mockResolvedValue(detail({}, { rsvpStatus: 'going' }) as never)
    await open()
    await fireEvent.press(await screen.findByRole('button', { name: 'You’re going' }))
    const sheet = (showSheet as jest.Mock).mock.calls[0][0]
    api.cancelRsvp.mockResolvedValue({ success: false, error: 'boom' } as never)
    await act(async () => sheet.actions[1].then())
    expect(mockShowToast).not.toHaveBeenCalledWith('RSVP cancelled.', 'success')
    expect(await screen.findByRole('button', { name: 'You’re going' })).toBeTruthy()
  })

  it('a failed RSVP says so in a sheet and plays the error haptic once', async () => {
    api.getEvent.mockResolvedValue(detail() as never)
    api.rsvpToEvent.mockResolvedValue({ success: false } as never)
    const { H } = jest.requireActual('../lib/haptics')
    const error = jest.spyOn(H, 'error').mockImplementation(() => {})
    await open()
    await fireEvent.press(await screen.findByRole('button', { name: 'I’m going' }))
    await waitFor(() => expect(showSheet).toHaveBeenCalledWith(expect.objectContaining({ title: 'Couldn’t RSVP' })))
    expect(error).toHaveBeenCalledTimes(1)
  })
})

describe('the sections kept from before the redesign, on the design system, behind the frame\'s layout', () => {
  it('the byline: who is putting it on, and the live count while it runs', async () => {
    api.getEvent.mockResolvedValue(detail() as never)
    await open()
    expect(await screen.findByTestId('scene-byline')).toHaveTextContent(/By Toit/)
  })

  it('attendees: the heading read as one "Going, 42"', async () => {
    api.getEvent.mockResolvedValue(detail() as never)
    await open()
    const attendees = await screen.findByTestId('scene-attendees')
    expect(within(attendees).getByRole('header', { name: 'Going, 42' })).toBeTruthy()
  })

  it('the location card: the venue, its address and the map, and a tap opens Maps', async () => {
    api.getEvent.mockResolvedValue(detail() as never)
    await open()
    const card = await screen.findByTestId('scene-location')
    expect(card).toHaveTextContent(/Toit/)
    expect(card).toHaveTextContent(/Indiranagar/)
    await fireEvent.press(screen.getByRole('button', { name: 'Open Toit in Maps' }))
    expect(openInMaps).toHaveBeenCalled()
  })
})

describe('no people count under five is printed (the Pulse\'s rule)', () => {
  it('a small going count: no tile number and the attendees heading has no number or stack', async () => {
    api.getEvent.mockResolvedValue(detail({ stats: { rsvpCount: 3, favoriteCount: 0, checkInCount: 0 } }) as never)
    await open()
    await screen.findByTestId('scene-attendees')
    expect(screen.queryByTestId('scene-tile-crowd')).toBeNull()
    expect(within(screen.getByTestId('scene-attendees')).getByRole('header', { name: 'Going' })).toBeTruthy()
    expect(screen.getByTestId('scene-attendees')).not.toHaveTextContent(/\d/)
  })

  it('five and up is printed', async () => {
    api.getEvent.mockResolvedValue(detail({ stats: { rsvpCount: 5, favoriteCount: 0, checkInCount: 0 } }) as never)
    await open()
    expect((await screen.findByTestId('scene-tile-crowd')).props.accessibilityLabel).toBe('GOING, 5')
  })
})

// TG-06 (B-S3, D8): the screen hands the hero its category's slug. Negative control: without `category={…}` the plate
// draws the fill alone and `music-2` is missing.
describe('a night with no picture draws its category plate', () => {
  it('passes the first category’s slug to the hero', async () => {
    api.getEvent.mockResolvedValue(detail({ coverImageUrl: null, categories: [{ id: 'c1', name: 'Music', slug: 'music' }] }) as never)
    await open()
    const plate = await screen.findByTestId('scene-hero-plate', { includeHiddenElements: true })
    expect(JSON.stringify(plate)).toContain('music-2')
  })
})

describe('the room’s countdown is the Scene’s (R6-5)', () => {
  // A night two days out: its room opens a day before, at start − 24 h.
  const start = new Date(Date.now() + 48 * 3_600_000)
  start.setMinutes(0, 0, 0)
  const opens = new Date(start.getTime() - 24 * 3_600_000)

  it('to somebody going, before the room opens: "Room opens", then the day and the time it opens', async () => {
    api.getEvent.mockResolvedValue(detail({ startTime: start.toISOString(), endTime: new Date(start.getTime() + 3 * 3_600_000).toISOString() }, { rsvpStatus: 'going' }) as never)
    await open()
    const line = await screen.findByTestId('scene-room-opens')
    const words = within(line).getByTestId('scene-room-opens-text')
    // "Room opens Sat 24 Oct 9 PM": day first, the app's one clock, set through MonoRun (no double-width spaces).
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][opens.getDay()]
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][opens.getMonth()]
    const year = opens.getFullYear() !== new Date().getFullYear() ? ` ${opens.getFullYear()}` : ''
    expect(textOf(words)).toBe(`Room opens ${day} ${opens.getDate()} ${month}${year} ${clockTime(opens)}`)
    expect(within(line).queryByTestId('scene-room-opens-action')).toBeNull()
  })

  const twoDaysOut = () => ({ startTime: start.toISOString(), endTime: new Date(start.getTime() + 3 * 3_600_000).toISOString() })

  it('saved counts as going', async () => {
    api.getEvent.mockResolvedValue(detail(twoDaysOut(), { isFavorited: true }) as never)
    await open()
    expect(await screen.findByTestId('scene-room-opens')).toBeTruthy()
  })

  it('neither going nor saved: no line', async () => {
    api.getEvent.mockResolvedValue(detail(twoDaysOut()) as never)
    await open()
    await screen.findByTestId('scene-tiles')
    expect(screen.queryByTestId('scene-room-opens')).toBeNull()
    expect(screen.queryByTestId('scene-room-open')).toBeNull()
  })

  it('a cancelled night: no line', async () => {
    api.getEvent.mockResolvedValue(detail({ ...twoDaysOut(), status: 'cancelled' }, { rsvpStatus: 'going' }) as never)
    await open()
    await screen.findByTestId('scene-cancelled')
    expect(screen.queryByTestId('scene-room-opens')).toBeNull()
  })

  it('inside the day before: "The room is open", and Open the room opens it', async () => {
    // The default night starts in 3 hours: its room is open.
    api.getEvent.mockResolvedValue(detail({}, { rsvpStatus: 'going' }) as never)
    api.getEventChat.mockResolvedValue({ success: true, data: { chatGroupId: 'g1' } } as never)
    await open()
    const line = await screen.findByTestId('scene-room-open')
    expect(within(line).getByText('The room is open')).toBeTruthy()
    await fireEvent.press(within(line).getByRole('button', { name: 'Open the room' }))
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/chat/[id]', params: { id: 'g1', roomName: 'Vinyl Night', eventTitle: 'Vinyl Night' } })
    )
    expect(api.getEventChat).toHaveBeenCalledWith('e1')
  })

  it('ticks over from the countdown to the open room on its own', async () => {
    jest.useFakeTimers({ now: Date.now() })
    try {
      // Opens in 90 seconds.
      const soon = new Date(Date.now() + 24 * 3_600_000 + 90_000)
      api.getEvent.mockResolvedValue(detail({ startTime: soon.toISOString(), endTime: new Date(soon.getTime() + 3_600_000).toISOString() }, { rsvpStatus: 'going' }) as never)
      await open()
      expect(await screen.findByTestId('scene-room-opens')).toBeTruthy()
      await act(async () => {
        jest.advanceTimersByTime(2 * 60_000)
      })
      expect(screen.getByTestId('scene-room-open')).toBeTruthy()
      expect(screen.queryByTestId('scene-room-opens')).toBeNull()
    } finally {
      jest.useRealTimers()
    }
  })
})

/** A host node's words, spans and all. */
function textOf(node: { children: (string | { children: unknown[] })[] }): string {
  return node.children.map((c) => (typeof c === 'string' ? c : textOf(c as never))).join('')
}

describe('the Board row (ROOM-08, flow3.js:68)', () => {
  const at = (id: string) => JSON.stringify(screen.toJSON()).indexOf(`"${id}"`)

  it('follows The experience directly, above the details, the gallery and the attendees', async () => {
    api.getEvent.mockResolvedValue(detail() as never)
    await open()
    expect(await screen.findByTestId('board-entry')).toBeTruthy()
    const experience = JSON.stringify(screen.toJSON()).indexOf('The experience')
    expect(experience).toBeGreaterThan(-1)
    expect(at('board-entry')).toBeGreaterThan(experience)
    expect(at('board-entry')).toBeLessThan(at('scene-attendees'))
  })

  it('is absent on a cancelled night', async () => {
    api.getEvent.mockResolvedValue(detail({ status: 'cancelled' }) as never)
    await open()
    await screen.findByTestId('scene-cancelled')
    expect(screen.queryByTestId('board-entry')).toBeNull()
  })

  it('is absent after the doors (the server closes the board at the first doors)', async () => {
    api.getEvent.mockResolvedValue(detail({ startTime: hours(-1), endTime: hours(2) }) as never)
    await open()
    await screen.findByTestId('scene-tiles')
    expect(screen.queryByTestId('board-entry')).toBeNull()
  })
})

describe('Blend in is the hold itself (SCRUM-966)', () => {
  it('live and not checked in: the dock is the hold, and nothing is docked in Blend’n first', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { openPass } = require('../lib/blendnOverlay') as { openPass: jest.Mock }
    api.getEvent.mockResolvedValue(detail({ startTime: hours(-1), endTime: hours(2) }) as never)
    await open()
    expect(await screen.findByRole('button', { name: 'Hold to blend in' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Blend in' })).toBeNull()
    expect(openPass).not.toHaveBeenCalled()
  })

  it('a cancelled night happening now is "Cancelled", never Blend in', async () => {
    api.getEvent.mockResolvedValue(detail({ startTime: hours(-1), endTime: hours(2), status: 'cancelled' }) as never)
    await open()
    expect(await screen.findByTestId('scene-cancelled')).toBeTruthy()
    expect(screen.getAllByText('Cancelled').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Blend in' })).toBeNull()
    expect(screen.queryByText('Blend in')).toBeNull()
  })
})
