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
  },
}))
jest.mock('../lib/socketClient', () => ({
  subscribeToEventCheckIn: () => () => {},
  subscribeToEventInterest: () => () => {},
}))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('../components/scene/SceneHeroMedia', () => ({ SceneHeroMedia: () => null, HERO_CAPTION_FOOT: 40 }))
jest.mock('../components/scene/SceneLightbox', () => ({ SceneLightbox: () => null }))
jest.mock('../components/board/BoardSections', () => ({ BoardEntry: () => null }))
jest.mock('../lib/blendnOverlay', () => ({ openBlendn: jest.fn(), openPass: jest.fn() }))
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

/* eslint-disable import/first */
import { router as mockRouter } from 'expo-router'
import EventDetail from '../components/screens/EventDetailScreen'
import { apiClient } from '../lib/apiClient'
import { openInMaps } from '../lib/openInMaps'
import { showEventReportOptions } from '../lib/safetyUtils'
import { showSheet } from '../lib/sheet'
import { markOffline, markOnline } from '../lib/networkStatus'
import { clockTime } from '../lib/time'
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

describe('the organiser was suspended (Flow 15 #10, SCRUM-749)', () => {
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

  it('grows with the reader\'s type: a sentence to read has no font cap, and 48 is its minimum height', async () => {
    api.getEvent.mockResolvedValue(detail(moved, { rsvpStatus: 'going' }) as never)
    await open()
    const line = await screen.findByTestId('scene-change-time')
    expect(StyleSheet.flatten(line.props.style).minHeight).toBe(48)
    expect(StyleSheet.flatten(line.props.style).height).toBeUndefined()
    const sentence = within(line).getByText(/Updated/, { includeHiddenElements: true }).parent
    expect(sentence?.props.maxFontSizeMultiplier).toBeUndefined()
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
    // Three days: the first day's date to the last, the month said once.
    expect(screen.getByLabelText(/^Vinyl Night\. \w{3} \d+ to \w{3} \d+ \w{3}\./)).toBeTruthy()
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
    try {
      const start = hours(3)
      api.getEvent.mockResolvedValue(detail({ timezone: ZONE, startTime: start, days: [day(0, { startTime: start })], dayCount: 1, daysFrom: 1, dayNumber: 1 }) as never)
      await open()
      const tile = await screen.findByTestId('scene-tile-doors')
      expect(tile.props.accessibilityLabel).toBe(`DOORS, ${clockTime(start, ZONE)}`)
      expect(clockTime(start, ZONE)).not.toBe(clockTime(start))
    } finally {
      process.env.TZ = zone
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

it('draws the four facts as tiles: Doors, Where, Going and Door, and Where opens the map', async () => {
  api.getEvent.mockResolvedValue(detail() as never)
  await open()
  expect(await screen.findByTestId('scene-tile-doors')).toBeTruthy()
  expect(screen.getByTestId('scene-tile-crowd').props.accessibilityLabel).toBe('GOING, 42')
  expect(screen.getByTestId('scene-tile-door').props.accessibilityLabel).toBe('ENTRY, 18+')
  await fireEvent.press(screen.getByTestId('scene-tile-where'))
  expect(openInMaps).toHaveBeenCalled()
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

  it('the organiser gets the same menu: no Edit, Announce or Delete on the Scene (they are the dashboard\'s, owner ruling D3)', async () => {
    api.getEvent.mockResolvedValue(detail({ organizer: { id: 'me', name: 'Me' } }) as never)
    await open()
    await fireEvent.press(await screen.findByRole('button', { name: 'More options' }))
    const names = within(screen.getByTestId('scene-menu')).getAllByRole('button').map((n) => n.props.accessibilityLabel)
    expect(names).toEqual(['Report this event'])
    expect(screen.queryByRole('button', { name: 'Edit event' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete event' })).toBeNull()
  })

  it('the screen carries no organiser sheet, state or handler any more', () => {
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
    expect(within(screen.getByTestId('scene-attendees')).getByRole('header', { name: 'Attendees' })).toBeTruthy()
    expect(screen.getByTestId('scene-attendees')).not.toHaveTextContent(/\d/)
  })

  it('five and up is printed', async () => {
    api.getEvent.mockResolvedValue(detail({ stats: { rsvpCount: 5, favoriteCount: 0, checkInCount: 0 } }) as never)
    await open()
    expect((await screen.findByTestId('scene-tile-crowd')).props.accessibilityLabel).toBe('GOING, 5')
  })
})
