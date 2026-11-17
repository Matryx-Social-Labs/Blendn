/*
 * <SessionSheet> (guidelines/components/SessionSheet.html, Flow 11 · 11.3):
 * while you are live at a venue, opened from the venue dock's state line. The time left, Extend whenever it moves the
 * end (labelled with the new end; H.primary, H.success when it lands), Stop (which confirms in the same sheet with the
 * neutral hold: check-out always confirms), and Stay.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Dimensions, Platform, StyleSheet } from 'react-native'

import { SessionSheet } from '../components/ds/SessionSheet'
import { COLOR } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { STOP_LIVE_CONSEQUENCE } from '../lib/switchCopy'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false) }
})
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} />, isGlassEffectAPIAvailable: jest.fn(() => true), isLiquidGlassAvailable: jest.fn(() => true) }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

let primary: jest.SpyInstance
let success: jest.SpyInstance
let destructive: jest.SpyInstance
beforeEach(() => {
  primary = jest.spyOn(H, 'primary').mockImplementation(() => {})
  success = jest.spyOn(H, 'success').mockImplementation(() => {})
  destructive = jest.spyOn(H, 'destructive').mockImplementation(() => {})
})

const base = { visible: true, onClose: jest.fn(), venue: 'Toit', onExtend: jest.fn(), onEnd: jest.fn() }

describe('<SessionSheet>', () => {
  it('the minutes left, read as one line; Stop only, while an Extend would not move the end', async () => {
    await render(<SessionSheet {...base} time={{ kind: 'minutes', left: 52, until: '21:50' }} />)
    expect(screen.getByRole('header', { name: 'Live at Toit' })).toBeTruthy()
    expect(screen.getByLabelText('52 minutes left, live until 21:50')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Extend/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()
  })

  it('“Extend or stop”: with minutes left that an Extend would move, Extend (named with the new end) and Stop', async () => {
    const onExtend = jest.fn()
    await render(<SessionSheet {...base} onExtend={onExtend} time={{ kind: 'minutes', left: 32, until: '21:50', extendUntil: '22:03' }} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Extend · Live until 22:03' }))
    expect(onExtend).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()
  })

  it('over an hour, the spoken line says hours and minutes', async () => {
    await render(<SessionSheet {...base} time={{ kind: 'minutes', left: 165, until: '22:45' }} />)
    expect(screen.getByLabelText('2 hours 45 minutes left, live until 22:45')).toBeTruthy()
  })

  it('the last 5 minutes: mm:ss and Extend, named with the new end, H.primary on press-in', async () => {
    const onExtend = jest.fn()
    await render(<SessionSheet {...base} onExtend={onExtend} time={{ kind: 'ending', clock: '4:59', extendUntil: '22:10' }} />)
    expect(screen.getByText('4:59')).toBeTruthy()
    const extend = screen.getByRole('button', { name: 'Extend · Live until 22:10' })
    await fireEvent(extend, 'pressIn')
    await fireEvent.press(extend)
    expect(primary).toHaveBeenCalledTimes(1)
    expect(onExtend).toHaveBeenCalledTimes(1)
  })

  it('extended: says until when, read with the count; H.success and the announcement as it lands', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
    const { rerender } = await render(<SessionSheet {...base} time={{ kind: 'ending', clock: '4:59', extendUntil: '22:10' }} />)
    await rerender(<SessionSheet {...base} time={{ kind: 'minutes', left: 52, until: '22:10' }} extended />)
    expect(screen.getByText('Extended · Live until 22:10')).toBeTruthy()
    expect(screen.getByLabelText('52 minutes left, live until 22:10, extended')).toBeTruthy()
    expect(success).toHaveBeenCalledTimes(1)
    expect(announce).toHaveBeenCalledWith('Extended · Live until 22:10')
  })

  it('never plays for a sheet that opens and is extended in the same commit', async () => {
    const { rerender } = await render(<SessionSheet {...base} visible={false} time={{ kind: 'ending', clock: '4:59', extendUntil: '22:10' }} />)
    await rerender(<SessionSheet {...base} visible time={{ kind: 'minutes', left: 52, until: '22:10' }} extended />)
    expect(success).not.toHaveBeenCalled()
  })

  it('turning into the confirm moves focus to its title', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {})
    await render(<SessionSheet {...base} time={{ kind: 'minutes', left: 32, until: '21:50' }} />)
    focus.mockClear()
    await fireEvent.press(screen.getByRole('button', { name: 'Stop' }))
    expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus')
  })

  it('never plays for a sheet that opens extended, or lands while it is closed', async () => {
    await render(<SessionSheet {...base} time={{ kind: 'minutes', left: 52, until: '22:10' }} extended />)
    const { rerender } = await render(<SessionSheet {...base} visible={false} time={{ kind: 'ending', clock: '4:59', extendUntil: '22:10' }} />)
    await rerender(<SessionSheet {...base} visible={false} time={{ kind: 'minutes', left: 52, until: '22:10' }} extended />)
    expect(success).not.toHaveBeenCalled()
  })

  it('Extend is busy while it is on its way: a second tap does nothing', async () => {
    const onExtend = jest.fn()
    await render(<SessionSheet {...base} onExtend={onExtend} extending time={{ kind: 'ending', clock: '4:59', extendUntil: '22:10' }} />)
    const extend = screen.getByRole('button', { name: 'Extend · Live until 22:10' })
    expect(extend.props.accessibilityState).toMatchObject({ busy: true })
    await fireEvent.press(extend)
    expect(onExtend).not.toHaveBeenCalled()
  })

  it('Stay: “Staying”, the 4-hour cap and how it carries', async () => {
    await render(<SessionSheet {...base} time={{ kind: 'stay', endsBy: '00:40' }} />)
    expect(screen.getByText('Staying')).toBeTruthy()
    expect(screen.getByText('As long as you’re at Toit · up to 4 hours · ends 00:40 at the latest')).toBeTruthy()
    expect(screen.getByText('Each time your phone sees you inside Toit, your time carries 20 minutes further.')).toBeTruthy()
  })

  /*
   * Stopping being live is leaving, not a yes and not a loss (owner 2026-11-17, buttons board C): the same neutral hold as
   * Check out, in the same words' shape. The one way in is the sheet's Stop (the dock's Leave is gone, owner 2026-11-17).
   */
  const hold = () => screen.getByTestId('session-stop-hold')
  const held = async () => fireEvent(hold(), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } })
  const confirming = async (props: Partial<React.ComponentProps<typeof SessionSheet>> = {}) => {
    await render(<SessionSheet {...base} visible time={{ kind: 'minutes', left: 32, until: '21:50' }} {...props} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Stop' }))
  }

  it('Stop turns the one sheet into the confirm: the question, then the neutral hold; Stay goes back to the session', async () => {
    const onEnd = jest.fn()
    await render(<SessionSheet {...base} onEnd={onEnd} time={{ kind: 'minutes', left: 32, until: '21:50' }} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Stop' }))
    expect(onEnd).not.toHaveBeenCalled()
    expect(screen.getByRole('header', { name: 'Stop being live at Toit?' })).toBeTruthy()
    // One modal at a time: the session gave way to the confirm in the same sheet.
    expect(screen.queryByRole('header', { name: 'Live at Toit' })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Stay' }))
    expect(screen.getByRole('header', { name: 'Live at Toit' })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Stop' }))
    await held()
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('the confirm is the neutral hold, never a red button: surface, the grey rim, its tone pouring in', async () => {
    await confirming()
    expect(hold().props.accessibilityLabel).toBe('Hold to stop being live')
    expect(hold().props.accessibilityHint).toBe('Ends your live time at Toit.')
    expect(StyleSheet.flatten(screen.getByTestId('session-stop-hold-track-inset').props.style).backgroundColor).toBe(COLOR.surface)
    expect(StyleSheet.flatten(screen.getByTestId('session-stop-hold-fill-ground').props.style).backgroundColor).toBe(COLOR.hairlineStrong)
    expect(screen.queryByRole('button', { name: /^(Stop|End)$/ })).toBeNull()
    await held()
    expect(destructive).not.toHaveBeenCalled()
  })

  it('a swipe away from the confirm closes the sheet, and the next open starts on the session again', async () => {
    const time = { kind: 'minutes' as const, left: 32, until: '21:50' }
    const onClose = jest.fn()
    const { rerender } = await render(<SessionSheet {...base} onClose={onClose} visible time={time} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Stop' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await rerender(<SessionSheet {...base} visible={false} time={time} />)
    await rerender(<SessionSheet {...base} visible time={time} />)
    expect(screen.getByRole('header', { name: 'Live at Toit' })).toBeTruthy()
  })

  it('while it ends the hold stays full under “Stopping…”, busy', async () => {
    await confirming({ ending: true })
    expect(hold().props.accessibilityLabel).toBe('Stopping…')
    expect(hold().props.accessibilityState).toMatchObject({ busy: true })
    expect(screen.getByRole('button', { name: 'Stay' }).props.accessibilityState).toMatchObject({ disabled: true })
  })

  it.each([
    [1, 'over'],
    [3.571, 'under'],
  ])('at text size %p the sentence sits %s the hold: at the accessibility sizes the hold comes straight after the question, as Check out’s', async (fontScale, where) => {
    const window = Dimensions.get('window')
    Dimensions.set({ window: { ...window, fontScale } })
    try {
      await confirming()
      type Node = { children?: readonly (Node | string)[] }
      const walk = (n: Node): Node[] => [n, ...(n.children ?? []).flatMap((c) => (typeof c === 'string' ? [] : walk(c)))]
      const order: unknown[] = walk(screen.container as unknown as Node)
      const [sentence, at] = [order.indexOf(screen.getByText(STOP_LIVE_CONSEQUENCE)), order.indexOf(hold())]
      expect(sentence).toBeGreaterThan(-1)
      expect(at).toBeGreaterThan(-1)
      expect(sentence < at ? 'over' : 'under').toBe(where)
    } finally {
      Dimensions.set({ window })
    }
  })

  it('with no end to count to (no expiry, not a stay) it says only that you are live, and Stop still confirms', async () => {
    await render(<SessionSheet {...base} time={null} />)
    expect(screen.getByLabelText('Live')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Stop' }))
    expect(screen.getByRole('header', { name: 'Stop being live at Toit?' })).toBeTruthy()
  })

  it('Stay with no hard end sent says nothing about one', async () => {
    await render(<SessionSheet {...base} time={{ kind: 'stay' }} />)
    expect(screen.getByLabelText('Staying')).toBeTruthy()
    expect(screen.getByText('As long as you’re at Toit · up to 4 hours')).toBeTruthy()
  })
})
