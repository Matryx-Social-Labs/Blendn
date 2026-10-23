/**
 * An Android font-size change relaunches the Activity, and the app runs again in the same JS runtime (RC drive 2 D-1):
 * auth is already resolved, so the root guard's redirect fired on the first mount, before the new navigation container
 * was ready, and expo-router threw "Attempted to navigate before mounting the Root Layout component" (2 of 2 drives).
 *
 * Modelled: the root layout mounts signed in on `/` with the container ref not ready yet. Nothing navigates until it says
 * it is, and then the guard does what it always did. A notification tap in between is held, not pushed, though the
 * module's "ready" still says yes from the old tree.
 */
import React from 'react'
import { View } from 'react-native'
import { act, cleanup, renderRouter } from 'expo-router/testing-library'
import { router } from 'expo-router'
import { openWhenReady, resetPendingRoute, setRouteReady } from '../lib/pendingRoute'

/** The container ref as the relaunched root sees it: not ready until the test says so. */
const mockNav = { ready: false, listeners: [] as (() => void)[] }
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useNavigationContainerRef: () => ({
    isReady: () => mockNav.ready,
    addListener: (_event: string, callback: () => void) => {
      mockNav.listeners.push(callback)
      return () => {
        mockNav.listeners = mockNav.listeners.filter((c) => c !== callback)
      }
    },
  }),
}))
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
// The router test harness stubs Reanimated, which has no Reduce Motion hook; the root layout reads it for its transitions.
jest.mock('../lib/motion', () => ({ ...jest.requireActual('../lib/motion'), useReducedMotion: () => false }))
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
const Stub = () => <View />

async function settle() {
  // Past `replaceIfNeeded`'s 200 ms navigation guard, and the onboarding read's microtasks.
  await act(async () => {
    jest.advanceTimersByTime(300)
  })
}

async function relaunch() {
  mockAuth.current = SIGNED_IN
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RootLayout = require('../app/_layout').default
  const r = renderRouter(
    { _layout: RootLayout, index: Stub, 'sign-in': Stub, '(tabs)/events': Stub, 'user/[id]': Stub },
    { initialUrl: '/' },
  )
  await r
  await settle()
  return { pathname: () => r.getPathname() }
}

async function navigatorReady() {
  mockNav.ready = true
  await act(async () => {
    mockNav.listeners.forEach((callback) => callback())
  })
  await settle()
  await settle()
}

describe('the root guard after an Android font-size relaunch (RC drive 2 D-1)', () => {
  let replace: jest.SpyInstance
  let push: jest.SpyInstance
  beforeEach(() => {
    mockNav.ready = false
    mockNav.listeners = []
    resetPendingRoute()
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    replace = jest.spyOn(router, 'replace')
    push = jest.spyOn(router, 'push')
  })
  afterEach(async () => {
    replace.mockRestore()
    push.mockRestore()
    await cleanup()
    jest.useRealTimers()
  })

  it('does not navigate before the navigator is ready, then redirects as before', async () => {
    const r = await relaunch()
    expect(replace).not.toHaveBeenCalled()
    expect(r.pathname()).toBe('/')

    await navigatorReady()

    expect(replace).toHaveBeenCalledWith('/(tabs)/events')
    expect(r.pathname()).toBe('/events')
  })

  it('a tap that arrives before then is held, not pushed, and opens once the guard lands', async () => {
    // The old tree's guard left this set: a module outlives the Activity.
    setRouteReady(true)
    const r = await relaunch()
    openWhenReady('/user/u2' as never)
    expect(push).not.toHaveBeenCalled()

    await navigatorReady()

    expect(r.pathname()).toBe('/user/u2')
  })
})
