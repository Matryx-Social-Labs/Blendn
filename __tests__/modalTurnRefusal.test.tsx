/*
 * When iOS refuses a Modal anyway, and the Modals that are not sheets (review of b75ea1f).
 *
 * React Native 0.86 marks a Modal presented before UIKit answers and never asks again, and sends onDismiss only for a
 * real dismissal. So a Modal whose onShow never comes was refused: it must give the screen up (HIGH-1), or every other
 * sheet waits behind it until relaunch. A ⋯ menu's item that opens a sheet must wait for the menu to have gone; the
 * paywall's push must not race a queued sheet (MED-1); a sheet withdrawn while it waited still "leaves" (MED-2).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AppState, Platform } from 'react-native'

import { OverflowMenu } from '../components/crews/OverflowMenu'
import { RouteModal } from '../components/system/RouteModal'
import { Sheet } from '../components/ds/Sheet'
import { holdTurnWhile, holdsTurn, requestTurn, resetModalTurns, retryDelay } from '../lib/modalTurn'
import { afterSheetDismissed, HANDOFF_MS } from '../lib/sheetDismissed'

/** Modals whose onShow iOS never sends (refused): every other Modal says it is shown as it is drawn. */
const mockRefused = new Set<string>()
/** Modals that fade in: onShow comes this long after they are drawn. */
const mockFadeMs = new Map<string, number>()
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = require('react')
  const Base = jest.requireActual('@react-native/jest-preset/jest/mocks/Modal').default
  function Modal(props: { visible?: boolean; onShow?: () => void; testID?: string }) {
    const onShow = React.useRef(props.onShow)
    onShow.current = props.onShow
    const up = props.visible !== false
    React.useEffect(() => {
      if (!up || mockRefused.has(props.testID ?? '')) return
      const fade = mockFadeMs.get(props.testID ?? '')
      if (fade === undefined) return void onShow.current?.()
      const timer = setTimeout(() => onShow.current?.(), fade)
      return () => clearTimeout(timer)
    }, [up, props.testID])
    return React.createElement(Base, props)
  }
  return { __esModule: true, default: Modal }
})
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} />, isGlassEffectAPIAvailable: () => true, isLiquidGlassAvailable: () => true }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
/** The router modal's transitionEnd listeners (its screen sliding away). */
const mockTransitionEnd: (() => void)[] = []
const mockNavigation = {
  addListener: (_event: string, cb: () => void) => {
    mockTransitionEnd.push(cb)
    return () => {}
  },
}
// A router modal is focused while it is mounted here.
jest.mock('expo-router', () => ({
  // A router modal releases the screen on its transitionEnd (components/system/RouteModal).
  useNavigation: () => mockNavigation,
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = require('react')
    useEffect(effect, [effect])
  },
}))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))

const HIDDEN = { includeHiddenElements: true }
const shown = (id: string) => screen.queryByTestId(`${id}-modal`, HIDDEN)?.props.visible === true
const tick = (ms: number) => act(async () => void jest.advanceTimersByTime(ms))
/** Each timer here is set by the render the one before caused. */
const settle = async (steps = 6) => {
  for (let i = 0; i < steps; i++) await tick(1000)
}

beforeEach(() => {
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
  resetModalTurns()
  mockRefused.clear()
  mockFadeMs.clear()
  jest.useFakeTimers()
})
afterEach(() => jest.useRealTimers())

describe('HIGH-1: a Modal iOS refused gives the screen up', () => {
  it('the holder’s onShow never comes: it is taken down, and the next sheet opens', async () => {
    // Arrange: A is "presented", but iOS refused it; B comes due behind it.
    mockRefused.add('a-modal')
    await render(
      <>
        <Sheet visible onClose={() => {}} title="A" testID="a" />
        <Sheet visible onClose={() => {}} title="B" testID="b" />
      </>
    )
    expect(shown('a')).toBe(true)
    expect(shown('b')).toBe(false)

    // Act: past the watchdog.
    await settle(1)

    // Assert: A is drawn off, and B is on screen.
    expect(shown('a')).toBe(false)
    expect(shown('b')).toBe(true)
  })

  it('refused again and again, it is never closed for it: it keeps asking, 0.5 → 1 → 2 s, capped (review MED-B)', async () => {
    expect([1, 2, 3, 4, 9].map(retryDelay)).toEqual([500, 1000, 2000, 2000, 2000])
    mockRefused.add('a-modal')
    const onClose = jest.fn()
    await render(<Sheet visible onClose={onClose} title="A" testID="a" />)
    await settle(12)
    expect(onClose).not.toHaveBeenCalled()
    // Whenever iOS takes it, it is shown.
    mockRefused.clear()
    await settle(4)
    expect(shown('a')).toBe(true)
  })

  it('a native screen (the photo picker) waits for a leaving sheet and holds the screen while it is up', async () => {
    const view = await render(<Sheet visible onClose={() => {}} title="Add a photo" testID="src" />)
    const gone = screen.getByTestId('src-modal', HIDDEN).props.onDismiss
    let pickerOpen = false
    let closePicker: () => void = () => {}
    // The photo source sheet's choice: it has just closed the sheet (`afterClosing`).
    const picked = holdTurnWhile(
      () =>
        new Promise<void>((resolve) => {
          pickerOpen = true
          closePicker = resolve
        }),
      { afterClosing: true }
    )
    await view.rerender(<Sheet visible={false} onClose={() => {}} title="Add a photo" testID="src" />)
    await tick(300)
    expect(pickerOpen).toBe(false)
    await act(async () => gone())
    await act(async () => Promise.resolve())
    expect(pickerOpen).toBe(true)
    // A sheet that comes due while the picker is up waits for it.
    await view.rerender(<Sheet visible onClose={() => {}} title="Checked out" testID="late" />)
    expect(shown('late')).toBe(false)
    await act(async () => closePicker())
    await act(async () => picked)
    await tick(400)
    expect(shown('late')).toBe(true)
  })

  it('refused once while another was leaving, it asks again and is shown', async () => {
    mockRefused.add('a-modal')
    await render(<Sheet visible onClose={() => {}} title="A" testID="a" />)
    await settle(1)
    expect(shown('a')).toBe(false)
    // The obstacle has gone: iOS takes it this time.
    mockRefused.clear()
    await settle(2)
    expect(shown('a')).toBe(true)
  })
})

describe('the other Modals take their turn', () => {
  it('a ⋯ menu item that opens a sheet: the sheet presents only after the menu’s Modal has gone', async () => {
    // The crew screen's ⋯ → "Leave crew": the menu closes, the item opens a sheet at once.
    function Screen() {
      const [menu, setMenu] = React.useState(true)
      const [sheet, setSheet] = React.useState(false)
      return (
        <>
          <OverflowMenu visible={menu} onClose={() => setMenu(false)} items={[{ icon: 'log-out', label: 'Leave crew', onPress: () => setSheet(true) }]} testID="menu" />
          <Sheet visible={sheet} onClose={() => setSheet(false)} title="Leave this crew?" testID="leave" />
        </>
      )
    }
    await render(<Screen />)
    expect(shown('menu')).toBe(true)
    const menuGone = screen.getByTestId('menu-modal', HIDDEN).props.onDismiss

    await act(async () => fireEvent.press(screen.getByLabelText('Leave crew')))
    expect(shown('menu')).toBe(false)
    expect(shown('leave')).toBe(false)

    // iOS says the menu has gone (after its fade).
    await act(async () => menuGone())
    expect(shown('leave')).toBe(true)
  })
})

describe('MED-1: the paywall’s push and a queued sheet never go on one frame', () => {
  it('afterSheetDismissed resolves ahead of a sheet already waiting, and holds the screen until what it opens asks', async () => {
    // Arrange: A is up. B comes due behind it. The paywall's caller closes A and waits.
    const view = await render(
      <>
        <Sheet visible onClose={() => {}} title="A" testID="a" />
        <Sheet visible onClose={() => {}} title="B" testID="b" />
      </>
    )
    const aGone = screen.getByTestId('a-modal', HIDDEN).props.onDismiss
    let resolved = false
    void afterSheetDismissed(10_000).then(() => (resolved = true))
    await view.rerender(
      <>
        <Sheet visible={false} onClose={() => {}} title="A" testID="a" />
        <Sheet visible onClose={() => {}} title="B" testID="b" />
      </>
    )
    await tick(300)

    // Act: A has gone.
    await act(async () => aGone())
    await act(async () => Promise.resolve())

    // Assert: the push may go now, and B is still waiting: not on the same frame.
    expect(resolved).toBe(true)
    expect(shown('b')).toBe(false)

    // The paywall claims the screen on focus (useRouteModalTurn): B waits behind it, not the hand-off.
    const paywall = {}
    await act(async () => requestTurn(paywall, { front: true }))
    expect(holdsTurn(paywall)).toBe(true)
    expect(shown('b')).toBe(false)
  })

  it('if nothing asks after it, the hand-off ends and the waiting sheet opens', async () => {
    await render(<Sheet visible={false} onClose={() => {}} title="B" testID="b" />)
    await afterSheetDismissed()
    await screen.rerender(<Sheet visible onClose={() => {}} title="B" testID="b" />)
    // B asked: the hand-off lets go at once.
    expect(shown('b')).toBe(true)
    await tick(HANDOFF_MS)
    expect(shown('b')).toBe(true)
  })
})

describe('MED-2: a sheet withdrawn while it waited still leaves', () => {
  it('its onDismissed runs, so a chain waiting on it goes on', async () => {
    const onDismissed = jest.fn()
    const both = (b: boolean) => (
      <>
        <Sheet visible onClose={() => {}} title="A" testID="a" />
        <Sheet visible={b} onClose={() => {}} onDismissed={onDismissed} title="B" testID="b" />
      </>
    )
    const view = await render(both(true))
    expect(shown('b')).toBe(false)
    await view.rerender(both(false))
    expect(onDismissed).toHaveBeenCalledTimes(1)
  })
})

describe('a router modal (the paywall, Make a crew) holds the screen while it is up', () => {
  it('a sheet that comes due under it waits; its own sheets present from it', async () => {
    const view = await render(
      <>
        <RouteModal>
          <Sheet visible onClose={() => {}} title="Make a crew" testID="own" />
        </RouteModal>
        <Sheet visible onClose={() => {}} title="Checked out" testID="root" />
      </>
    )
    expect(shown('own')).toBe(true)
    expect(shown('root')).toBe(false)
    // Closed: still sliding away, it holds the screen until its transition has ended (review LOW), then the sheet opens.
    mockTransitionEnd.length = 0
    await view.rerender(<Sheet visible onClose={() => {}} title="Checked out" testID="root" />)
    expect(shown('root')).toBe(false)
    await act(async () => mockTransitionEnd.forEach((f) => f()))
    expect(shown('root')).toBe(true)
  })

  it('if transitionEnd never comes, the screen is given up after the fallback', async () => {
    const view = await render(
      <>
        <RouteModal>{null}</RouteModal>
        <Sheet visible onClose={() => {}} title="Checked out" testID="root" />
      </>
    )
    await view.rerender(<Sheet visible onClose={() => {}} title="Checked out" testID="root" />)
    expect(shown('root')).toBe(false)
    await tick(800)
    expect(shown('root')).toBe(true)
  })
})

describe('MED-A: no false refusals', () => {
  it('a Modal that fades in has its fade added: onShow at 700 ms is not a refusal', async () => {
    mockFadeMs.set('menu-modal', 700)
    await render(<OverflowMenu visible onClose={() => {}} items={[]} testID="menu" />)
    await tick(600)
    expect(shown('menu')).toBe(true)
    await tick(400)
    await tick(2000)
    expect(shown('menu')).toBe(true)
  })

  it('a watchdog that fires late (a JS stall) looks once more before it counts', async () => {
    mockRefused.add('a-modal')
    await render(<Sheet visible onClose={() => {}} title="A" testID="a" />)
    // The timer comes 2 s late.
    const real = Date.now
    const spy = jest.spyOn(Date, 'now').mockImplementation(() => real() + 2000)
    await tick(500)
    spy.mockRestore()
    expect(shown('a')).toBe(true)
    // On time the second time: refused.
    await tick(600)
    expect(shown('a')).toBe(false)
  })

  it('nothing counts while the app is in the background, and it looks again when the app is active, not on a timer', async () => {
    mockRefused.add('a-modal')
    const state = Object.getOwnPropertyDescriptor(AppState, 'currentState')
    const woken: ((next: string) => void)[] = []
    const listen = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, cb: (next: string) => void) => {
      woken.push(cb)
      return { remove: () => {} }
    }) as never)
    Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true })
    try {
      await render(<Sheet visible onClose={() => {}} title="A" testID="a" />)
      await settle(4)
      expect(shown('a')).toBe(true)
      // Waiting for the app, not polling: one listener, however long it waits.
      expect(woken).toHaveLength(1)
      Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true })
      await act(async () => woken.forEach((f) => f('active')))
      await settle(1)
      expect(shown('a')).toBe(false)
    } finally {
      listen.mockRestore()
      if (state) Object.defineProperty(AppState, 'currentState', state)
      else Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true })
    }
  })

  it('a long refusal is logged at the 1st, 2nd, 4th, 8th… refusal, not every time (review LOW)', async () => {
    const { Logger } = require('../lib/logger')
    ;(Logger.warn as jest.Mock).mockClear()
    mockRefused.add('a-modal')
    await render(<Sheet visible onClose={() => {}} title="A" testID="a" />)
    await settle(20)
    const refusals = (Logger.warn as jest.Mock).mock.calls.map((c) => c[2].refusals)
    expect(refusals.length).toBeGreaterThan(2)
    expect(refusals.every((n: number) => (n & (n - 1)) === 0)).toBe(true)
  })

})

describe('afterSheetDismissed leaves no stale waiter (review LOW)', () => {
  it('resolved on the fallback before it reached the front, it leaves the line: the sheet behind it is not held up', async () => {
    // A holds the screen and never says it has gone.
    const view = await render(<Sheet visible onClose={() => {}} title="A" testID="a" />)
    void afterSheetDismissed(600)
    await tick(600)
    // A closes; B asks. Nobody stale ahead of B.
    await view.rerender(
      <>
        <Sheet visible={false} onClose={() => {}} title="A" testID="a" />
        <Sheet visible onClose={() => {}} title="B" testID="b" />
      </>
    )
    // A's exit, then its fallback: the moment A gives the screen up, B has it (a stale waiter would hold it 600 ms more).
    await tick(300)
    await tick(650)
    await tick(50)
    expect(shown('b')).toBe(true)
  })
})

it('a link opened from a sheet that stays up (Delete account → What’s kept) opens at once, over it', async () => {
  await render(<Sheet visible onClose={() => {}} title="Delete account?" testID="del" />)
  let opened = false
  void holdTurnWhile(async () => {
    opened = true
  })
  await act(async () => Promise.resolve())
  expect(opened).toBe(true)
})
