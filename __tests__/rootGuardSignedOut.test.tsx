/**
 * The root guard (`app/_layout.tsx`) sends a signed-out user to `/` from
 * anywhere they are not allowed to be, including after the app has already
 * sent them there once.
 *
 * SCRUM-616: signed out from Settings with the app still open, then a link —
 * an event's public link (the organiser's QR code) or a friend invite — opened
 * the screen signed out ("Couldn't load this event") instead of the sign-in
 * screen. The sign-out's own redirect to `/` stayed in `lastRedirectRef`, and
 * `replaceIfNeeded` skipped every later redirect to the same target. A cold
 * start was fine because the ref starts empty, so only this test's shape —
 * signed in, sign out, then a link — shows it.
 *
 * Rendered for real over stub screens: the auth hook is the only input, and
 * the pathname plus the held route are what the person would see.
 */
import React from 'react'
import { View } from 'react-native'
import { act, cleanup, renderRouter } from 'expo-router/testing-library'
import { router } from 'expo-router'
import { resetPendingRoute, takePendingRoute } from '../lib/pendingRoute'

const mockAuth: { current: Record<string, unknown> } = { current: {} }
const mockAuthListeners = new Set<() => void>()

jest.mock('../lib/useAuth', () => {
  const R = jest.requireActual('react')
  return {
    useAuth: () => {
      const [, rerender] = R.useReducer((n: number) => n + 1, 0)
      R.useEffect(() => {
        mockAuthListeners.add(rerender)
        return () => {
          mockAuthListeners.delete(rerender)
        }
      }, [])
      return mockAuth.current
    },
    getCurrentUser: () => null,
  }
})
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))
jest.mock('../lib/paywall', () => ({ notePathname: jest.fn() }))
jest.mock('../lib/notifications', () => ({
  initializePushNotifications: jest.fn(async () => {}),
  removePushTokenFromProfile: jest.fn(async () => {}),
  setupNotificationResponseListener: () => ({ remove: () => {} }),
}))
jest.mock('../lib/socketClient', () => ({
  initSocketWithAppState: jest.fn(),
  cleanup: jest.fn(),
  disconnect: jest.fn(),
}))
jest.mock('../lib/sentry', () => ({
  initSentry: jest.fn(),
  Sentry: { wrap: (c: unknown) => c, captureException: jest.fn() },
}))
jest.mock('../lib/onboardingStorage', () => ({ readOnboarding: jest.fn(async () => null) }))
jest.mock('../lib/pushDecline', () => ({ hasDeclinedPush: jest.fn(async () => false) }))
jest.mock('../lib/onboardingAssets', () => ({ ONBOARDING_IMAGES: [], prefetchOnboardingImages: jest.fn() }))
jest.mock('../components/IntroAnimation', () => ({ IntroAnimation: () => null }))
jest.mock('../components/PresenceMonitor', () => ({ PresenceMonitor: () => null }))
jest.mock('../components/LiveAtVenue', () => ({ LiveAtVenue: () => null }))
jest.mock('../components/SheetHost', () => ({ SheetHost: () => null }))
jest.mock('../components/ds/CoachMarkHost', () => ({ CoachMarkHost: () => null }))
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }))
jest.mock('expo-asset', () => ({ Asset: { loadAsync: jest.fn(async () => []) } }))
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => {}),
  hideAsync: jest.fn(async () => {}),
  setOptions: jest.fn(),
}))

const SIGNED_IN = {
  user: { id: 'u1', profile: { onboarded: true } },
  loading: false,
  isNewAccount: false,
  unreachable: false,
}
const SIGNED_OUT = { user: null, loading: false, isNewAccount: false, unreachable: false }

const EVENT_LINK = '/event/7b52a78b-8369-414b-a469-65791f5236f8'
const INVITE_LINK = '/f/abc123'

const Stub = () => <View />

async function settle() {
  // Past `replaceIfNeeded`'s 200 ms navigation guard.
  await act(async () => {
    jest.advanceTimersByTime(300)
  })
}

async function setAuth(next: Record<string, unknown>) {
  mockAuth.current = next
  await act(async () => {
    mockAuthListeners.forEach((rerender) => rerender())
  })
  await settle()
}

async function open(href: string) {
  await act(async () => {
    router.push(href as never)
  })
  await settle()
}

async function renderSignedInOnSettings() {
  mockAuth.current = SIGNED_IN
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RootLayout = require('../app/_layout').default
  const r = renderRouter(
    {
      _layout: RootLayout,
      index: Stub,
      'sign-in': Stub,
      settings: Stub,
      '(tabs)/events': Stub,
      'event/[id]': Stub,
      'f/[token]': Stub,
      'user/[id]': Stub,
    },
    { initialUrl: '/settings' }
  )
  await r
  await settle()
  // Not `r` itself: it is a thenable, and returning it from an async function unwraps it.
  return { pathname: () => r.getPathname() }
}

describe('signed out with the app still open (SCRUM-616)', () => {
  beforeEach(() => {
    resetPendingRoute()
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(async () => {
    await cleanup()
    jest.useRealTimers()
  })

  it('signing out lands on the entry screen', async () => {
    const r = await renderSignedInOnSettings()
    expect(r.pathname()).toBe('/settings')
    await setAuth(SIGNED_OUT)
    expect(r.pathname()).toBe('/')
  })

  it.each([
    ["an event's public link", EVENT_LINK],
    ['a friend invite', INVITE_LINK],
  ])('%s opened next goes to the entry screen and is held for after sign-in', async (_, link) => {
    const r = await renderSignedInOnSettings()
    await setAuth(SIGNED_OUT)
    expect(r.pathname()).toBe('/')

    await open(link)

    expect(r.pathname()).toBe('/')
    expect(takePendingRoute()).toBe(link)
  })

  it('any other signed-in screen opened next goes to the entry screen too', async () => {
    const r = await renderSignedInOnSettings()
    await setAuth(SIGNED_OUT)

    await open('/user/u2')

    expect(r.pathname()).toBe('/')
  })

  it('the same link opened twice is sent back both times', async () => {
    const r = await renderSignedInOnSettings()
    await setAuth(SIGNED_OUT)

    await open(EVENT_LINK)
    expect(r.pathname()).toBe('/')
    await open(EVENT_LINK)
    expect(r.pathname()).toBe('/')
    expect(takePendingRoute()).toBe(EVENT_LINK)
  })

  it('the held link opens once they sign back in', async () => {
    const r = await renderSignedInOnSettings()
    await setAuth(SIGNED_OUT)
    await open(EVENT_LINK)
    expect(r.pathname()).toBe('/')

    await setAuth(SIGNED_IN)

    expect(r.pathname()).toBe(EVENT_LINK)
  })
})

describe('the socket follows who is signed in, not which object they are', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const socket = require('../lib/socketClient') as {
    initSocketWithAppState: jest.Mock
    cleanup: jest.Mock
    disconnect: jest.Mock
  }

  beforeEach(() => {
    resetPendingRoute()
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    socket.initSocketWithAppState.mockClear()
    socket.cleanup.mockClear()
    socket.disconnect.mockClear()
  })
  afterEach(async () => {
    await cleanup()
    jest.useRealTimers()
  })

  it('a refreshed profile (a new user object, same id) does not tear the connection down', async () => {
    // refreshAuthUser() after a photo or profile edit hands over a new object.
    // Keyed on the object, that reconnected and dropped every subscription
    // (the bell's among them) over an edit that changed nothing about who is here.
    await renderSignedInOnSettings()
    expect(socket.initSocketWithAppState).toHaveBeenCalledTimes(1)

    await setAuth({ ...SIGNED_IN, user: { ...SIGNED_IN.user, profile: { onboarded: true, photo: 'new.jpg' } } })

    expect(socket.cleanup).not.toHaveBeenCalled()
    expect(socket.initSocketWithAppState).toHaveBeenCalledTimes(1)
  })

  it('signing out disconnects, and a different account reconnects', async () => {
    await renderSignedInOnSettings()

    await setAuth(SIGNED_OUT)
    expect(socket.disconnect).toHaveBeenCalled()
    expect(socket.cleanup).toHaveBeenCalledTimes(1)

    socket.initSocketWithAppState.mockClear()
    await setAuth({ ...SIGNED_IN, user: { ...SIGNED_IN.user, id: 'u2' } })
    expect(socket.initSocketWithAppState).toHaveBeenCalledTimes(1)
  })
})
