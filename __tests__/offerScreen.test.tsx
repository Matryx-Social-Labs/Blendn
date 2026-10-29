import React from 'react'
import { act, render, screen, fireEvent } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

/*
 * The clock is pinned (`jest.useFakeTimers({ now: NOW })` fakes Date too), so
 * the fixtures' 20:00Z turn never meets the wall clock. What did flake was
 * time on the CPU: the tests that walk the clock a second at a time take
 * ~0.5 s alone and 3–4 s on a loaded machine (a full parallel jest run), next
 * to jest's 5 s default — and one that timed out kept acting into the tests
 * after it. They get room.
 */
const mockToast = jest.fn()
const NOW = Date.parse('2026-10-11T20:00:10.000Z')
const CLOCK_WALK_TIMEOUT_MS = 30_000

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('expo-router', () => {
  const R = require('react')
  return {
    router: { push: jest.fn(), back: jest.fn() },
    useLocalSearchParams: () => ({ id: 'o1' }),
    useFocusEffect: (cb: () => void) => R.useEffect(cb, [cb]),
    useIsFocused: () => true,
  }
})
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
// The disc's endless wave and bubbles would run through every fake-clock walk below; it has its own test (dsLiquidDisc). The stamp over it is the screen's.
jest.mock('../components/ds/LiquidDisc', () => ({ LiquidDisc: ({ stamp }: { stamp?: React.ReactNode }) => stamp ?? null }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { queuedRequest: jest.fn() } }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }), currentUserId: () => 'u1' }))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))

/* eslint-disable import/first */
import OfferScreen from '../app/offer/[id]'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'
import { apiClient } from '../lib/apiClient'
import { H } from '../lib/haptics'
import { noteServerDate } from '../lib/serverClock'
import { showSheet, type ActionSheet, type ReasonSheet } from '../lib/sheet'
/* eslint-enable import/first */

/**
 * The offer screen (step 12; Flow 13 · 13.2): the pass is live and is the
 * server's code; it asks again before the code turns and shows "Redeemed" when
 * the server says so; "Not now" sends nothing (RG-I02).
 */
const request = apiClient.queuedRequest as jest.Mock
const offer = (state: string, pass: unknown, extra: Record<string, unknown> = {}) => ({
  success: true,
  data: {
    offer: {
      id: 'o1',
      venue: { id: 'v1', name: 'The Humming Tree' },
      text: 'First drink on the house',
      sentAt: '2026-10-11T12:00:00.000Z',
      endsAt: '2026-10-18T12:00:00.000Z',
      state,
      pass,
      ...extra,
    },
  },
})
const LIVE = offer('live', { code: 'K7Q4M2', rotatesAt: '2026-10-11T20:00:30.000Z' })
let reads: unknown[] = []
let regular: Record<string, unknown> = { known: false, offersMuted: false, ownerName: 'Indiranagar Hospitality', regulars: { active: true } }

beforeEach(async () => {
  jest.useFakeTimers({ now: NOW })
  mockToast.mockClear()
  // The phone agrees with the server unless a test says otherwise.
  noteServerDate(new Date(NOW).toUTCString(), NOW)
  ;(showSheet as jest.Mock).mockClear()
  ;(router.push as jest.Mock).mockClear()
  await AsyncStorage.clear()
  reads = [LIVE]
  regular = { known: false, offersMuted: false, ownerName: 'Indiranagar Hospitality', regulars: { active: true } }
  request.mockReset()
  request.mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith('/regular') && init?.method === 'PUT') {
      regular = { ...regular, ...JSON.parse(String(init.body)) }
      return Promise.resolve({ success: true, data: regular })
    }
    if (url.endsWith('/regular')) return Promise.resolve({ success: true, data: regular })
    if (url.endsWith('/report')) return Promise.resolve({ success: true, data: { reported: true } })
    if (init?.method) return Promise.resolve({ success: false })
    return Promise.resolve(reads.length > 1 ? reads.shift() : reads[0])
  })
})
afterEach(() => jest.useRealTimers())

/** The clock a second at a time, each answer landing (and its effects running) before the next, as on a phone. */
async function seconds(n: number) {
  for (let i = 0; i < n; i++) await act(async () => { await jest.advanceTimersByTimeAsync(1_000) })
}

async function mount() {
  await render(<OfferScreen />)
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
}
const puts = () => request.mock.calls.filter(([, init]) => init?.method === 'PUT')
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const trayOf = () => (showSheet as jest.Mock).mock.calls.at(-1)![0] as ActionSheet

describe('the live pass', () => {
  it('shows the server’s code, and turns to "Redeemed" when the server says so', async () => {
    await mount()
    expect(screen.getByText('K7Q 4M2')).toBeTruthy()
    expect(screen.getByLabelText('Door code K 7 Q, 4 M 2')).toBeTruthy()
    expect(screen.getByLabelText(/^Door pass for The Humming Tree\. First drink on the house\. Valid until /)).toBeTruthy()
    expect(screen.getByText('Show this at the door. Staff type the code and tap Redeemed.')).toBeTruthy()
    reads = [offer('redeemed', null)]
    // The code turns at :30; the screen asks a second before.
    await act(async () => { jest.advanceTimersByTime(10_000) })
    expect(screen.getByText('Redeemed. Enjoy it.')).toBeTruthy()
    expect(screen.getByLabelText('Redeemed')).toBeTruthy()
    expect(screen.queryByText('K7Q 4M2')).toBeNull()
    // The first-time note about the code is spent by the redeem.
    expect(await AsyncStorage.getItem('door_pass_seen_u1')).toBe('1')
  })

  it('the success haptic plays once, on the render the server’s "redeemed" arrives in: the one that starts the liquid and the stamp', async () => {
    const success = jest.spyOn(H, 'success').mockImplementation(() => {})
    await mount()
    expect(success).not.toHaveBeenCalled()
    reads = [offer('redeemed', null)]
    await act(async () => { jest.advanceTimersByTime(10_000) })
    expect(screen.getByLabelText('Redeemed')).toBeTruthy()
    expect(success).toHaveBeenCalledTimes(1)
    await act(async () => { jest.advanceTimersByTime(20_000) })
    expect(success).toHaveBeenCalledTimes(1)
    success.mockRestore()
  })

  it('hides a code past its turn when no fresh one came (L2), and says it needs a connection', async () => {
    await mount()
    expect(screen.getByText('K7Q 4M2')).toBeTruthy()
    // The refresh fails: the server cannot be reached.
    request.mockImplementation(() => Promise.resolve({ success: false, error: 'offline' }))
    await act(async () => { jest.advanceTimersByTime(22_000) })
    expect(screen.queryByText('K7Q 4M2')).toBeNull()
    expect(screen.getByText('This pass needs a connection to show its code.')).toBeTruthy()
    expect(screen.getByLabelText(/^Door code unavailable/)).toBeTruthy()
  })

  /*
   * Found driving it on the simulator (2026-10-11): the ask a second before the
   * turn is answered with the code that is still current — same code, same
   * rotatesAt — and nothing asked again, so the pass sat on "Getting a fresh
   * code…" for as long as the screen was open.
   */
  it('keeps asking until the code has turned, when the ask before the turn returns the same code', async () => {
    const fresh = offer('live', { code: 'P3W8R5', rotatesAt: '2026-10-11T20:01:00.000Z' })
    const current = LIVE
    // The open, then the ask a second before the turn (still the current step), then the turned code.
    reads = [current, current, fresh]
    await mount()
    await seconds(25)
    expect(screen.getByText('P3W 8R5')).toBeTruthy()
    expect(screen.queryByText('Getting a fresh code…')).toBeNull()
  }, CLOCK_WALK_TIMEOUT_MS)

  it('while a fresh code is on its way (the last ask did not fail) it says so, not "needs a connection"', async () => {
    // The ask is answered with the same, now stale, code: nothing failed, the turn has simply not landed.
    reads = [LIVE]
    await mount()
    await seconds(33)
    expect(screen.queryByText('K7Q 4M2')).toBeNull()
    expect(screen.getByText('Getting a fresh code…')).toBeTruthy()
    expect(screen.queryByText('This pass needs a connection to show its code.')).toBeNull()
  }, CLOCK_WALK_TIMEOUT_MS)

  it('a refresh that failed is tried again, and the pass comes back when the server does', async () => {
    await mount()
    request.mockImplementation(() => Promise.resolve({ success: false, error: 'offline' }))
    await seconds(22)
    expect(screen.getByText('This pass needs a connection to show its code.')).toBeTruthy()
    request.mockImplementation(() => Promise.resolve(offer('live', { code: 'P3W8R5', rotatesAt: '2026-10-11T20:01:00.000Z' })))
    await seconds(3)
    expect(screen.getByText('P3W 8R5')).toBeTruthy()
    expect(screen.queryByText('This pass needs a connection to show its code.')).toBeNull()
  }, CLOCK_WALK_TIMEOUT_MS)

  it('the ring counts down to the server’s turn: with the phone’s clock agreeing, 20 s of the 30 are left', async () => {
    await mount()
    expect(screen.getByText('20 s', { includeHiddenElements: true })).toBeTruthy()
  })

  it('and on the server’s clock, not the phone’s: a phone 10 s behind the server shows 10 s, not 20', async () => {
    // The server says it is 20:00:20 while this phone says 20:00:10; the code turns at 20:00:30 server time.
    noteServerDate(new Date(NOW + 10_000).toUTCString(), NOW)
    await mount()
    expect(screen.getByText('10 s', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByText('20 s', { includeHiddenElements: true })).toBeNull()
  })
})

describe('the other faces of the pass', () => {
  it('redeemed: the stamp carries the time the server gave, and the code is gone', async () => {
    reads = [offer('redeemed', null, { redeemedAt: '2026-10-11T19:43:00.000Z' })]
    await mount()
    expect(screen.getByLabelText(/^Redeemed \d{1,2}:\d{2}/)).toBeTruthy()
    expect(screen.getByText('Redeemed. Enjoy it.')).toBeTruthy()
    expect(screen.getByText('· · ·')).toBeTruthy()
  })

  it('used tonight: still, stamped, and the server’s own sentence', async () => {
    reads = [offer('used_tonight', null)]
    await mount()
    expect(screen.getByLabelText('Used tonight')).toBeTruthy()
    expect(screen.getByText(/You’ve used a pass at The Humming Tree tonight — one a night/)).toBeTruthy()
    expect(screen.queryByText('K7Q 4M2')).toBeNull()
  })

  it('ended: names the day, dashes for the code', async () => {
    reads = [offer('ended', null)]
    await mount()
    expect(screen.getByText(/^ENDED [A-Z]+$/)).toBeTruthy()
    expect(screen.getByText('This offer has ended.')).toBeTruthy()
    expect(screen.getByText('— — —')).toBeTruthy()
  })
})

describe('before the offer is known', () => {
  it('loading: a ticket-shaped placeholder', async () => {
    request.mockImplementation(() => new Promise(() => {}))
    await render(<OfferScreen />)
    expect(screen.getByLabelText('Loading the offer')).toBeTruthy()
  })

  it('didn’t load: the server’s words if it gave any, and Try again asks again', async () => {
    request.mockImplementation(() => Promise.resolve({ success: false, error: 'Too many requests. Wait a moment.' }))
    await mount()
    expect(screen.getByText('This offer didn’t load')).toBeTruthy()
    expect(screen.getByText('Too many requests. Wait a moment.')).toBeTruthy()
    request.mockImplementation((url: string) => Promise.resolve(url.endsWith('/regular') ? { success: true, data: regular } : LIVE))
    await act(async () => { fireEvent.press(button('Try again')) })
    await act(async () => { await Promise.resolve() })
    expect(screen.getByText('K7Q 4M2')).toBeTruthy()
    expect(screen.queryByText('This offer didn’t load')).toBeNull()
  })

  it('no words from the server: check your connection', async () => {
    request.mockImplementation(() => Promise.reject(new Error('offline')))
    await mount()
    expect(screen.getByText('Check your connection and try again.')).toBeTruthy()
  })

  it('not yours to open: nothing to retry, a way back', async () => {
    request.mockImplementation(() => Promise.resolve({ success: false, errorCode: 'NOT_FOUND', error: 'Offer not found' }))
    await mount()
    expect(screen.getByText('This offer isn’t yours to open')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    await act(async () => { fireEvent.press(button('Go back')) })
    expect(router.back).toHaveBeenCalled()
  })
})

describe('the regulars feature is deferred: nothing shows unless the server says it is live', () => {
  it.each([
    ['no flag', undefined],
    ['regulars: {}', {}],
    ['active: false', { active: false }],
  ])('%s: no prompt, no Turn off — the pass is unaffected', async (_name, flag) => {
    regular = { known: false, offersMuted: false, ownerName: 'Indiranagar Hospitality', ...(flag ? { regulars: flag } : {}) }
    await mount()
    expect(screen.queryByTestId('regular-ask')).toBeNull()
    expect(screen.getByText('K7Q 4M2')).toBeTruthy()
    regular = { ...regular, known: true }
    await mount()
    expect(screen.queryByTestId('regular-on')).toBeNull()
  })

  it('active: true shows the prompt, a radius-24 card (13.4)', async () => {
    await mount()
    expect(StyleSheet.flatten(screen.getByTestId('regular-ask').props.style).borderRadius).toBe(24)
  })

  it('active: true and already known shows Turn off', async () => {
    regular = { ...regular, known: true }
    await mount()
    expect(screen.getByTestId('regular-on')).toBeTruthy()
  })
})

describe('"Let them know I’m a regular"', () => {
  it('"Not now" sends nothing, and the card goes', async () => {
    await mount()
    await act(async () => { fireEvent.press(button('Not now')) })
    expect(puts()).toHaveLength(0)
    expect(screen.queryByText(/^Let The Humming Tree know/)).toBeNull()
  })

  it('"Not now" is remembered for the place (L9)', async () => {
    await mount()
    await act(async () => { fireEvent.press(button('Not now')) })
    expect(await AsyncStorage.getItem('blendn.offers.maybeLater.v1')).toBe('1')
  })

  it('a place someone already said "Not now" to does not ask again (L9)', async () => {
    await AsyncStorage.setItem('blendn.offers.maybeLater.v1', '1')
    await mount()
    expect(screen.getByText('K7Q 4M2')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Not now' })).toBeNull()
  })

  it('a yes is one explicit PUT, and the card becomes "knows you’re a regular"', async () => {
    await mount()
    await act(async () => { fireEvent.press(button('Let The Humming Tree know')) })
    expect(puts()).toEqual([['/api/mobile/venues/v1/regular', { method: 'PUT', body: '{"known":true}' }, true, 2]])
    expect(screen.getByText('The Humming Tree knows you’re a regular')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Not now' })).toBeNull()
  })

  it('names who would see a yes (M2), and what they would not', async () => {
    await mount()
    expect(screen.getByText(/Indiranagar Hospitality, who runs The Humming Tree on Blendn, will see that a regular was here/)).toBeTruthy()
    expect(screen.queryByText(/first name/i)).toBeNull()
    expect(screen.getByText('who you are, your chats, who you met, or anywhere else you go')).toBeTruthy()
    expect(screen.getByText('The Humming Tree will see')).toBeTruthy()
    expect(screen.getByText('The Humming Tree won’t see')).toBeTruthy()
    expect(screen.queryByText(/photo/i)).toBeNull()
  })

  it('Turn off is one PUT with known: false, no confirmation, and the card does not come straight back', async () => {
    regular = { ...regular, known: true }
    await mount()
    await act(async () => { fireEvent.press(button(/^Turn off/)) })
    expect(puts()).toEqual([['/api/mobile/venues/v1/regular', { method: 'PUT', body: '{"known":false}' }, true, 2]])
    expect(screen.getByText(/^Done — The Humming Tree no longer sees you as a regular/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Not now' })).toBeNull()
  })

  it('a refused change is a toast in the server’s words and changes nothing on screen', async () => {
    await mount()
    request.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === 'PUT' ? Promise.resolve({ success: false, error: 'Add your date of birth first.' }) : Promise.resolve({ success: true, data: regular })
    )
    await act(async () => { fireEvent.press(button('Let The Humming Tree know')) })
    expect(mockToast).toHaveBeenCalledWith('Add your date of birth first.', 'error', { haptic: 'error' })
    expect(screen.getByText(/^Let The Humming Tree know you’re a regular/)).toBeTruthy()
  })
})

describe('under the ⋯', () => {
  const more = async () => {
    await mount()
    await act(async () => { fireEvent.press(button('The Humming Tree’s offer, more')) })
    return trayOf()
  }

  it('Report, Stop offers from the place, Cancel — as rows', async () => {
    const tray = await more()
    expect(tray.layout).toBe('rows')
    expect(tray.actions.map((a) => a.label)).toEqual(['Report this offer', 'Stop offers from The Humming Tree', 'Cancel'])
  })

  it('"Stop offers" mutes the place (M6): one PUT with offersMuted, and the row is gone next time', async () => {
    const tray = await more()
    await act(async () => { ;(tray.actions[1] as { then: () => void }).then() })
    expect(puts()).toEqual([['/api/mobile/venues/v1/regular', { method: 'PUT', body: '{"offersMuted":true}' }, true, 2]])
    expect(mockToast).toHaveBeenCalledWith('No more offers from The Humming Tree. Turn them back on from its page.', 'success')
    await act(async () => { fireEvent.press(button('The Humming Tree’s offer, more')) })
    expect(trayOf().actions.map((a) => a.label)).toEqual(['Report this offer', 'Cancel'])
  })

  it('"Report this offer" asks for a reason, then Send report posts it (M5)', async () => {
    const tray = await more()
    const step = (tray.actions[0] as { next: () => ReasonSheet }).next()
    expect(step.kind).toBe('reasons')
    expect(step.reasons.map((r) => r.label)).toEqual(['Offensive', 'Misleading', 'Spam', 'Feels unsafe', 'Something else'])
    expect(step.submitLabel).toBe('Send report')
    const outcome = await step.run('misleading')
    expect(request).toHaveBeenCalledWith('/api/mobile/offers/o1/report', { method: 'POST', body: '{"reason":"misleading"}' }, true, 2)
    expect(outcome).toEqual({ ok: true, toast: 'Reported. Thanks — we look at every report.' })
  })

  it('a note on "Something else" rides along; a report already pending is the server’s sentence', async () => {
    const tray = await more()
    const step = (tray.actions[0] as { next: () => ReasonSheet }).next()
    await step.run('other', 'It names someone.')
    expect(request).toHaveBeenCalledWith('/api/mobile/offers/o1/report', { method: 'POST', body: '{"reason":"other","description":"It names someone."}' }, true, 2)
    request.mockImplementation(() => Promise.resolve({ success: false, error: 'You’ve already reported this offer. We’re looking at it.' }))
    expect(await step.run('spam')).toEqual({ ok: false, error: 'You’ve already reported this offer. We’re looking at it.' })
  })

  it('there is no ⋯ until there is an offer', async () => {
    request.mockImplementation(() => new Promise(() => {}))
    await render(<OfferScreen />)
    expect(screen.queryByRole('button', { name: /more$/ })).toBeNull()
  })
})

it('"See {place}" opens the place', async () => {
  await mount()
  await act(async () => { fireEvent.press(button('See The Humming Tree')) })
  expect(router.push).toHaveBeenCalledWith('/venue/v1')
})
