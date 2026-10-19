/*
 * Drive round 2: with the keyboard up in the Board composer the Spaces stepper could not be reached, on
 * both platforms. A capped sheet scrolls its content, and that scroll has to be there for the whole
 * content — the stepper included — and say so, and the field-into-view scroll must not fight a hand.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
import React from 'react'
import { Dimensions, Platform } from 'react-native'

import { BoardComposer } from '../components/board/BoardSections'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => true) }
})
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
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))

const SCREEN = 852
const handlers: Record<string, (e?: { endCoordinates: { height: number; screenY: number } }) => void> = {}
let spies: jest.SpyInstance[] = []

beforeEach(() => {
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
  const { Keyboard } = require('react-native')
  const real = Dimensions.get.bind(Dimensions)
  spies = [
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, fn: (typeof handlers)[string]) => {
      handlers[event] = fn
      return { remove: () => {} }
    }) as never),
    jest.spyOn(Dimensions, 'get').mockImplementation(((k: 'window' | 'screen') => (k === 'window' ? { width: 393, height: SCREEN, scale: 3, fontScale: 1 } : real(k))) as never),
  ]
})
afterEach(() => spies.forEach((s) => s.mockRestore()))

const composer = () => (
  <BoardComposer visible posting={false} refusal={null} onPost={jest.fn()} onCancel={jest.fn()} />
)
const keyboardUp = async () => {
  await act(async () => fireEvent(screen.getByTestId('board-composer-root', { includeHiddenElements: true }), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 393, height: SCREEN } } }))
  await act(async () => handlers.keyboardWillShow({ endCoordinates: { height: 336, screenY: SCREEN - 336 } }))
}
const scroll = () => screen.getByTestId('board-composer-content', { includeHiddenElements: true })

describe('the Board composer over the keyboard', () => {
  it('the Spaces stepper is inside the scrollable content, not beside it', async () => {
    await render(composer())
    await keyboardUp()
    expect(within(scroll()).getByLabelText('Spaces')).toBeTruthy()
    // And so are the field and the kind cards: one scroll holds every control above the pinned Post.
    expect(within(scroll()).getByLabelText('Your post')).toBeTruthy()
    expect(within(scroll()).getByTestId('board-kind-offer')).toBeTruthy()
    // The pinned actions are outside it.
    expect(within(scroll()).queryByLabelText('Post')).toBeNull()
  })

  it('the scroll is enabled, and shows it has more while the keyboard caps the sheet', async () => {
    await render(composer())
    expect(scroll().props.showsVerticalScrollIndicator).toBe(false)
    await keyboardUp()
    // Content taller than the room the keyboard leaves: the indicator comes up, so the sheet does not look finished.
    await act(async () => fireEvent(scroll(), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 393, height: 190 } } }))
    await act(async () => fireEvent(scroll(), 'contentSizeChange', 393, 400))
    expect(scroll().props.scrollEnabled).not.toBe(false)
    expect(scroll().props.showsVerticalScrollIndicator).toBe(true)
    expect(scroll().props.nestedScrollEnabled).toBe(true)
    // Nothing more than fits: no indicator.
    await act(async () => fireEvent(scroll(), 'contentSizeChange', 393, 190))
    expect(scroll().props.showsVerticalScrollIndicator).toBe(false)
  })

  it('without a keyboard there is no indicator, whatever the content', async () => {
    await render(composer())
    await act(async () => fireEvent(scroll(), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 393, height: 190 } } }))
    await act(async () => fireEvent(scroll(), 'contentSizeChange', 393, 400))
    expect(scroll().props.showsVerticalScrollIndicator).toBe(false)
  })

  describe('the field into view', () => {
    const frames: (() => void)[] = []
    let scrollTo: jest.SpyInstance
    let spies2: jest.SpyInstance[] = []

    beforeEach(() => {
      const { ScrollView, TextInput } = require('react-native')
      frames.length = 0
      scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {})
      spies2 = [
        scrollTo,
        jest.spyOn(global, 'requestAnimationFrame').mockImplementation(((cb: () => void) => frames.push(cb)) as never),
        jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue({
          measureLayout: (_n: unknown, ok: (x: number, y: number, w: number, h: number) => void) => ok(0, 200, 300, 112),
        } as never),
        jest.spyOn(ScrollView.prototype, 'getInnerViewNode').mockReturnValue(1 as never),
      ]
    })
    afterEach(() => spies2.forEach((s) => s.mockRestore()))

    const size = async () => {
      await act(async () => fireEvent(scroll(), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 393, height: 190 } } }))
      await act(async () => fireEvent(scroll(), 'contentSizeChange', 393, 400))
    }
    const runFrames = () => act(async () => frames.splice(0).forEach((f) => f()))

    it('is brought into view when the keyboard comes up', async () => {
      await render(composer())
      await size()
      await keyboardUp()
      await runFrames()
      expect(scrollTo).toHaveBeenCalled()
    })

    it('a hand that has taken the scroll over is not fought when the keyboard’s frame is then updated', async () => {
      await render(composer())
      await size()
      await keyboardUp()
      await runFrames()
      expect(scrollTo).toHaveBeenCalledTimes(1)
      // The person scrolls down to the Spaces stepper...
      await act(async () => fireEvent(scroll(), 'scrollBeginDrag'))
      // ...and the keyboard reports a different frame (Android's early estimate, then the exact one; a suggestions bar).
      await act(async () => handlers.keyboardWillShow({ endCoordinates: { height: 372, screenY: SCREEN - 372 } }))
      await runFrames()
      expect(scrollTo).toHaveBeenCalledTimes(1)
    })

    it('the same update, with no hand on the scroll, does bring the field back into view', async () => {
      await render(composer())
      await size()
      await keyboardUp()
      await runFrames()
      await act(async () => handlers.keyboardWillShow({ endCoordinates: { height: 372, screenY: SCREEN - 372 } }))
      await runFrames()
      expect(scrollTo).toHaveBeenCalledTimes(2)
    })

    it('and a new keyboard is a new gesture: it is brought into view again after the keyboard has gone', async () => {
      await render(composer())
      await size()
      await act(async () => fireEvent(scroll(), 'scrollBeginDrag'))
      await keyboardUp()
      await act(async () => handlers.keyboardWillHide())
      scrollTo.mockClear()
      frames.length = 0
      await act(async () => handlers.keyboardWillShow({ endCoordinates: { height: 336, screenY: SCREEN - 336 } }))
      await runFrames()
      expect(scrollTo).toHaveBeenCalled()
    })
  })
})
