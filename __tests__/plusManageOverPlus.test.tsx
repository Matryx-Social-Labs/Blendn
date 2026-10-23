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
 *
 * And what a link or a notification tap does while a modal route is up: the modal closes, and the link opens over what
 * presented it (`dismissModals`, lib/pendingRoute). Links are delivered the way iOS delivers them to the running app,
 * through expo-linking's `url` event and `+native-intent`. Negative controls: `redirectSystemPath` returning the path
 * without `dismissModals` fails the two link-over-a-modal tests; `openWhenReady` without it, or pushing without waiting for
 * it, fails the tap test. Popping and returning the path in the same tick (not waiting for the state) failed the first
 * link test: the link was lost.
 *
 * And what a crash report carries (security review): the route's pattern, never its path. Negative controls: the root
 * boundary given `route={pathname}` fails the /f/abc123 test; `scrubReportText` returning its input fails all three.
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
  ...jest.requireActual('../lib/sentry'),
  initSentry: jest.fn(),
  Sentry: { wrap: (c: unknown) => c, captureException: jest.fn(), captureMessage: jest.fn(), addBreadcrumb: jest.fn() },
}))
jest.mock('../lib/onboardingStorage', () => ({ readOnboarding: jest.fn(async () => null) }))
jest.mock('../lib/pushDecline', () => ({ hasDeclinedPush: jest.fn(async () => false) }))
jest.mock('../lib/onboardingAssets', () => ({ ONBOARDING_IMAGES: [], prefetchOnboardingImages: jest.fn() }))
jest.mock('../components/PresenceMonitor', () => ({ PresenceMonitor: () => null }))
jest.mock('../components/LiveAtVenue', () => ({ LiveAtVenue: () => null }))
// Throws on demand: something outside every screen's own boundary, for the root's.
const mockHost = { broken: false }
jest.mock('../components/SheetHost', () => ({
  SheetHost: () => {
    if (mockHost.broken) throw new Error('host failed on /f/abc123')
    return null
  },
}))
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
import { holdLinks, isClosingForLink, openWhenReady, ROOT_MODAL_ROUTES } from '../lib/pendingRoute'
import { scrubEvent, Sentry } from '../lib/sentry'
/* eslint-enable import/first */

/** An incoming link, as iOS delivers it to the running app (expo-router's `subscribe` listens on expo-linking). */
let deliverLink: ((event: { url: string }) => Promise<void> | void) | null = null

const Stub = () => <View />
/** What the intent question's unmount saw: whether a link was closing it (`isClosingForLink`). */
const unmountSaw: boolean[] = []
function IntentQuestion() {
  React.useEffect(() => () => void unmountSaw.push(isClosingForLink()), [])
  return <View />
}
const mockInvite = { broken: false }
function InviteScreen() {
  if (mockInvite.broken) throw new Error('invite failed on /f/abc123')
  return <View />
}
const settle = async () => {
  await act(async () => {
    jest.advanceTimersByTime(1000)
  })
}

type State = { routes: { name: string; state?: unknown }[] } | undefined
/** The root stack: the container wraps it in a route of its own (`__root`). */
const rootStack = (state: State): State => (state?.routes[0]?.name === '__root' ? (state.routes[0].state as State) : state)

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
      settings: Stub,
      'f/[token]': InviteScreen,
      'event-preferences/[eventId]': IntentQuestion,
      '+native-intent': require('../app/+native-intent'),
    },
    { initialUrl: '/events' },
  )
  /* eslint-enable @typescript-eslint/no-require-imports */
  await r
  await settle()
  // Not `r` itself: it is a thenable, and returning it from an async function would unwrap it.
  return { pathname: () => r.getPathname(), routes: () => rootStack(r.getRouterState())?.routes.map((route) => route.name) }
}

describe('Manage over the paywall (RC drive 5)', () => {
  let errors: string[]
  beforeEach(() => {
    errors = []
    deliverLink = null
    mockHost.broken = false
    mockInvite.broken = false
    // The module object itself: an `import * as` would be a copy, and the spy would never reach expo-router.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    jest.spyOn(require('expo-linking'), 'addEventListener').mockImplementation(((_type: string, listener: (event: { url: string }) => void) => {
      deliverLink = listener
      return { remove: () => {} }
    }) as never)
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

  describe('a link or a tap while a modal route is up (RC drive 5): the modal closes, the link opens over its presenter', () => {
    const link = async (path: string) => {
      // Not awaited inside act: the link waits for the pop to land in the state, which act holds back until it returns.
      await act(async () => {
        void deliverLink?.({ url: `blendn://${path}` })
      })
      await settle()
    }

    it('a link to Manage with the paywall up: the paywall closes, Manage opens over the tabs', async () => {
      const r = await mountApp()
      await act(async () => router.push('/plus'))
      await settle()
      expect(r.routes()).toEqual(['(tabs)/events', 'plus'])

      await link('/plus-manage')

      expect(r.routes()).toEqual(['(tabs)/events', 'plus-manage'])
      expect(r.pathname()).toBe('/plus-manage')
      expect(screen.getByTestId('plus-manage-status')).toBeTruthy()
    })

    it('what the modal was presented over stays: only the modal and what is above it close', async () => {
      const r = await mountApp()
      await act(async () => router.push('/settings'))
      await act(async () => router.push('/plus'))
      await settle()
      await act(async () => router.push('/plus-manage'))
      await settle()
      expect(r.routes()).toEqual(['(tabs)/events', 'settings', 'plus', 'plus-manage'])

      await link('/profile')

      // Settings presented the paywall: it stays, and the link opens over it (drive 5's next link was this one).
      expect(r.routes()).toEqual(['(tabs)/events', 'settings', '(tabs)/profile'])
      expect(r.pathname()).toBe('/profile')
    })

    it('the intent question closed for a link knows it was a link, while it unmounts (review MED-2)', async () => {
      unmountSaw.length = 0
      await mountApp()
      await act(async () => router.push('/event-preferences/e1?askIntent=1'))
      await settle()

      await link('/profile')

      expect(unmountSaw).toEqual([true])
      expect(isClosingForLink()).toBe(false)
    })

    it('a link held by the paywall (a purchase in flight) waits, then closes it and goes once released', async () => {
      const r = await mountApp()
      await act(async () => router.push('/plus'))
      await settle()
      const release = holdLinks()

      await link('/plus-manage')
      expect(r.routes()).toEqual(['(tabs)/events', 'plus'])

      await act(async () => release())
      await settle()
      expect(r.routes()).toEqual(['(tabs)/events', 'plus-manage'])
    })

    it('with nothing modal up, a link closes nothing', async () => {
      const r = await mountApp()
      await act(async () => router.push('/settings'))
      await settle()

      await link('/plus-manage')

      expect(r.routes()).toEqual(['(tabs)/events', 'settings', 'plus-manage'])
    })

    it('a notification tap (openWhenReady) closes the modal the same way', async () => {
      const r = await mountApp()
      await act(async () => router.push('/plus'))
      await settle()

      // What the state held when the push was made: it waits for the paywall to have left, as a link does.
      let atPush: string[] | undefined
      const push = router.push
      jest.spyOn(router, 'push').mockImplementation((...args) => {
        atPush = r.routes()
        return push(...args)
      })
      await act(async () => openWhenReady('/plus-manage'))
      await settle()

      expect(atPush).toEqual(['(tabs)/events'])
      expect(r.routes()).toEqual(['(tabs)/events', 'plus-manage'])
    })
  })

  it('ROOT_MODAL_ROUTES is every root route with a modal presentation in app/_layout.tsx', () => {
    const layout = readFileSync(join(__dirname, '..', 'app', '_layout.tsx'), 'utf8')
    const modal = layout
      .split('<Stack.Screen')
      .slice(1)
      .map((block) => block.slice(0, block.indexOf('/>')))
      .filter((block) => /presentation:\s*'(modal|fullScreenModal|transparentModal|containedModal|containedTransparentModal|formSheet|pageSheet)'/.test(block))
      .map((block) => /name="([^"]+)"/.exec(block)?.[1])
    expect([...ROOT_MODAL_ROUTES].sort()).toEqual(modal.sort())
  })

  describe('a crash report names the route, never the path (security review: a path carries invite tokens and ids)', () => {
    /** What leaves for Sentry: the event built from the exception and its context, through the app's `beforeSend`. */
    const sent = () =>
      (Sentry.captureException as jest.Mock).mock.calls.map(([error, context]) =>
        JSON.stringify(scrubEvent({ exception: { values: [{ type: error.name, value: error.message }] }, ...context })),
      )
    const logged = () => errors.filter((line) => line.startsWith('[error-boundary]'))

    it('the root boundary on /f/abc123 reports /f/[token], and abc123 is nowhere in it', async () => {
      await mountApp()
      mockHost.broken = true
      await act(async () => router.push('/f/abc123'))
      await settle()

      // The harness remounts the root after the navigator goes down, into the still-broken host: a second report, from
      // wherever it landed. What matters is what each one carries.
      expect((Sentry.captureException as jest.Mock).mock.calls[0][1].tags.route).toBe('/f/[token]')
      expect(sent().join()).not.toContain('abc123')
      expect(logged().length).toBeGreaterThan(0)
      expect(logged().join()).not.toContain('abc123')
    })

    it("a screen's own boundary reports its route's name, f/[token]", async () => {
      await mountApp()
      mockInvite.broken = true
      await act(async () => router.push('/f/abc123'))
      await settle()

      expect((Sentry.captureException as jest.Mock).mock.calls[0][1].tags.route).toBe('f/[token]')
      expect(sent().join()).not.toContain('abc123')
      expect(logged().join()).not.toContain('abc123')
    })

    it('scrubs an exception message, an event message and a request URL on the way out', () => {
      const id = '0b8e6c1e-3d2a-4f7b-9c1d-2a3b4c5d6e7f'
      const out = scrubEvent({
        message: `room ${id}`,
        request: { url: `https://x/api/mobile/events/${id}/board` },
        exception: { values: [{ value: `no conversation ${id} for /f/tok_9Z?x=1` }] },
      })
      expect(JSON.stringify(out)).not.toMatch(new RegExp(`${id}|tok_9Z`))
      expect(out.exception?.values?.[0].value).toBe('no conversation :id for /f/:token?x=:redacted')
    })
  })
})
