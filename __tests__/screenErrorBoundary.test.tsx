/**
 * One screen that throws can never wedge the app (RC drive 5): every leaf screen has its own boundary
 * (`rootTextSizeLayout` / `textSizeLayout`, components/TextSizeBoundary), so the crash screen is drawn where the screen
 * was and the navigator stays up. Before, the only boundary was the root's, around the whole stack: one bad screen took
 * the navigator down, "Try again" remounted into the same crash, and the next link showed it again until a relaunch.
 *
 * Negative control: `rootTextSizeLayout` returning `<TextSizeBoundary>{children}</TextSizeBoundary>` without the
 * `ErrorBoundary` fails every test here: the throw has no boundary below the root's (here, none: the test fails on it).
 */
import React from 'react'
import { Text } from 'react-native'
import { act, cleanup, fireEvent, renderRouter, screen } from 'expo-router/testing-library'
import { router, Stack } from 'expo-router'

jest.mock('../lib/sentry', () => ({ ...jest.requireActual('../lib/sentry'), Sentry: { captureException: jest.fn() } }))
jest.mock('../lib/useAuth', () => ({ getCurrentUser: async () => null }))
// The router test harness stubs Reanimated, which has no Reduce Motion hook; the crash screen's buttons read it.
jest.mock('../lib/motion', () => ({ ...jest.requireActual('../lib/motion'), useReducedMotion: () => false }))
jest.mock('../components/onboarding/Backdrop', () => ({ Backdrop: () => null, ORB_LEVEL: { form: 0.6 } }))

/* eslint-disable import/first */
import { rootTextSizeLayout } from '../components/TextSizeBoundary'
import { Sentry } from '../lib/sentry'
/* eslint-enable import/first */

let broken = true
function Broken() {
  if (broken) throw new Error('this screen is broken')
  return <Text>fixed</Text>
}
const Home = () => <Text>home</Text>
const Other = () => <Text>other</Text>
const Layout = () => <Stack screenLayout={rootTextSizeLayout} screenOptions={{ headerShown: false }} />

async function mountApp() {
  const r = renderRouter({ _layout: Layout, index: Home, broken: Broken, other: Other }, { initialUrl: '/' })
  await r
  return { pathname: () => r.getPathname() }
}
const go = async (navigate: () => void) => {
  await act(async () => navigate())
  await act(async () => {
    jest.advanceTimersByTime(500)
  })
}

beforeEach(() => {
  broken = true
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(async () => {
  await cleanup()
  jest.restoreAllMocks()
  jest.useRealTimers()
})

it('a screen that throws shows the crash screen in its place, and says which screen', async () => {
  await mountApp()
  await go(() => router.push('/broken'))

  expect(screen.getByText('Something went wrong')).toBeTruthy()
  expect((Sentry.captureException as jest.Mock).mock.calls[0][1].captureContext.tags.route).toBe('broken')
})

it('the app still goes elsewhere (a link, a push), and comes back', async () => {
  const r = await mountApp()
  await go(() => router.push('/broken'))

  await go(() => router.push('/other'))
  expect(r.pathname()).toBe('/other')
  expect(screen.getByText('other')).toBeTruthy()

  await go(() => router.back())
  expect(r.pathname()).toBe('/broken')
})

it('Try again draws the screen afresh', async () => {
  await mountApp()
  await go(() => router.push('/broken'))
  broken = false

  await go(() => fireEvent.press(screen.getByRole('button', { name: 'Try again' })))

  expect(screen.getByText('fixed')).toBeTruthy()
  expect(screen.queryByText('Something went wrong')).toBeNull()
})

it('Go back leaves it for the screen underneath', async () => {
  const r = await mountApp()
  await go(() => router.push('/broken'))

  await go(() => fireEvent.press(screen.getByRole('button', { name: 'Go back' })))

  expect(r.pathname()).toBe('/')
  expect(screen.getByText('home')).toBeTruthy()
})

it('the first screen has nowhere to go back to, so it offers no Go back', async () => {
  const r = renderRouter({ _layout: Layout, index: Broken }, { initialUrl: '/' })
  await r
  expect(screen.getByText('Something went wrong')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Go back' })).toBeNull()
})
