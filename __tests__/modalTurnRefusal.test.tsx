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
import { Platform } from 'react-native'

import { OverflowMenu } from '../components/crews/OverflowMenu'
import { RouteModal } from '../components/system/RouteModal'
import { Sheet } from '../components/ds/Sheet'
import { holdsTurn, MAX_REFUSALS, requestTurn, resetModalTurns } from '../lib/modalTurn'
import { afterSheetDismissed, HANDOFF_MS } from '../lib/sheetDismissed'

/** Modals whose onShow iOS never sends (refused): every other Modal says it is shown as it is drawn. */
const mockRefused = new Set<string>()
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = require('react')
  const Base = jest.requireActual('@react-native/jest-preset/jest/mocks/Modal').default
  function Modal(props: { visible?: boolean; onShow?: () => void; testID?: string }) {
    const onShow = React.useRef(props.onShow)
    onShow.current = props.onShow
    const up = props.visible !== false
    React.useEffect(() => {
      if (up && !mockRefused.has(props.testID ?? '')) onShow.current?.()
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
// A router modal is focused while it is mounted here.
jest.mock('expo-router', () => ({
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

  it('refused again and again, it is closed and dropped rather than hold the screen', async () => {
    mockRefused.add('a-modal')
    const onClose = jest.fn()
    await render(<Sheet visible onClose={onClose} title="A" testID="a" />)
    await settle(MAX_REFUSALS * 3)
    expect(onClose).toHaveBeenCalled()
    expect(shown('a')).toBe(false)
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
    // Closed: the sheet under it opens.
    await view.rerender(<Sheet visible onClose={() => {}} title="Checked out" testID="root" />)
    expect(shown('root')).toBe(true)
  })
})
