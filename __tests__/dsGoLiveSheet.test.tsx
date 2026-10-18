/*
 * <GoLiveSheet> (guidelines/components/GoLiveSheet.html, Flow 11 · 11.2,
 * Delta R2-D7): dial, then hold. 20 / 45 min / 1 hour / Stay while I'm here;
 * Stay locked behind Blend'n+ shows the server's sentence and the Plus mark
 * and opens the Tonight sheet; the one hold (900 ms); the five refusals are
 * the server's sentence in the sheet, with no haptic.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo } from 'react-native'

import { GoLiveSheet } from '../components/ds/GoLiveSheet'
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

let spies: Record<string, jest.SpyInstance>
beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false)
  spies = Object.fromEntries(Object.keys(H).map((k) => [k, jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {})]))
})

const sheet = (props: Partial<React.ComponentProps<typeof GoLiveSheet>> = {}) => (
  <GoLiveSheet visible onClose={jest.fn()} venue="Toit" pseudonym="Night Cat" choice={45} onChoice={jest.fn()} onGoLive={jest.fn()} testID="g" {...props} />
)

describe('<GoLiveSheet>', () => {
  it('names the room and what others see; four choices as radios', async () => {
    await render(sheet())
    expect(screen.getByRole('header', { name: 'Go live at Toit' })).toBeTruthy()
    expect(screen.getByText('People in Toit’s room tonight see you by your nickname for today. Outside the room, Toit only shows how busy it is — never who.')).toBeTruthy()
    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => r.props.accessibilityLabel)).toEqual([
      '20 min',
      '45 min',
      '1 hour',
      'Stay while I’m here, Keeps you live as long as you’re at Toit, up to 4 hours, free today',
    ])
    expect(radios[1].props.accessibilityState).toMatchObject({ checked: true })
    expect(screen.getByText('You can end it anytime.')).toBeTruthy()
  })

  it('the dial: H.select on a change, nothing on the picked one', async () => {
    const onChoice = jest.fn()
    await render(sheet({ onChoice }))
    await fireEvent.press(screen.getAllByRole('radio')[2])
    expect(onChoice).toHaveBeenCalledWith(60)
    expect(spies.select).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getAllByRole('radio')[1])
    expect(spies.select).toHaveBeenCalledTimes(1)
  })

  it('the hold names the room, the time and the nickname for a screen reader', async () => {
    await render(sheet())
    expect(screen.getByLabelText('Hold to go live')).toBeTruthy()
    ;(AccessibilityInfo.isScreenReaderEnabled as jest.Mock).mockResolvedValue(true)
    await render(sheet())
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Go live at Toit for 45 minutes as Night Cat' })).toBeTruthy()
  })

  it('busy: “Going live…”, the dial waits and the sheet holds; the server’s yes plays H.success once', async () => {
    const onClose = jest.fn()
    const onChoice = jest.fn()
    const { rerender } = await render(sheet({ busy: true, onClose, onChoice }))
    await act(async () => {})
    expect(screen.getByLabelText('Going live…')).toBeTruthy()
    const twenty = screen.getAllByRole('radio')[0]
    expect(twenty.props.accessibilityState).toMatchObject({ disabled: true })
    await fireEvent.press(twenty)
    expect(onChoice).not.toHaveBeenCalled()
    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onClose).not.toHaveBeenCalled()
    await rerender(sheet({ live: true }))
    expect(spies.success).toHaveBeenCalledTimes(1)
  })

  it('never plays for a sheet that opens already live, even in the same commit', async () => {
    const { rerender } = await render(sheet({ visible: false }))
    await rerender(sheet({ visible: true, live: true }))
    expect(spies.success).not.toHaveBeenCalled()
  })

  it('Stay locked: the server’s sentence and the Plus mark; a tap opens the Tonight sheet, silently', async () => {
    const onStayLocked = jest.fn()
    const onChoice = jest.fn()
    await render(sheet({ stay: 'locked', onStayLocked, onChoice }))
    const stay = screen.getAllByRole('radio')[3]
    expect(stay.props.accessibilityLabel).toBe('Stay while I’m here, Staying live is part of Blendn+., Blend’n+')
    expect(stay.props.accessibilityHint).toBe('Opens Blend’n+')
    await fireEvent.press(stay)
    expect(onStayLocked).toHaveBeenCalledTimes(1)
    expect(onChoice).not.toHaveBeenCalled()
    expect(spies.select).not.toHaveBeenCalled()
  })

  it.each([
    ['notHere', 'Not here yet', /You’re not at Toit yet\. Go live once you’re inside\./, 'Open Maps'],
    ['eventOn', 'Vinyl Night is on here', /An event is on here\./, 'Check in to Vinyl Night'],
    ['noArea', 'Not yet', /You can’t go live here yet\./, 'Close'],
    ['age', 'Not yet', /18 and over/, 'Finish setting up'],
    ['closed', 'Toit is closed right now', /Tonight’s hours: 12 PM – 1 AM\./, 'Close'],
  ] as const)('refusal %s: the server’s sentence in the sheet, no haptic', async (refusal, title, body, action) => {
    const onRefusalAction = jest.fn()
    const onClose = jest.fn()
    await render(sheet({ refusal, event: 'Vinyl Night', hours: '12 PM – 1 AM', onRefusalAction, onClose }))
    expect(screen.getByRole('header', { name: title })).toBeTruthy()
    expect(screen.getByText(body)).toBeTruthy()
    expect(screen.queryByRole('radio')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: action }))
    // Close has nothing to do but close; the others take you somewhere (A50: a verb, never OK).
    expect(screen.queryByRole('button', { name: 'OK' })).toBeNull()
    expect(action === 'Close' ? onClose : onRefusalAction).toHaveBeenCalledTimes(1)
    for (const k of ['error', 'success', 'primary', 'select']) if (refusal !== 'eventOn' || k !== 'primary') expect(spies[k]).not.toHaveBeenCalled()
  })
  it.each([
    ['gps', 'GPS signal too weak', 'GPS signal is too weak (accuracy: 400m).', 'Try again'],
    ['timeout', 'Couldn’t go live', 'Check your connection and try again.', 'Try again'],
    ['rate', 'Too many tries', 'Try again in 2 minutes.', 'Close'],
    ['notFound', 'This place isn’t available', 'Venue not found', 'Go back'],
    ['notHere', 'Not here yet', 'You’re not at Toit yet.', 'Open Maps'],
  ] as const)('R4 11-1 refusal %s: the server’s sentence verbatim, a verb for the way on, no haptic', async (refusal, title, message, action) => {
    const onRefusalAction = jest.fn()
    const onClose = jest.fn()
    await render(sheet({ refusal, refusalMessage: message, onRefusalAction, onClose }))
    expect(screen.getByRole('header', { name: title })).toBeTruthy()
    expect(screen.getByText(new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: action }))
    expect(action === 'Close' ? onClose : onRefusalAction).toHaveBeenCalledTimes(1)
    for (const k of Object.keys(spies)) expect(spies[k]).not.toHaveBeenCalled()
  })

  it('"Staying live is part of Blend’n+": Pick a time is the strong way back, See Blend’n+ the second', async () => {
    const onRefusalAction = jest.fn()
    const onRefusalAlt = jest.fn()
    await render(sheet({ refusal: 'stay', onRefusalAction, onRefusalAlt }))
    expect(screen.getByRole('header', { name: 'Staying live is part of Blend’n+' })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Pick a time' }))
    await fireEvent.press(screen.getByRole('button', { name: 'See Blend’n+' }))
    expect(onRefusalAction).toHaveBeenCalledTimes(1)
    expect(onRefusalAlt).toHaveBeenCalledTimes(1)
  })

  it('a refusal with no sheet of its own takes the server’s title and words; an event with no known title is still named', async () => {
    await render(sheet({ refusal: 'other', refusalTitle: 'Finish your profile first', refusalMessage: 'Finish onboarding.' }))
    expect(screen.getByRole('header', { name: 'Finish your profile first' })).toBeTruthy()
    expect(screen.getByText('Finish onboarding.')).toBeTruthy()
    await render(sheet({ refusal: 'eventOn' }))
    expect(screen.getByRole('header', { name: 'An event is on here' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Check in to the event' })).toBeTruthy()
  })
})
