/**
 * Tapping the tab you are already on scrolls its list to the top.
 *
 * `useScrollToTop` listens for `tabPress` on the tab navigator. The bar is
 * custom (`BlendnTabBar`), so the event only fires if the bar emits it — for a
 * focused tab too, where it then does not navigate. This renders the real tab
 * layout and bar over stub screens, so a bar that stops emitting, or emits only
 * when switching tabs, fails here rather than on a phone.
 *
 * The four real screens are pinned by source: each calls `useScrollToTop` on
 * the ref its list carries.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import React from 'react'
import { View } from 'react-native'
import { act, cleanup, fireEvent, renderRouter, screen } from 'expo-router/testing-library'
import { useScrollToTop } from 'expo-router'

jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getCurrentUser: jest.fn(async () => null),
    getProfile: jest.fn(async () => ({ success: false })),
    getActiveCheckins: jest.fn(async () => ({ success: true, data: { checkIns: [] } })),
  },
}))
jest.mock('../lib/checkIn', () => ({ subscribeCheckInChanged: () => () => {} }))
jest.mock('../components/blendn/BlendnScreen', () => ({ BlendnScreen: () => null }))

/*
 * `expo-router/testing-library` swaps in Reanimated's old mock, which lacks
 * `cubicBezier` (ScalePress, in the bar). Fill the gaps from the real module,
 * which runs under jest here (jest.setup.js mocks worklets).
 */
{
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mocked = require('react-native-reanimated')
  const actual = jest.requireActual('react-native-reanimated')
  for (const k of Object.keys(actual)) if (!(k in mocked)) mocked[k] = actual[k]
}

const mockScrolls: Record<string, jest.Mock> = {}

function stubTab(name: string) {
  return function StubTab() {
    mockScrolls[name] = mockScrolls[name] ?? jest.fn()
    // What `getScrollableNode` accepts from a FlatList's ref.
    const ref = React.useRef({ scrollToOffset: mockScrolls[name] })
    useScrollToTop(ref as never)
    return <View />
  }
}

async function renderTabs() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const TabLayout = require('../app/(tabs)/_layout').default
  // Awaited for the render, but the helpers (`getPathname`) live on the returned object.
  const r = renderRouter(
    {
      '(tabs)/_layout': TabLayout,
      '(tabs)/events': stubTab('events'),
      '(tabs)/going': stubTab('going'),
      '(tabs)/chat': stubTab('chat'),
      '(tabs)/profile': stubTab('profile'),
    },
    { initialUrl: '/events' }
  )
  await r
  await flush()
  // Not `r` itself: it is a thenable, and returning it from an async function unwraps it.
  return { pathname: () => r.getPathname() }
}

// renderRouter runs on fake timers; `useScrollToTop` scrolls on the next frame.
async function flush() {
  await act(async () => {
    jest.advanceTimersByTime(100)
  })
}

describe('tab bar → scroll to top', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockScrolls)) delete mockScrolls[k]
  })
  // The bar polls the live room on an interval; unmounting clears it.
  afterEach(async () => {
    await cleanup()
    jest.useRealTimers()
  })

  it('scrolls the focused tab to the top when its tab is pressed again', async () => {
    await renderTabs()
    await fireEvent.press(screen.getByLabelText('Pulse'))
    await flush()
    expect(mockScrolls.events).toHaveBeenCalledWith({ offset: 0, animated: true })
  })

  it('switching to another tab does not scroll either list', async () => {
    const r = await renderTabs()
    await fireEvent.press(screen.getByLabelText('Going'))
    await flush()
    expect(r.pathname()).toBe('/going')
    expect(mockScrolls.events).not.toHaveBeenCalled()
    expect(mockScrolls.going).not.toHaveBeenCalled()

    // Now on Going, a second press is the scroll-to-top.
    await fireEvent.press(screen.getByLabelText('Going'))
    await flush()
    expect(mockScrolls.going).toHaveBeenCalledWith({ offset: 0, animated: true })
    expect(mockScrolls.events).not.toHaveBeenCalled()
  })
})

describe('each tab screen wires its list', () => {
  const read = (f: string) => readFileSync(join(__dirname, '..', 'app', '(tabs)', f), 'utf8')

  it.each([
    ['events.tsx', 'listRef', /forwardedRef=\{listRef/],
    ['going.tsx', 'listRef', /<Animated\.FlatList\s+ref=\{listRef\}/],
    ['chat.tsx', 'listRef', /<FlatList\s+ref=\{listRef\}/],
    ['profile.tsx', 'scrollRef', /<ScrollView\s+ref=\{scrollRef\}/],
  ])('%s', (file, ref, attached) => {
    const src = read(file)
    expect(src).toMatch(new RegExp(`useScrollToTop\\(${ref}\\)`))
    expect(src).toMatch(attached)
  })
})
