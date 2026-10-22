/**
 * Your Go Live, wherever you are (plan v2 step 5), as mounted: the expiry prompt (Flow 11 ·
 * 11.4) is `ExpiryPrompt`, asked when a fixed window has run out ("Your live time at ‹place›
 * is up · Still here?"), once a night, with the free 45 minutes as its primary, a Stay row
 * that is Blendn+'s only where Blendn+ is sold (and never on a first Go Live), and Done for now.
 *
 * Negative controls (the client keeps no registry): dropping `!here.prompted` fails "asks
 * once a night"; showing the sold row without `firstGoLive` fails "never on a first Go Live";
 * routing the sold row to `goLive(STAY_CHOICE)` fails "opens the Tonight sheet, never asks the server".
 */
import React from 'react'
import { act, render, screen, fireEvent } from '@testing-library/react-native'

const NOW = Date.parse('2026-10-09T20:00:00.000Z')
const mockShowToast = jest.fn()
const mockEnded: Array<(d: { eventId: string; reason: string }) => void> = []
const mockChanged = new Set<() => void>()
let mockPath = '/venue/v1'

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
jest.mock('../lib/apiClient', () => ({ apiClient: { getActiveCheckins: jest.fn(), goLive: jest.fn(), getMyPlus: jest.fn() } }))
// The Tonight sheet: whether it opened, and its closing (the prompt comes back after a dismissal).
const mockPaywallClosed = new Set<(how: 'done' | 'dismissed') => void>()
const mockOpenTonight = jest.fn(async (..._a: unknown[]) => true)
jest.mock('../lib/paywall', () => ({
  openTonight: (...a: unknown[]) => mockOpenTonight(...a),
  subscribePaywallClosed: (fn: (how: 'done' | 'dismissed') => void) => {
    mockPaywallClosed.add(fn)
    return () => mockPaywallClosed.delete(fn)
  },
}))
jest.mock('../components/plus/TonightHost', () => ({ TonightHost: () => null }))
// The prompt's own drawing is `dsExpiryPrompt.test.tsx`'s; here, what LiveAtVenue tells it. A sheet that left is gone from the tree.
jest.mock('../components/ds/ExpiryPrompt', () => {
  const { Text, Pressable, View } = require('react-native')
  return {
    ExpiryPrompt: (p: any) =>
      p.visible ? (
        <View>
          <Text accessibilityRole="header">{p.kind === 'reset' ? 'Today’s room has closed' : `Your live time at ${p.venue} is up`}</Text>
          {p.kind === 'ended' ? <Text>Still here?</Text> : null}
          {p.firstGoLiveTonight ? <Text>first Go Live</Text> : null}
          {p.kind === 'ended' ? <Pressable accessibilityRole="button" accessibilityLabel="Extend 45 min — free" accessibilityState={{ busy: p.extending }} onPress={p.onExtend} /> : null}
          {p.plus ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={p.plus.from ? `Stay while you’re here with Blend’n+, from ${p.plus.from}` : 'Stay while you’re here, up to 4 h'}
              accessibilityState={{ busy: p.staying }}
              onPress={p.plus.onPress}
            />
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Done for now" onPress={p.onDone} />
        </View>
      ) : null,
  }
})
jest.mock('../lib/purchases', () => ({ loadPlusOffers: jest.fn() }))
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
import { markLivePrompted, noteGoLiveDay, readLiveSession, rememberLiveSession } from '../lib/goLive'
import { getCurrentLocation } from '../lib/locationFix'
import { loadPlusOffers } from '../lib/purchases'
/* eslint-enable import/first */

const at = (min: number) => new Date(NOW + min * 60_000).toISOString()
const active = (expiresAt: string, stay = false) =>
  (apiClient.getActiveCheckins as jest.Mock).mockResolvedValue({
    success: true,
    data: { checkIns: [{ id: 'c1', eventId: 'day-1', kind: 'venue_day', expiresAt, stay, event: { venueName: 'The Humming Tree' } }] },
  })
const notLive = () => (apiClient.getActiveCheckins as jest.Mock).mockResolvedValue({ success: true, data: { checkIns: [] } })
const plus = (patch: object) =>
  (apiClient.getMyPlus as jest.Mock).mockResolvedValue({ success: true, data: { active: false, gated: true, product: null, source: null, expiresAt: null, ...patch } })
const offer = (price: number, priceString: string) => ({ pkg: { product: { price } }, price: priceString })

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
  mockChanged.clear()
  mockPaywallClosed.clear()
  mockPath = '/venue/v1'
  jest.clearAllMocks()
  await require('@react-native-async-storage/async-storage').clear()
  // A second night: this is not a first Go Live.
  await noteGoLiveDay('u1', 'day-0')
  await rememberLiveSession({ userId: 'u1', venueDayId: 'day-1', venueId: 'v1', venueName: 'The Humming Tree', choice: { minutes: 20 } })
  notLive()
  ;(apiClient.goLive as jest.Mock).mockResolvedValue({ success: true, data: { venueDayId: 'day-1', expiresAt: at(65) } })
  // Gated here, no Plus.
  plus({})
  ;(loadPlusOffers as jest.Mock).mockResolvedValue([offer(199, '₹199'), offer(49, '₹49')])
  mockOpenTonight.mockReset().mockResolvedValue(true)
})

afterEach(() => jest.useRealTimers())

describe('the expiry prompt (Flow 11 · 11.4), as mounted', () => {
  it('asks when the window runs out: Extend 45 min — free asks the server for 45 minutes and closes the prompt', async () => {
    active(at(20))
    await mount()
    expect(isUp('Still here?')).toBe(false)
    await endWith('expired')
    expect(isUp('Still here?')).toBe(true)
    expect(isUp('Still here?')).toBe(true)
    expect((await readLiveSession('u1'))?.prompted).toBe(true)
    expect(checkInChanged).toHaveBeenCalledWith('day-1')

    await press('Extend 45 min — free')
    expect(apiClient.goLive).toHaveBeenCalledWith('v1', expect.objectContaining({ minutes: 45 }))
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining("You're live until"), 'success')
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
    expect(mockShowToast).toHaveBeenCalledWith("You're no longer live at The Humming Tree.", 'info')
  })

  it('does not ask for a window that was already asked about on a previous run', async () => {
    await markLivePrompted('u1', 'day-1')
    active(at(20))
    await mount()
    await endWith('expired')
    expect(isUp('Still here?')).toBe(false)
    expect(mockShowToast).toHaveBeenCalledWith("You're no longer live at The Humming Tree.", 'info')
  })

  it('stays out of the way of every other end: your own stop says nothing, the rest a sentence', async () => {
    active(at(20))
    await mount()
    await endWith('manual')
    expect(mockShowToast).not.toHaveBeenCalled()
    await endWith('left_area')
    expect(mockShowToast).toHaveBeenCalledWith("You left The Humming Tree, so you're no longer live.", 'info')
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
    expect(mockShowToast).toHaveBeenCalledWith("You're no longer live at The Humming Tree.", 'info')
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

  it('where Blendn+ is sold it is Blendn+’s, from the store’s lowest price, and a tap opens the Tonight sheet — never the server', async () => {
    await ended()
    const row = screen.getByRole('button', { name: /Stay while you’re here with Blend’n\+/ })
    expect(row.props.accessibilityLabel).toContain('from')
    await act(async () => {
      fireEvent.press(row)
    })
    await flush()
    expect(mockOpenTonight).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'expiry', venue: 'The Humming Tree' }), { userInitiated: true })
    expect(apiClient.goLive).not.toHaveBeenCalled()
    // The sheet makes way for it.
    expect(isUp('Still here?')).toBe(false)
  })

  it('the Tonight sheet’s free path extends 45 minutes; a bought Stay goes live with Stay', async () => {
    await ended()
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: /Stay while you’re here with Blend’n\+/ }))
    })
    await flush()
    const request = mockOpenTonight.mock.calls[0][0] as { onFree: () => void; onUnlocked: () => void }
    await act(async () => request.onFree())
    expect(apiClient.goLive).toHaveBeenLastCalledWith('v1', expect.objectContaining({ minutes: 45 }))
    await act(async () => request.onUnlocked())
    expect(apiClient.goLive).toHaveBeenLastCalledWith('v1', expect.objectContaining({ stay: true }))
  })

  it('declining it brings the prompt back; doing something there does not', async () => {
    await ended()
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: /Stay while you’re here with Blend’n\+/ }))
    })
    await flush()
    await act(async () => {
      for (const fn of [...mockPaywallClosed]) fn('dismissed')
    })
    expect(isUp('Still here?')).toBe(true)
    expect(screen.getByRole('button', { name: 'Extend 45 min — free' })).toBeTruthy()

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: /Stay while you’re here with Blend’n\+/ }))
    })
    await flush()
    await act(async () => {
      for (const fn of [...mockPaywallClosed]) fn('done')
    })
    expect(isUp('Still here?')).toBe(false)
  })

  it('never on a person’s first Go Live', async () => {
    await require('@react-native-async-storage/async-storage').clear()
    await rememberLiveSession({ userId: 'u1', venueDayId: 'day-1', venueId: 'v1', venueName: 'The Humming Tree' })
    await ended()
    expect(isUp('Still here?')).toBe(true)
    // The prompt is told it is a first Go Live: it draws no Blendn+ row for one (dsExpiryPrompt.test).
    expect(isUp('first Go Live')).toBe(true)
  })

  it('no row where Blendn+ is sold but the store has no price to name', async () => {
    ;(loadPlusOffers as jest.Mock).mockResolvedValue(null)
    await ended()
    expect(screen.queryByRole('button', { name: /Stay while you’re here/ })).toBeNull()
  })

  it.each([
    ['in a launch season', { gated: false }],
    ['to a holder', { active: true, product: 'plus' }],
  ])('%s staying is just staying: the plain row goes live with Stay, no price, even on a first night', async (_label, patch) => {
    plus(patch)
    await require('@react-native-async-storage/async-storage').clear()
    await rememberLiveSession({ userId: 'u1', venueDayId: 'day-1', venueId: 'v1', venueName: 'The Humming Tree' })
    ;(apiClient.goLive as jest.Mock).mockResolvedValue({ success: true, data: { venueDayId: 'day-1', expiresAt: at(30), stay: true } })
    await ended()
    expect(screen.queryByRole('button', { name: /with Blend’n\+/ })).toBeNull()
    await press('Stay while you’re here, up to 4 h')
    expect(apiClient.goLive).toHaveBeenCalledWith('v1', expect.objectContaining({ stay: true }))
    expect(mockOpenTonight).not.toHaveBeenCalled()
    expect(mockShowToast).toHaveBeenCalledWith("You're live for as long as you're here", 'success')
    expect(isUp('Still here?')).toBe(false)
  })

  it('refused as Blendn+’s by a stale status: the Tonight sheet opens for it and the prompt waits for it', async () => {
    plus({ gated: false })
    ;(apiClient.goLive as jest.Mock).mockResolvedValue({ success: false, errorCode: 'PLUS_REQUIRED', error: 'Staying live is part of Blendn+.' })
    await ended()
    await press('Stay while you’re here, up to 4 h')
    expect(mockOpenTonight).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'stay', venue: 'The Humming Tree' }))
    expect(isUp('Still here?')).toBe(false)
    await act(async () => {
      for (const fn of [...mockPaywallClosed]) fn('dismissed')
    })
    expect(isUp('Still here?')).toBe(true)
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
