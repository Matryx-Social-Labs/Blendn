/**
 * Manage opened over the paywall (RC drive 5, iOS release, an account with Blend'n+): `blendn:///plus`, then
 * `blendn:///plus-manage`, showed the root "Something went wrong", 2 of 2, and nothing short of a relaunch got past it.
 *
 * The error, reproduced here with the real root layout and both real screens: "Maximum update depth exceeded", thrown
 * from expo-router's `Screen` → `navigation.setOptions`. Manage set its own options with `<Stack.Screen options={{
 * headerShown: false }} />`, a new object every render; over a modal the stack re-rendered it on each `setOptions`, and
 * each render set them again. From the tabs it settled, which is why Settings › Blend'n+ worked.
 *
 * Negative controls: the code before the fix (the screen's own `<Stack.Screen options={{ … }} />`, the route not declared
 * in the root layout) fails the first test with the loop and the boundary. The literal alone, with the declaration kept,
 * did not loop here, and fails the second test: no screen sets its options that way.
 */
import React from 'react'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { View } from 'react-native'
import { act, cleanup, renderRouter, screen } from 'expo-router/testing-library'
import { router } from 'expo-router'

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('../lib/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', profile: { onboarded: true } }, loading: false, isNewAccount: false, unreachable: false }),
  getCurrentUser: async () => null,
}))
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getMyPlus: jest.fn(async () => ({ success: true, data: { active: true, gated: true, product: 'plus', source: 'apple', expiresAt: '2026-11-03T12:00:00' } })),
    logPaywallEvent: jest.fn(async () => ({ success: true })),
  },
}))
jest.mock('../lib/purchases', () => ({
  ...jest.requireActual('../lib/purchases'),
  purchasesAvailable: jest.fn(() => true),
  canBuyAs: jest.fn(async () => true),
  loadPlusOffers: jest.fn(async () => []),
}))
// The router test harness stubs Reanimated, which has no Reduce Motion hook; the root layout reads it for its transitions.
jest.mock('../lib/motion', () => ({ ...jest.requireActual('../lib/motion'), useReducedMotion: () => false }))
jest.mock('../lib/notifications', () => ({
  initializePushNotifications: jest.fn(async () => {}),
  removePushTokenFromProfile: jest.fn(async () => {}),
  setupNotificationResponseListener: () => ({ remove: () => {} }),
}))
jest.mock('../lib/socketClient', () => ({ initSocketWithAppState: jest.fn(), cleanup: jest.fn(), disconnect: jest.fn() }))
jest.mock('../lib/sentry', () => ({
  initSentry: jest.fn(),
  Sentry: { wrap: (c: unknown) => c, captureException: jest.fn(), captureMessage: jest.fn(), addBreadcrumb: jest.fn() },
}))
jest.mock('../lib/onboardingStorage', () => ({ readOnboarding: jest.fn(async () => null) }))
jest.mock('../lib/pushDecline', () => ({ hasDeclinedPush: jest.fn(async () => false) }))
jest.mock('../lib/onboardingAssets', () => ({ ONBOARDING_IMAGES: [], prefetchOnboardingImages: jest.fn() }))
jest.mock('../components/PresenceMonitor', () => ({ PresenceMonitor: () => null }))
jest.mock('../components/LiveAtVenue', () => ({ LiveAtVenue: () => null }))
jest.mock('../components/SheetHost', () => ({ SheetHost: () => null }))
jest.mock('../components/ds/CoachMarkHost', () => ({ CoachMarkHost: () => null }))
jest.mock('../components/ds/Orbs', () => ({ Orbs: () => null }))
jest.mock('../components/ds/Loader', () => ({ Spinner: () => null }))
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }))
jest.mock('expo-asset', () => ({ Asset: { loadAsync: jest.fn(async () => []) } }))
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(async () => {}), hideAsync: jest.fn(async () => {}), setOptions: jest.fn() }))
jest.mock('expo-linear-gradient', () => {
  const { View: V } = jest.requireActual('react-native')
  return { LinearGradient: (p: object) => <V {...p} /> }
})

/* eslint-disable import/first */
import { Sentry } from '../lib/sentry'
/* eslint-enable import/first */

const Stub = () => <View />
const settle = async () => {
  await act(async () => {
    jest.advanceTimersByTime(1000)
  })
}

async function mountApp() {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const r = renderRouter(
    {
      _layout: require('../app/_layout').default,
      index: Stub,
      '(tabs)/events': Stub,
      '(tabs)/profile': Stub,
      plus: require('../app/plus').default,
      'plus-manage': require('../app/plus-manage').default,
    },
    { initialUrl: '/events' },
  )
  /* eslint-enable @typescript-eslint/no-require-imports */
  await r
  await settle()
  // Not `r` itself: it is a thenable, and returning it from an async function would unwrap it.
  return { pathname: () => r.getPathname() }
}

describe('Manage over the paywall (RC drive 5)', () => {
  let errors: string[]
  beforeEach(() => {
    errors = []
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation((first: unknown) => {
      errors.push(String(first))
    })
  })
  afterEach(async () => {
    await cleanup()
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  it('opens Manage over /plus: its card, no loop, no boundary', async () => {
    const r = await mountApp()
    await act(async () => router.push('/plus'))
    await settle()
    expect(r.pathname()).toBe('/plus')

    await act(async () => router.push('/plus-manage'))
    await settle()

    expect(r.pathname()).toBe('/plus-manage')
    expect(screen.getByTestId('plus-manage-status')).toBeTruthy()
    expect(screen.queryByText('Something went wrong')).toBeNull()
    expect(errors.join('\n')).not.toMatch(/Maximum update depth/)
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it('no screen sets its own options with an object literal: a route declares them in its layout', () => {
    const app = join(__dirname, '..', 'app')
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) && !/_layout\.tsx$/.test(name) ? [path] : []
      })
    const offenders = files(app).filter((path) => /<Stack\.Screen\b[^>]*options=\{\{/.test(readFileSync(path, 'utf8')))
    expect(offenders.map((path) => relative(app, path))).toEqual([])
  })
})
