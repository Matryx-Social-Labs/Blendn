/*
 * <ExpiryPrompt> and <NotLiveNotice> (guidelines/components/ExpiryPrompt.html,
 * Flow 11 · 11.4, ROUND3 G1): asked once when live time runs out. The free
 * extend is 45 minutes and the gradient primary; the Blend'n+ row is a solid
 * secondary and never on a night's first Go Live. After, the room says so.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'

import { ExpiryPrompt, NotLiveNotice } from '../components/ds/ExpiryPrompt'
import { H } from '../lib/haptics'

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

let threshold: jest.SpyInstance
let primary: jest.SpyInstance
beforeEach(() => {
  threshold = jest.spyOn(H, 'threshold').mockImplementation(() => {})
  primary = jest.spyOn(H, 'primary').mockImplementation(() => {})
})

const ended = (props: Partial<React.ComponentProps<typeof ExpiryPrompt>> = {}) => (
  <ExpiryPrompt kind="ended" visible venue="Toit" onExtend={jest.fn()} plus={{ from: '₹49', onPress: jest.fn() }} onDone={jest.fn()} {...props} />
)

describe('<ExpiryPrompt>', () => {
  it('asks once: Extend 45 min — free is the gradient primary (G1)', async () => {
    const onExtend = jest.fn()
    await render(ended({ onExtend }))
    expect(screen.getByRole('header', { name: 'Your live time at Toit is up' })).toBeTruthy()
    expect(screen.getByText('Still here?')).toBeTruthy()
    const extend = screen.getByRole('button', { name: 'Extend 45 min — free' })
    await fireEvent(extend, 'pressIn')
    await fireEvent.press(extend)
    expect(primary).toHaveBeenCalledTimes(1)
    expect(onExtend).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/20 min/)).toBeNull()
  })

  it('appearing plays nothing (R3-G: only Extend plays, H.primary)', async () => {
    await render(ended())
    expect(threshold).not.toHaveBeenCalled()
    expect(primary).not.toHaveBeenCalled()
  })

  it('the Blend’n+ row sits between Extend and Done, and is silent', async () => {
    const onPlus = jest.fn()
    await render(ended({ plus: { from: '₹49', onPress: onPlus } }))
    const names = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)
    expect(names.slice(-3)).toEqual(['Extend 45 min — free', 'Stay while you’re here with Blend’n+, up to 4 h, from 49 rupees', 'Done for now'])
    await fireEvent(screen.getByRole('button', { name: /Stay while you’re here/ }), 'pressIn')
    await fireEvent.press(screen.getByRole('button', { name: /Stay while you’re here/ }))
    expect(onPlus).toHaveBeenCalledTimes(1)
    expect(primary).not.toHaveBeenCalled()
  })

  it('while Extend is on its way, the rest wait and the sheet holds', async () => {
    const onDone = jest.fn()
    await render(ended({ extending: true, onDone }))
    expect(screen.getByRole('button', { name: 'Extend 45 min — free' }).props.accessibilityState).toMatchObject({ busy: true })
    expect(screen.getByRole('button', { name: 'Done for now' }).props.accessibilityState).toMatchObject({ disabled: true })
    expect(screen.getByRole('button', { name: /Stay while you’re here/ }).props.accessibilityState).toMatchObject({ disabled: true })
    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDone).not.toHaveBeenCalled()
  })

  it('never a Blend’n+ row on a person’s first Go Live', async () => {
    await render(ended({ firstGoLiveTonight: true }))
    expect(screen.queryByRole('button', { name: /Blend’n\+/ })).toBeNull()
  })

  /**
   * Negative control: dropping the `plus.from &&` in the first-Go-Live test hides the free row too, and
   * fails "where staying is free the row stays, even on a first Go Live".
   */
  it('where staying is free the row stays, with no price and no Blend’n+, even on a first Go Live', async () => {
    const onStay = jest.fn()
    await render(ended({ plus: { onPress: onStay }, firstGoLiveTonight: true }))
    const row = screen.getByRole('button', { name: 'Stay while you’re here, up to 4 h' })
    expect(screen.getByText('Stay while you’re here')).toBeTruthy()
    expect(screen.getByText('up to 4 h')).toBeTruthy()
    expect(screen.queryByText(/Blend’n\+/)).toBeNull()
    await fireEvent.press(row)
    expect(onStay).toHaveBeenCalledTimes(1)
  })

  it('while Stay is on its way the rest wait, but Extend shows no spinner', async () => {
    await render(ended({ staying: true }))
    expect(screen.getByRole('button', { name: 'Extend 45 min — free' }).props.accessibilityState).toMatchObject({ disabled: true })
    expect(screen.getByRole('button', { name: 'Extend 45 min — free' }).props.accessibilityState.busy).toBeFalsy()
    expect(screen.getByRole('button', { name: 'Done for now' }).props.accessibilityState).toMatchObject({ disabled: true })
    expect(screen.getByRole('button', { name: /Stay while you’re here/ }).props.accessibilityState).toMatchObject({ disabled: true })
  })

  it('reset at the venue’s own hour: tomorrow’s opens when the venue’s day does', async () => {
    await render(<ExpiryPrompt kind="reset" visible venue="Toit" opensAt="5" onDone={jest.fn()} />)
    expect(screen.getByText(/Tomorrow’s opens at 5\./)).toBeTruthy()
    expect(screen.queryByText(/opens at 6/)).toBeNull()
    await render(<ExpiryPrompt kind="reset" visible venue="Toit" opensAt="noon" onDone={jest.fn()} />)
    expect(screen.getByText(/Tomorrow’s opens at noon\./)).toBeTruthy()
  })

  it('reset at 06:00: the server’s sentence, one action', async () => {
    const onDone = jest.fn()
    await render(<ExpiryPrompt kind="reset" visible venue="Toit" onDone={onDone} />)
    expect(screen.getByRole('header', { name: 'Today’s room has closed' })).toBeTruthy()
    expect(screen.getByText(/Tomorrow’s opens at 6\./)).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Done for now' }))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(threshold).not.toHaveBeenCalled()
  })
})

describe('<NotLiveNotice>', () => {
  it('not live: the server’s sentence and Go live again', async () => {
    const onPress = jest.fn()
    await render(<NotLiveNotice kind="notLive" onPress={onPress} />)
    expect(screen.getByRole('header', { name: 'Not live here any more' })).toBeTruthy()
    expect(screen.getByText('You’re not live here any more. Go live at the venue to join today’s room.')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Go live again' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('the room closed at 06:00: Back to Places', async () => {
    await render(<NotLiveNotice kind="roomClosed" onPress={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Back to Places' })).toBeTruthy()
  })
})
