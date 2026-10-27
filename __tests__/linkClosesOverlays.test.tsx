/**
 * A link is somewhere new to go (RC drive 6), so it closes what is open over where the person was, not only modal
 * routes: the Blend'n overlay (hosted by the tabs, not a route: a tab link switched the tab under it and the Room stayed
 * on top), every open dismissible DS Sheet (screen-owned and the SheetHost's, through its own close request, so a
 * confirm resolves as cancel). A sheet that must be answered (`dismissible={false}`, the presence ask) stays wanted and
 * is drawn over the target. All through `onClosingForLink` (lib/pendingRoute), told before the link navigates.
 *
 * Driven with the real root layout, the real tab layout and SheetHost, and links delivered the way iOS delivers them to
 * the running app (expo-linking's `url` event, `+native-intent`). The overlay's own screen is a stand-in: its host is
 * what closes it.
 *
 * And the plain Modals (the crew's ⋯ menu here; each kind in its own test file) through `useQueuedModal`'s
 * `closeForLink`.
 *
 * Negative controls: the tab layout without its `onClosingForLink(blendnClosed)` fails the overlay and intent tests;
 * the Sheet without its registration fails the two sheet-closing tests; `dismissModals` telling its listeners only when a
 * modal route is up (as before) fails the overlay and sheet tests.
 */
import React, { useState } from 'react'
import { Text, View } from 'react-native'
import { act, cleanup, renderRouter, screen } from 'expo-router/testing-library'
import { router } from 'expo-router'

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('../lib/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', profile: { onboarded: true } }, loading: false, isNewAccount: false, unreachable: false }),
  getCurrentUser: async () => null,
}))
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getCurrentUser: jest.fn(async () => null),
    getProfile: jest.fn(async () => ({ success: false })),
    getActiveCheckins: jest.fn(async () => ({ success: true, data: { checkIns: [] } })),
  },
}))
// The router test harness stubs Reanimated, which has no Reduce Motion hook; the root layout reads it for its transitions.
jest.mock('../lib/motion', () => ({ ...jest.requireActual('../lib/motion'), useReducedMotion: () => false }))
jest.mock('../lib/notifications', () => ({
  initializePushNotifications: jest.fn(async () => {}),
  removePushTokenFromProfile: jest.fn(async () => {}),
  setupNotificationResponseListener: () => ({ remove: () => {} }),
}))
jest.mock('../lib/socketClient', () => ({ initSocketWithAppState: jest.fn(), cleanup: jest.fn(), disconnect: jest.fn(), subscribeToBell: () => () => {} }))
jest.mock('../lib/sentry', () => ({
  ...jest.requireActual('../lib/sentry'),
  initSentry: jest.fn(),
  Sentry: { wrap: (c: unknown) => c, captureException: jest.fn(), captureMessage: jest.fn(), addBreadcrumb: jest.fn() },
}))
jest.mock('../lib/onboardingStorage', () => ({ readOnboarding: jest.fn(async () => null) }))
jest.mock('../lib/pushDecline', () => ({ hasDeclinedPush: jest.fn(async () => false) }))
jest.mock('../lib/onboardingAssets', () => ({ ONBOARDING_IMAGES: [], prefetchOnboardingImages: jest.fn() }))
jest.mock('../lib/coachMarks', () => ({ useCoachMark: () => ({ visible: false, dismiss: () => {} }), markCoachUsed: () => {} }))
jest.mock('../components/PresenceMonitor', () => ({ PresenceMonitor: () => null }))
jest.mock('../components/LiveAtVenue', () => ({ LiveAtVenue: () => null }))
jest.mock('../components/ds/CoachMarkHost', () => ({ ...jest.requireActual('../components/ds/CoachMarkHost'), CoachMarkHost: () => null }))
jest.mock('../components/ds/Loader', () => ({ Spinner: () => null }))
// The overlay's screen: its host (the tab layout) is what a link closes, so a stand-in is drawn for it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../components/blendn/BlendnScreen', () => ({ BlendnScreen: () => require('react').createElement(require('react-native').View, { testID: 'blendn-overlay' }) }))
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }))
jest.mock('expo-asset', () => ({ Asset: { loadAsync: jest.fn(async () => []) } }))
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(async () => {}), hideAsync: jest.fn(async () => {}), setOptions: jest.fn() }))
jest.mock('expo-linear-gradient', () => {
  const { View: V } = jest.requireActual('react-native')
  return { LinearGradient: (p: object) => <V {...p} /> }
})

/*
 * `expo-router/testing-library` swaps in Reanimated's old mock, which lacks pieces the tab bar and the Sheet use. Fill
 * the gaps from the real module, which runs under jest here (as `tabScrollToTop.test.tsx` does).
 */
{
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mocked = require('react-native-reanimated')
  const actual = jest.requireActual('react-native-reanimated')
  for (const k of Object.keys(actual)) if (!(k in mocked)) mocked[k] = actual[k]
  mocked.makeMutable = actual.makeMutable
}

/* eslint-disable import/first */
import { blendnClosed, isBlendnOpen, openBlendn } from '../lib/blendnOverlay'
import { askIntentRoute, intentAnswered, untilIntentAnswered } from '../lib/checkIn'
import { Sheet } from '../components/ds/Sheet'
import { OverflowMenu } from '../components/crews/OverflowMenu'
import { showSheet } from '../lib/sheet'
import { Sentry } from '../lib/sentry'
/* eslint-enable import/first */

let deliverLink: ((event: { url: string }) => Promise<void> | void) | null = null
const settle = async () => {
  await act(async () => {
    jest.advanceTimersByTime(1000)
  })
}
const link = async (path: string) => {
  // Not awaited inside act: the link waits for any pop to land in the state, which act holds back until it returns.
  await act(async () => {
    void deliverLink?.({ url: `blendn://${path}` })
  })
  await settle()
}

/** What the screen's own sheet saw: `closed` when its close request came. */
const sheetCalls: string[] = []
const mockSheet = { open: false, dismissible: true, menu: false }
function EventsTab() {
  const [open, setOpen] = useState(mockSheet.open)
  const [menu, setMenu] = useState(mockSheet.menu)
  return (
    <View>
      <OverflowMenu
        visible={menu}
        onClose={() => {
          sheetCalls.push('menu closed')
          setMenu(false)
        }}
        items={[{ icon: 'log-out', label: 'Leave crew', onPress: () => sheetCalls.push('left') }]}
        testID="crew-menu"
      />
      <Sheet
        visible={open}
        dismissible={mockSheet.dismissible}
        onClose={() => {
          sheetCalls.push('closed')
          setOpen(false)
        }}
        title="Block someone"
        testID="screen-sheet"
      >
        <Text>{open ? 'sheet-wanted' : 'sheet-let-go'}</Text>
      </Sheet>
    </View>
  )
}
const Stub = () => <View />
/** The intent question as the router sees it: a modal route whose unmount says `closed` (app/event-preferences). */
function IntentQuestion() {
  React.useEffect(() => () => intentAnswered('closed'), [])
  return <View testID="intent-question" />
}

async function mountApp() {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const r = renderRouter(
    {
      _layout: require('../app/_layout').default,
      '(tabs)/_layout': require('../app/(tabs)/_layout').default,
      index: Stub,
      '(tabs)/events': EventsTab,
      '(tabs)/going': Stub,
      '(tabs)/chat': Stub,
      '(tabs)/profile': () => <View testID="profile-tab" />,
      settings: () => <View testID="settings-screen" />,
      'event-preferences/[eventId]': IntentQuestion,
      '+native-intent': require('../app/+native-intent'),
    },
    { initialUrl: '/events' },
  )
  /* eslint-enable @typescript-eslint/no-require-imports */
  await r
  await settle()
  // The real layouts drawn, not a crash screen in their place.
  expect(Sentry.captureException).not.toHaveBeenCalled()
  return { pathname: () => r.getPathname() }
}

beforeEach(() => {
  sheetCalls.length = 0
  mockSheet.open = false
  mockSheet.dismissible = true
  mockSheet.menu = false
  deliverLink = null
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
  // The module object itself: an `import * as` would be a copy, and the spy would never reach expo-router.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  jest.spyOn(require('expo-linking'), 'addEventListener').mockImplementation(((_type: string, listener: (event: { url: string }) => void) => {
    deliverLink = listener
    return { remove: () => {} }
  }) as never)
})
afterEach(async () => {
  blendnClosed()
  await cleanup()
  jest.restoreAllMocks()
  jest.useRealTimers()
})

it('the Room open, then a link to a tab: the overlay closes and the tab is shown', async () => {
  const r = await mountApp()
  await act(async () => openBlendn())
  expect(screen.getByTestId('blendn-overlay')).toBeTruthy()

  await link('/profile')

  expect(isBlendnOpen()).toBe(false)
  expect(screen.queryByTestId('blendn-overlay')).toBeNull()
  expect(r.pathname()).toBe('/profile')
})

it('a screen sheet open, then a link to a stack screen: the sheet closes by its own request, the target is on top', async () => {
  mockSheet.open = true
  const r = await mountApp()
  expect(screen.getByText('sheet-wanted', { includeHiddenElements: true })).toBeTruthy()

  await link('/settings')

  expect(sheetCalls).toEqual(['closed'])
  expect(r.pathname()).toBe('/settings')
})

it("the SheetHost's confirm closed by a link resolves as its cancel", async () => {
  await mountApp()
  const dismissed = jest.fn()
  const confirmed = jest.fn()
  await act(async () =>
    showSheet({ kind: 'actions', title: 'Block Priya?', actions: [{ label: 'Block', variant: 'destructive', then: confirmed }, { label: 'Cancel', cancel: true }], onDismiss: dismissed } as never),
  )

  await link('/settings')

  expect(dismissed).toHaveBeenCalledTimes(1)
  expect(confirmed).not.toHaveBeenCalled()
})

it('a sheet that must be answered (the presence ask) stays wanted, drawn over the link target', async () => {
  mockSheet.open = true
  mockSheet.dismissible = false
  const r = await mountApp()

  await link('/settings')

  expect(sheetCalls).toEqual([])
  expect(r.pathname()).toBe('/settings')
  expect(screen.getByText('sheet-wanted', { includeHiddenElements: true })).toBeTruthy()
})

it('the intent question with a tab as the target: abandoned, and the Room does not open again over the tab', async () => {
  const r = await mountApp()
  // Tonight in the overlay; the hold checks in and the question is asked over it (useCheckInFlow's end, as it is).
  await act(async () => openBlendn())
  let outcome: string | undefined
  await act(async () => {
    void (async () => {
      const answered = untilIntentAnswered()
      router.push(askIntentRoute('e1'))
      outcome = await answered
      if (outcome !== 'abandoned') openBlendn()
    })()
  })
  await settle()

  await link('/profile')

  expect(outcome).toBe('abandoned')
  expect(isBlendnOpen()).toBe(false)
  expect(screen.queryByTestId('blendn-overlay')).toBeNull()
  expect(r.pathname()).toBe('/profile')
})

it("the crew's ⋯ menu open, then a link: the menu closes, nothing on it runs, the target is on top", async () => {
  mockSheet.menu = true
  const r = await mountApp()

  await link('/settings')

  expect(sheetCalls).toEqual(['menu closed'])
  expect(r.pathname()).toBe('/settings')
})

