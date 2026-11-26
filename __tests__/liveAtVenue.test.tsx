/**
 * Your Go Live, wherever you are (plan v2 step 5), as mounted: the expiry prompt (Flow 11 ·
 * 11.4) is `ExpiryPrompt`, asked when a fixed window has run out ("Your live time at ‹place›
 * is up · Still here?"), once a night, with the free 45 minutes as its primary, a free Stay
 * row, and Done for now.
 *
 * Negative controls (the client keeps no registry): dropping `!here.prompted` fails "asks
 * once a night"; dropping `NO_STAY_ROW_PATHS` fails "over a chat there is no Stay row".
 */
import React from 'react'
import { act, render, screen, fireEvent } from '@testing-library/react-native'

const NOW = Date.parse('2026-10-09T20:00:00.000Z')
const mockShowToast = jest.fn()
const mockEnded: Array<(d: { eventId: string; reason: string }) => void> = []
const mockChanged = new Set<() => void>()
let mockPath = '/venue/v1'
let mockRoomOpen = false

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false) }
})
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} />, isGlassEffectAPIAvailable: jest.fn(() => true), isLiquidGlassAvailable: jest.fn(() => true) }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
jest.mock('expo-router', () => ({ usePathname: () => mockPath, router: { push: jest.fn() } }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getActiveCheckins: jest.fn(), goLive: jest.fn() } }))
// The prompt's own drawing is `dsExpiryPrompt.test.tsx`'s; here, what LiveAtVenue tells it. A sheet that left is gone from the tree.
/** Whether the prompt reaches the screen when asked (its Sheet's onShow): false is one that waited and was withdrawn, or iOS refused. */
let mockShows = true
jest.mock('../components/ds/ExpiryPrompt', () => {
  const { Text, Pressable, View } = require('react-native')
  const { useEffect } = require('react')
  const Shown = ({ onShown }: { onShown?: () => void }) => {
    useEffect(() => {
      if (mockShows) onShown?.()
    }, [onShown])
    return null
  }
  return {
    ExpiryPrompt: (p: any) =>
      p.visible ? (
        <View>
          <Shown onShown={p.onShown} />
          <Text accessibilityRole="header">{p.kind === 'reset' ? 'Today’s room has closed' : `Your live time at ${p.venue} is up`}</Text>
          {p.kind === 'ended' ? <Text>Still here?</Text> : null}
          {p.opensAt ? <Text>{`opens at ${p.opensAt}`}</Text> : null}
          {p.kind === 'ended' ? <Pressable accessibilityRole="button" accessibilityLabel="Extend 45 min — free" accessibilityState={{ busy: p.extending }} onPress={p.onExtend} /> : null}
          {p.stay ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stay while you’re here, up to 4 h"
              accessibilityState={{ busy: p.staying }}
              onPress={p.stay.onPress}
            />
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Done for now" onPress={p.onDone} />
        </View>
      ) : null,
  }
})
jest.mock('../lib/blendnOverlay', () => ({ isBlendnOpen: () => mockRoomOpen }))
jest.mock('../lib/socketClient', () => ({
  subscribeToLiveEnded: (cb: never) => {
    mockEnded.push(cb)
    return () => {}
  },
}))
jest.mock('../lib/checkIn', () => ({
  checkInChanged: jest.fn(() => mockChanged.forEach((f) => f())),
  subscribeCheckInChanged: (f: () => void) => {
    mockChanged.add(f)
    return () => mockChanged.delete(f)
  },
}))
jest.mock('../lib/usePresence', () => ({ usePresence: () => ({ finished: false }) }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
jest.mock('../lib/locationFix', () => ({ getCurrentLocation: jest.fn(async () => ({ latitude: 1, longitude: 2, accuracy: 10 })) }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
jest.mock('../lib/sheetDismissed', () => ({ ...jest.requireActual('../lib/sheetDismissed'), afterSheetDismissed: () => Promise.resolve() }))

/* eslint-disable import/first */
import { LiveAtVenue, endedByReset } from '../components/LiveAtVenue'
import { apiClient } from '../lib/apiClient'
import { checkInChanged } from '../lib/checkIn'
import { markLivePrompted, readLiveSession, rememberLiveSession } from '../lib/goLive'
import { getCurrentLocation } from '../lib/locationFix'
/* eslint-enable import/first */

const at = (min: number) => new Date(NOW + min * 60_000).toISOString()
const active = (expiresAt: string, stay = false) =>
  (apiClient.getActiveCheckins as jest.Mock).mockResolvedValue({
    success: true,
    data: { checkIns: [{ id: 'c1', eventId: 'day-1', kind: 'venue_day', expiresAt, stay, event: { venueName: 'The Humming Tree' } }] },
  })
const notLive = () => (apiClient.getActiveCheckins as jest.Mock).mockResolvedValue({ success: true, data: { checkIns: [] } })

const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve()
  })
}
async function mount() {
  await render(<LiveAtVenue />)
  await flush()
}
/** The server ends the window at its second. */
async function endWith(reason: string) {
  // By then the server has ended it: the re-read the end triggers finds nobody live.
  notLive()
  await act(async () => {
    mockEnded[0]({ eventId: 'day-1', reason })
    await new Promise((r) => setTimeout(r, 0))
  })
  await flush()
}
const press = async (name: string) => {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }))
  })
  await flush()
}
const isUp = (text: string) => screen.queryByText(text) !== null

beforeEach(async () => {
  // Only the clock: the window's `expiresAt` is read against it, and nothing else here waits on a timer.
  jest.useFakeTimers({
    now: NOW,
    doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
  })
  mockEnded.length = 0
  mockShows = true
  mockChanged.clear()
  mockPath = '/venue/v1'
  mockRoomOpen = false
  jest.clearAllMocks()
  await require('@react-native-async-storage/async-storage').clear()
  await rememberLiveSession({ userId: 'u1', venueDayId: 'day-1', venueId: 'v1', venueName: 'The Humming Tree', choice: { minutes: 20 } })
  notLive()
  ;(apiClient.goLive as jest.Mock).mockResolvedValue({ success: true, data: { venueDayId: 'day-1', expiresAt: at(65) } })
})

afterEach(() => jest.useRealTimers())

describe('the expiry prompt (Flow 11 · 11.4), as mounted', () => {
  it('asks when the window runs out: Extend 45 min — free asks the server for 45 minutes and closes the prompt', async () => {
    active(at(20))
    await mount()
    expect(isUp('Still here?')).toBe(false)
    await endWith('expired')
    expect(isUp('Still here?')).toBe(true)
    // Spent once it is on screen (its onShow), which writes a moment later.
    await flush()
    expect((await readLiveSession('u1'))?.prompted).toBe(true)
    expect(checkInChanged).toHaveBeenCalledWith('day-1')

    await press('Extend 45 min — free')
    expect(apiClient.goLive).toHaveBeenCalledWith('v1', expect.objectContaining({ minutes: 45 }))
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining("You’re live until"), 'success')
    expect(isUp('Still here?')).toBe(false)
  })

  it('asks once a night: the next end says it in a toast, not a second sheet', async () => {
    active(at(20))
    await mount()
    await endWith('expired')
    await press('Done for now')
    expect(isUp('Still here?')).toBe(false)
    await endWith('expired')
    expect(isUp('Still here?')).toBe(false)
    expect(mockShowToast).toHaveBeenCalledWith("You’re no longer live at The Humming Tree.", 'info')
  })

  it('does not ask for a window that was already asked about on a previous run', async () => {
    await markLivePrompted('u1', 'day-1')
    active(at(20))
    await mount()
    await endWith('expired')
    expect(isUp('Still here?')).toBe(false)
    expect(mockShowToast).toHaveBeenCalledWith("You’re no longer live at The Humming Tree.", 'info')
  })

  it('stays out of the way of every other end: your own stop says nothing, the rest a sentence', async () => {
    active(at(20))
    await mount()
    await endWith('manual')
    expect(mockShowToast).not.toHaveBeenCalled()
    await endWith('left_area')
    expect(mockShowToast).toHaveBeenCalledWith("You left The Humming Tree, so you’re no longer live.", 'info')
    await endWith('event_started')
    expect(mockShowToast).toHaveBeenCalledWith('An event just started at The Humming Tree. Check in to it to join its room.', 'info')
    expect(isUp('Still here?')).toBe(false)
  })

  it('a window started on another phone has no place to extend at: a toast only', async () => {
    await require('@react-native-async-storage/async-storage').clear()
    active(at(20))
    await mount()
    await endWith('expired')
    expect(isUp('Still here?')).toBe(false)
    expect(mockShowToast).toHaveBeenCalledWith("You’re no longer live at The Humming Tree.", 'info')
  })

  it('a read that still shows the window that just ended does not close it; one that shows a new window does', async () => {
    active(at(20))
    await mount()
    await endWith('expired')
    expect(isUp('Still here?')).toBe(true)
    active(at(-1))
    await act(async () => {
      mockChanged.forEach((f) => f())
    })
    await flush()
    expect(isUp('Still here?')).toBe(true)
    active(at(65))
    await act(async () => {
      mockChanged.forEach((f) => f())
    })
    await flush()
    expect(isUp('Still here?')).toBe(false)
  })

  it('"Done for now" closes it and nothing else happens', async () => {
    active(at(20))
    await mount()
    await endWith('expired')
    await press('Done for now')
    expect(apiClient.goLive).not.toHaveBeenCalled()
    expect(isUp('Still here?')).toBe(false)
  })

  it('a refused Extend shows its reason in a tray, not under the prompt', async () => {
    active(at(20))
    await mount()
    await endWith('expired')
    ;(apiClient.goLive as jest.Mock).mockResolvedValue({ success: false, errorCode: 'OUT_OF_RANGE', error: 'You’re not at The Humming Tree yet.' })
    await press('Extend 45 min — free')
    expect(isUp('Still here?')).toBe(false)
    expect(screen.getByText('You’re not at The Humming Tree yet.')).toBeTruthy()
  })
})

/**
 * M8: the socket was away (the app was backgrounded) when the window ran out, so `live:ended` never came; the read that finds
 * nobody live, for a window that had run out, asks all the same.
 * Negative control: removing the `before`/`last` check in `read()` fails "asks from the read".
 */
describe('an end the socket missed', () => {
  const readsAgain = async () => {
    await act(async () => {
      mockChanged.forEach((f) => f())
    })
    await flush()
  }

  it('asks from the read that finds the window gone, and a late live:ended does not ask twice', async () => {
    active(at(5))
    await mount()
    jest.setSystemTime(NOW + 6 * 60_000)
    notLive()
    await readsAgain()
    expect(isUp('Still here?')).toBe(true)
    await flush()
    expect((await readLiveSession('u1'))?.prompted).toBe(true)
    await press('Done for now')
    await endWith('expired')
    expect(isUp('Still here?')).toBe(false)
  })

  it('a prompt asked for but never on screen does not spend the night’s one (review MED-2)', async () => {
    // Arrange: the prompt waits behind another sheet, or iOS refuses it; it never reaches the screen.
    mockShows = false
    active(at(5))
    await mount()

    // Act
    jest.setSystemTime(NOW + 6 * 60_000)
    notLive()
    await readsAgain()
    await flush()

    // Assert: tonight's prompt is still to come.
    expect((await readLiveSession('u1'))?.prompted).toBe(false)
  })

  it('a prompt withdrawn unseen is asked again at the next end (review LOW: asked is set on show)', async () => {
    mockShows = false
    active(at(20))
    await mount()
    await endWith('expired')
    expect(isUp('Still here?')).toBe(true)
    // Never on screen, and taken away.
    await press('Done for now')
    expect(isUp('Still here?')).toBe(false)
    // The next end: asked again, not a toast.
    mockShows = true
    await endWith('expired')
    expect(isUp('Still here?')).toBe(true)
  })

  it('the night’s prompt spent, a window the read finds over is still said: the toast, not silence (drive 4 D-8)', async () => {
    // Arrange: tonight's one prompt was already asked.
    await markLivePrompted('u1', 'day-1')
    active(at(5))
    await mount()

    // Act: the phone missed live:ended; the next read finds the window gone.
    jest.setSystemTime(NOW + 6 * 60_000)
    notLive()
    await readsAgain()

    // Assert
    expect(isUp('Still here?')).toBe(false)
    expect(mockShowToast).toHaveBeenCalledWith("You’re no longer live at The Humming Tree.", 'info')
  })

  it('an end found long after it happened (the app was away an hour) is not toasted as news (review LOW-5)', async () => {
    await markLivePrompted('u1', 'day-1')
    active(at(5))
    await mount()
    jest.setSystemTime(NOW + 70 * 60_000)
    notLive()
    await readsAgain()
    expect(mockShowToast).not.toHaveBeenCalled()
  })

  it('the socket and the read that follows it say one end once', async () => {
    await markLivePrompted('u1', 'day-1')
    active(at(5))
    await mount()
    jest.setSystemTime(NOW + 6 * 60_000)
    // live:ended, then the re-read it triggers finds the same window over.
    await endWith('expired')
    await readsAgain()
    expect(mockShowToast).toHaveBeenCalledTimes(1)
  })

  it('not for a window that had not run out (you left, or it was ended early), nor for "stay"', async () => {
    active(at(30))
    await mount()
    notLive()
    await readsAgain()
    expect(isUp('Still here?')).toBe(false)

    active(at(5), true)
    await readsAgain()
    jest.setSystemTime(NOW + 6 * 60_000)
    notLive()
    await readsAgain()
    expect(isUp('Still here?')).toBe(false)
  })

  it('not for a window started on another phone, which has no place to extend at', async () => {
    await require('@react-native-async-storage/async-storage').clear()
    active(at(5))
    await mount()
    jest.setSystemTime(NOW + 6 * 60_000)
    notLive()
    await readsAgain()
    expect(isUp('Still here?')).toBe(false)
  })

  it('not when it was asked about on a previous run', async () => {
    await markLivePrompted('u1', 'day-1')
    active(at(5))
    await mount()
    jest.setSystemTime(NOW + 6 * 60_000)
    notLive()
    await readsAgain()
    expect(isUp('Still here?')).toBe(false)
  })
})

describe('the 06:00 reset', () => {
  const resetSession = async () => {
    await rememberLiveSession({ userId: 'u1', venueDayId: 'day-1', venueId: 'v1', venueName: 'The Humming Tree', dayEndsAt: new Date(Date.now() - 1000).toISOString() })
  }

  it('says the room closed, with Done for now, once the window ran out at the venue day’s end', async () => {
    await resetSession()
    active(at(20))
    await mount()
    await endWith('expired')
    expect(screen.getByRole('header', { name: 'Today’s room has closed' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Done for now' })).toBeTruthy()
    expect(isUp('Still here?')).toBe(false)
  })

  it('in the room the room says it: no second sheet, no toast', async () => {
    await resetSession()
    mockPath = '/chat/g1'
    active(at(20))
    await mount()
    await endWith('expired')
    expect(isUp('Today’s room has closed')).toBe(false)
    expect(mockShowToast).not.toHaveBeenCalled()
  })

  it('says the venue’s own hour for tomorrow’s room, from the day’s end', async () => {
    await rememberLiveSession({ userId: 'u1', venueDayId: 'day-1', venueId: 'v1', venueName: 'The Humming Tree', dayEndsAt: new Date(Date.now() - 1000).toISOString() })
    const hour = new Date(Date.now() - 1000).getHours()
    active(at(20))
    await mount()
    await endWith('expired')
    expect(screen.getByText(`opens at ${hour === 12 ? 'noon' : hour === 0 ? 'midnight' : hour < 12 ? hour : `${hour - 12} pm`}`)).toBeTruthy()
  })

  it('what counts as the reset: the window ended within a minute of the venue day’s end, or after it', () => {
    const now = Date.parse('2026-10-10T00:30:00.000Z')
    expect(endedByReset({ dayEndsAt: '2026-10-10T00:30:00.000Z' }, now)).toBe(true)
    expect(endedByReset({ dayEndsAt: '2026-10-10T00:30:50.000Z' }, now)).toBe(true)
    expect(endedByReset({ dayEndsAt: '2026-10-10T00:35:00.000Z' }, now)).toBe(false)
    expect(endedByReset({ dayEndsAt: undefined }, now)).toBe(false)
    expect(endedByReset(null, now)).toBe(false)
  })
})

describe('the Stay row (Flow 11 · R2-D7, 12.1 #05)', () => {
  const ended = async () => {
    active(at(20))
    await mount()
    await endWith('expired')
  }

  /** Over a chat or the room: Extend and Done only. Negative control: dropping `NO_STAY_ROW_PATHS` from `stayRow` fails these. */
  it.each([['a chat', '/chat/g1', false], ['a DM', '/private-chat/c1', false], ['the room overlay', '/(tabs)/events', true]])('over %s there is no Stay row', async (_label, path, roomOpen) => {
    mockPath = path
    mockRoomOpen = roomOpen
    await ended()
    expect(isUp('Still here?')).toBe(true)
    expect(screen.getByRole('button', { name: 'Extend 45 min — free' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Done for now' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Stay while you’re here/ })).toBeNull()
  })

  it('staying is just staying (launch gate 5): the row goes live with Stay, no price, even on a first night', async () => {
    await require('@react-native-async-storage/async-storage').clear()
    await rememberLiveSession({ userId: 'u1', venueDayId: 'day-1', venueId: 'v1', venueName: 'The Humming Tree' })
    ;(apiClient.goLive as jest.Mock).mockResolvedValue({ success: true, data: { venueDayId: 'day-1', expiresAt: at(30), stay: true } })
    await ended()
    expect(screen.queryByText(/Blend’n\+/)).toBeNull()
    await press('Stay while you’re here, up to 4 h')
    expect(apiClient.goLive).toHaveBeenCalledWith('v1', expect.objectContaining({ stay: true }))
    expect(mockShowToast).toHaveBeenCalledWith("You’re live for as long as you’re here", 'success')
    expect(isUp('Still here?')).toBe(false)
  })

  it('an old server that still answers PLUS_REQUIRED: its own sentence in a tray, no sheet to buy anything', async () => {
    ;(apiClient.goLive as jest.Mock).mockResolvedValue({ success: false, errorCode: 'PLUS_REQUIRED', error: 'Staying live isn’t open here right now.' })
    await ended()
    await press('Stay while you’re here, up to 4 h')
    expect(isUp('Still here?')).toBe(false)
    expect(screen.getByText('Couldn’t go live')).toBeTruthy()
    expect(screen.getByText('Staying live isn’t open here right now.')).toBeTruthy()
    expect(screen.queryByText(/Blend’n\+/)).toBeNull()
  })

  it('spins Extend only when Extend was pressed', async () => {
    await ended()
    let land: (v: unknown) => void = () => {}
    ;(apiClient.goLive as jest.Mock).mockReturnValue(new Promise((r) => (land = r)))
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Extend 45 min — free' }))
    })
    expect(screen.getByRole('button', { name: 'Extend 45 min — free' }).props.accessibilityState).toMatchObject({ busy: true })
    await act(async () => land({ success: true, data: { venueDayId: 'day-1', expiresAt: at(65) } }))
    ;(getCurrentLocation as jest.Mock).mockClear()
  })
})
