/*
 * One sheet's Modal on screen at a time (lib/modalTurn.ts, RC drive 4 D-9 and D-8).
 *
 * Drive 4, 15:45: Go Live's "Your live time is up" asked for the screen while the presence monitor's "Checked out" held
 * it. iOS refused the second Modal, React Native marked it presented anyway, the prompt was spent unseen, and after
 * "Got it" the app took no taps until it was relaunched. A sheet asked for while another is up now waits for it to have
 * gone, then opens; and a closed sheet's Modal is not left on screen catching touches.
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Platform } from 'react-native'

import { Sheet } from '../components/ds/Sheet'
import { resetModalTurns } from '../lib/modalTurn'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return {
    GlassView: (props: object) => <View {...props} testID="glass" />,
    isGlassEffectAPIAvailable: jest.fn(() => true),
    isLiquidGlassAvailable: jest.fn(() => true),
  }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

/** The exit, then whatever the exit scheduled (the fallback): each timer is set by a render the one before caused. */
const settle = async () => {
  for (let i = 0; i < 3; i++) await act(async () => jest.advanceTimersByTime(1000))
}
const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
const HIDDEN = { includeHiddenElements: true }
/** Whether a sheet's Modal is presented. React Native's test Modal draws nothing at all while it is not. */
const shown = (id: string) => screen.queryByTestId(`${id}-modal`, HIDDEN)?.props.visible === true

/** The two root hosts of drive 4: the presence monitor's notice and Go Live's expiry prompt. */
function Root({ notice, expiry, nested = false }: { notice: boolean; expiry: boolean; nested?: boolean }) {
  return (
    <>
      <Sheet visible={notice} onClose={() => {}} title="Checked out" testID="notice">
        {nested ? <Sheet visible onClose={() => {}} title="Inside" testID="inner" /> : null}
      </Sheet>
      <Sheet visible={expiry} onClose={() => {}} title="Your live time at Honeykomb is up" testID="expiry" />
    </>
  )
}

beforeEach(() => {
  on('ios')
  resetModalTurns()
  jest.useFakeTimers()
})
afterEach(() => jest.useRealTimers())

describe('iOS', () => {
  it('a sheet asked for while another is up waits, and opens once the first has gone', async () => {
    // Arrange: "Checked out" is on screen.
    const view = await render(<Root notice expiry={false} />)
    expect(shown('notice')).toBe(true)
    const iosSaysGone = screen.getByTestId('notice-modal', HIDDEN).props.onDismiss

    // Act: the window runs out under it.
    await view.rerender(<Root notice expiry />)

    // Assert: the prompt waits; it is not presented over the notice.
    expect(shown('expiry')).toBe(false)

    // Act: "Got it"; the notice slides out (well inside the fallback) and iOS says it has gone.
    await view.rerender(<Root notice={false} expiry />)
    await act(async () => jest.advanceTimersByTime(300))
    expect(shown('notice')).toBe(false)
    expect(shown('expiry')).toBe(false)
    await act(async () => iosSaysGone())

    // Assert: now the prompt is on screen, and the notice's Modal is not.
    expect(shown('expiry')).toBe(true)
    expect(shown('notice')).toBe(false)
  })

  it('if iOS never says the first has gone, the next opens after the fallback, not never', async () => {
    const view = await render(<Root notice expiry />)
    expect(shown('expiry')).toBe(false)
    await view.rerender(<Root notice={false} expiry />)
    await settle()
    expect(shown('expiry')).toBe(true)
  })

  it('a closed sheet leaves nothing on screen to catch a tap', async () => {
    const view = await render(<Root notice expiry={false} />)
    await view.rerender(<Root notice={false} expiry={false} />)
    // While it slides out its root already lets touches through; then the Modal goes.
    expect(screen.getByTestId('notice-root', HIDDEN).props.pointerEvents).toBe('none')
    await act(async () => jest.advanceTimersByTime(1000))
    expect(shown('notice')).toBe(false)
  })

  it('one that stops waiting gives up its place: the screen is not held by a sheet nobody wants', async () => {
    const view = await render(<Root notice expiry />)
    await view.rerender(<Root notice expiry={false} />)
    await view.rerender(<Root notice={false} expiry={false} />)
    await settle()
    // The prompt, asked for again later, opens at once.
    await view.rerender(<Root notice={false} expiry />)
    expect(shown('expiry')).toBe(true)
  })

  it('a sheet inside another sheet presents from it and does not wait', async () => {
    await render(<Root notice expiry={false} nested />)
    expect(shown('inner')).toBe(true)
  })

  it('unmounted while it holds the screen, it gives it back', async () => {
    const view = await render(<Sheet key="a" visible onClose={() => {}} title="A" testID="a" />)
    await view.rerender(<Sheet key="b" visible onClose={() => {}} title="B" testID="b" />)
    expect(shown('b')).toBe(true)
  })
})

it('Android presents a Modal over another: nothing waits there', async () => {
  on('android')
  await render(<Root notice expiry />)
  expect(shown('notice')).toBe(true)
  expect(shown('expiry')).toBe(true)
})
