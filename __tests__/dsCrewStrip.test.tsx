/*
 * <CrewStrip> (guidelines/components/CrewStrip.html, Flow 10 · 10.6): after
 * your own check-in, your crew as a count, and "Tell your crew — We're here"
 * that settles to "Your crew knows". H.primary on press-in, H.success on the
 * server's OK; a count rising plays nothing. Off is one quiet line.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'

import { CrewStrip, type StripCrew } from '../components/ds/CrewStrip'
import { H } from '../lib/haptics'

jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

const nebula = (o: Partial<StripCrew> = {}): StripCrew => ({
  id: 'n',
  name: 'Nebula',
  emblemSeed: 'nebula',
  size: 4,
  here: 2,
  context: 'Vinyl Night · Toit',
  told: 'no',
  ...o,
})

let primary: jest.SpyInstance
let success: jest.SpyInstance
beforeEach(() => {
  primary = jest.spyOn(H, 'primary').mockImplementation(() => {})
  success = jest.spyOn(H, 'success').mockImplementation(() => {})
})

describe('<CrewStrip>', () => {
  it('names the crew and its count, then the action', async () => {
    const onTell = jest.fn()
    await render(<CrewStrip crews={[nebula()]} onTell={onTell} />)
    expect(screen.getByLabelText('Crew Nebula, 2 of 4 here, Vinyl Night · Toit')).toBeTruthy()
    const tell = screen.getByRole('button', { name: 'Tell your crew — We’re here' })
    await fireEvent(tell, 'pressIn')
    expect(primary).toHaveBeenCalledTimes(1)
    await fireEvent.press(tell)
    expect(onTell).toHaveBeenCalledWith('n')
  })

  it('alone: you are the first, and it says when the crew shows', async () => {
    await render(<CrewStrip crews={[nebula({ here: 1 })]} onTell={jest.fn()} />)
    expect(screen.getByText('You’re the first from Nebula. Your crew shows up here once two of you are in.')).toBeTruthy()
  })

  it('everyone in', async () => {
    await render(<CrewStrip crews={[nebula({ here: 4 })]} onTell={jest.fn()} />)
    expect(screen.getByText('everyone')).toBeTruthy()
  })

  it('the action reaches 44 pt on iOS and 48 dp on Android', async () => {
    await render(<CrewStrip crews={[nebula()]} onTell={jest.fn()} testID="s" />)
    expect(StyleSheet.flatten(screen.getByTestId('s-n-tell').props.style).minHeight).toBe(44)
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
    await render(<CrewStrip crews={[nebula()]} onTell={jest.fn()} testID="s" />)
    expect(StyleSheet.flatten(screen.getByTestId('s-n-tell').props.style).minHeight).toBe(48)
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
  })

  it('sending: busy at once, the spinner only after 300 ms', async () => {
    jest.useFakeTimers()
    await render(<CrewStrip crews={[nebula({ told: 'sending' })]} onTell={jest.fn()} />)
    expect(screen.getByText('Tell your crew — We’re here')).toBeTruthy()
    await act(async () => jest.advanceTimersByTime(350))
    expect(screen.queryByText('Tell your crew — We’re here')).toBeNull()
    jest.useRealTimers()
  })

  it('settles to “Your crew knows” with H.success on the server’s OK, once, and says so', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
    const { rerender } = await render(<CrewStrip crews={[nebula({ told: 'sending' })]} onTell={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Tell your crew — We’re here' }).props.accessibilityState).toMatchObject({ busy: true })
    expect(success).not.toHaveBeenCalled()
    await rerender(<CrewStrip crews={[nebula({ told: 'yes' })]} onTell={jest.fn()} />)
    expect(screen.getByText('Your crew knows')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(success).toHaveBeenCalledTimes(1)
    expect(announce).toHaveBeenCalledWith('Your crew knows')
  })

  it('already told: says so, without a haptic', async () => {
    await render(<CrewStrip crews={[nebula({ told: 'already' })]} onTell={jest.fn()} />)
    expect(screen.getByText('Your crew already knows')).toBeTruthy()
    expect(success).not.toHaveBeenCalled()
  })

  it('a count rising plays nothing', async () => {
    const spies = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
    const { rerender } = await render(<CrewStrip crews={[nebula()]} onTell={jest.fn()} />)
    await rerender(<CrewStrip crews={[nebula({ here: 3 })]} onTell={jest.fn()} />)
    for (const s of spies) expect(s).not.toHaveBeenCalled()
  })

  it('two crews stack, each with its own action', async () => {
    await render(<CrewStrip crews={[nebula(), nebula({ id: 'q', name: 'Quiz Night Irregulars', size: 5, here: 1 })]} onTell={jest.fn()} />)
    expect(screen.getAllByRole('button', { name: 'Tell your crew — We’re here' })).toHaveLength(2)
  })

  it('off: one quiet line and no action', async () => {
    await render(<CrewStrip crews={[nebula()]} off onTell={jest.fn()} />)
    expect(screen.getByText('Crews are off at this event. The strip hides and “We’re here” is refused.')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
