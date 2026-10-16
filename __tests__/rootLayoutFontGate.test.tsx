/**
 * No route renders until the fonts are in (`app/_layout.tsx`).
 *
 * SCRUM-619: cold-started by a link (`https://www.blendn.app/event/<id>`), the
 * event screen mounted on the first render, under the splash and before
 * Plus Jakarta Sans had registered. Its texts were measured in the system
 * font, and React Native's text-measure cache keys on the family *name*, not
 * the font it resolved to. So every later "Blend'n" in that style got the same
 * narrow box for the life of the process and drew clipped: "Blend'r",
 * "I'm goi…". A plain launch was fine only because `/` shows a logo, no text,
 * until auth resolves, and fonts are in long before that.
 *
 * Rendered for real over stub screens; the fonts and the auth hook are the
 * inputs, and whether the linked screen has mounted is what is asserted.
 */
import React from 'react'
import { Text, View } from 'react-native'
import { act, cleanup, renderRouter, screen } from 'expo-router/testing-library'
import { resetPendingRoute, takePendingRoute } from '../lib/pendingRoute'

type FontsResult = [boolean, Error | null]
const mockAuth: { current: Record<string, unknown> } = { current: {} }
const mockFonts: { current: FontsResult } = { current: [false, null] }
const mockRerenders = new Set<() => void>()

/** A hook that returns `read()` and re-renders when the test says so. */
function mockHook<T>(read: () => T) {
  return () => {
    const R = jest.requireActual('react')
    const [, rerender] = R.useReducer((n: number) => n + 1, 0)
    R.useEffect(() => {
      mockRerenders.add(rerender)
      return () => {
        mockRerenders.delete(rerender)
      }
    }, [])
    return read()
  }
}

jest.mock('../lib/useAuth', () => ({
  useAuth: mockHook(() => mockAuth.current),
  getCurrentUser: () => null,
}))
jest.mock('expo-font', () => ({ useFonts: mockHook(() => mockFonts.current) }))
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

const Stub = () => <View />
const EventScreen = () => <Text testID="event-screen">Blend&apos;n</Text>

async function settle() {
  // Past `replaceIfNeeded`'s 200 ms navigation guard.
  await act(async () => {
    jest.advanceTimersByTime(300)
  })
}

async function fontsArrive(result: FontsResult) {
  mockFonts.current = result
  await act(async () => {
    mockRerenders.forEach((rerender) => rerender())
  })
  await settle()
}

async function coldStartByLink(auth: Record<string, unknown>) {
  mockAuth.current = auth
  mockFonts.current = [false, null]
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RootLayout = require('../app/_layout').default
  const r = renderRouter(
    {
      _layout: RootLayout,
      index: Stub,
      'sign-in': Stub,
      '(tabs)/events': Stub,
      'event/[id]': EventScreen,
    },
    { initialUrl: EVENT_LINK }
  )
  await r
  await settle()
  // Not `r` itself: it is a thenable, and returning it from an async function unwraps it.
  return { pathname: () => r.getPathname() }
}

describe('cold start by a link, fonts still loading (SCRUM-619)', () => {
  beforeEach(() => {
    resetPendingRoute()
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(async () => {
    await cleanup()
    jest.useRealTimers()
  })

  it('does not mount the linked screen before the fonts are in', async () => {
    await coldStartByLink(SIGNED_IN)

    expect(screen.queryByTestId('event-screen')).toBeNull()
  })

  it.each([
    ['load', [true, null] as FontsResult],
    ['fail, which falls back to the system font rather than holding the app', [false, new Error('x')] as FontsResult],
  ])('mounts it, still on the link, once the fonts %s', async (_, result) => {
    const r = await coldStartByLink(SIGNED_IN)

    await fontsArrive(result)

    expect(screen.queryByTestId('event-screen')).not.toBeNull()
    expect(r.pathname()).toBe(EVENT_LINK)
  })

  it('signed out, the link is still held for after sign-in once the fonts are in', async () => {
    // The guard redirects while the layout still renders nothing. Expo Router's
    // own root navigator holds that, and the Stack mounts on it.
    const r = await coldStartByLink(SIGNED_OUT)
    await fontsArrive([true, null])

    expect(r.pathname()).toBe('/')
    expect(takePendingRoute()).toBe(EVENT_LINK)
  })
})
