/*
 * <VenuePass> (guidelines/components/VenuePass.html): the check-in pass at the
 * foot of Tonight, the sheet tier (solid on Android): thumb, "You're here",
 * the title, N inside now, the taste tease, the hold, the consequence.
 * <DoorCode> (ROUND3 G3, guidelines/round3/r3g.js): the offer's door pass shows
 * the server's 6-character code in Geist Mono with a 30-second ring; staff type
 * it, so nothing is held on the phone.
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, StyleSheet, View } from 'react-native'

import { DoorCode, VenuePass } from '../components/ds/VenuePass'
import { COLOR, FONT_FAMILY, MATERIAL, RADIUS, TYPE } from '../lib/design/tokens'
import { H } from '../lib/haptics'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false) }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} testID="glass" />, isGlassEffectAPIAvailable: () => true, isLiquidGlassAvailable: () => true }
})
jest.mock('expo-blur', () => {
  const { View } = jest.requireActual('react-native')
  return { BlurView: (props: object) => <View {...props} /> }
})

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const style = (t: string) => StyleSheet.flatten(screen.getByText(t, { includeHiddenElements: true }).props.style)

beforeEach(() => {
  jest.spyOn(H, 'tick').mockImplementation(() => {})
  jest.spyOn(H, 'commit').mockImplementation(() => {})
})
afterEach(() => jest.useRealTimers())

describe('<VenuePass>', () => {
  const pass = (props: Partial<React.ComponentProps<typeof VenuePass>> = {}) =>
    render(<VenuePass title="Vinyl Night" hereCount={14} tasteCount={4} onConfirm={jest.fn()} testID="v" {...props} />)

  it('is the sheet tier at radius 24, with the thumb, the label, the title and N inside now', async () => {
    await pass({ cover: 'https://example.com/cover.jpg' })
    expect(flat('v')).toMatchObject({ borderRadius: RADIUS.sheet })
    expect(screen.getByTestId('glass')).toBeTruthy()
    expect(flat('v-thumb')).toMatchObject({ width: 56, height: 56, borderRadius: RADIUS.thumb })
    expect(style('YOU’RE HERE')).toMatchObject({ fontFamily: FONT_FAMILY.mono[500], color: COLOR.textSecondary })
    expect(style('Vinyl Night')).toMatchObject({ fontSize: TYPE.title.fontSize, color: COLOR.textPrimary })
    expect(style('14')).toMatchObject({ fontFamily: FONT_FAMILY.mono[500], color: COLOR.textPrimary, fontVariant: ['tabular-nums'] })
  })

  it('reads as one head, then the tease (never who), then the hold with the consequence as its hint', async () => {
    await pass()
    expect(screen.getByLabelText('You’re here. Vinyl Night. 14 inside now.')).toBeTruthy()
    expect(screen.getByLabelText('4 people here share your taste')).toBeTruthy()
    expect(screen.getAllByText('?', { includeHiddenElements: true })).toHaveLength(3)
    const hold = screen.getByRole('button', { name: 'Hold to blend in' })
    expect(hold.props.accessibilityHint).toBe('Checks you in. Other people at this event will see you.')
  })

  it('no taste matches: no tease; nobody in yet: “Be the first one in”', async () => {
    await pass({ tasteCount: 0, hereCount: 0 })
    expect(screen.queryByText('?', { includeHiddenElements: true })).toBeNull()
    expect(screen.getByLabelText('You’re here. Vinyl Night. Be the first one in.')).toBeTruthy()
  })

  it('checking in elsewhere: “Hold to switch” and the line that says so (4.8)', async () => {
    await pass({ holdLabel: 'Hold to switch', note: 'Checking in here takes you out of Fandom.' })
    expect(screen.getByRole('button', { name: 'Hold to switch' }).props.accessibilityHint).toBe('Checking in here takes you out of Fandom.')
  })

  it('outside the fence the hold is dimmed under its own label', async () => {
    await pass({ disabled: true, holdLabel: 'Go live when you’re here · 350 m', note: 'Walk in and the pass arms itself.' })
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({ disabled: true })
  })

  it('on the server’s yes (#9, the Flow 4 prototype): the hold reads “You’re in”, and the pour floods up inside the panel', async () => {
    await pass({ confirmed: true, pour: <View testID="the-pour" /> })
    expect(screen.getAllByText('You’re in', { includeHiddenElements: true })).toHaveLength(2)
    expect(screen.getByTestId('the-pour', { includeHiddenElements: true })).toBeTruthy()
    // Clipped to the panel: the pour sits inside its rounded, clipping box.
    expect(flat('v')).toMatchObject({ overflow: 'hidden', borderRadius: RADIUS.sheet })
  })

  it('Increase Contrast: the 50% hairline', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await pass()
    await act(async () => {})
    expect(flat('v-contrast')).toMatchObject({ borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast })
  })
})

describe('<DoorCode>', () => {
  const NOW = new Date('2026-10-15T21:40:10Z').getTime()

  it('live: the code large in Geist Mono 700, in two groups, with the 30-second ring counting down', async () => {
    jest.useFakeTimers({ now: NOW })
    await render(<DoorCode state="live" code="K7QM2X" rotatesAt={NOW + 20_000} testID="d" />)
    expect(style('K7Q M2X')).toMatchObject({ fontFamily: FONT_FAMILY.mono[700], fontSize: TYPE.display.fontSize, color: COLOR.textPrimary })
    expect(screen.getByText('20 s', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByText('Changes every 30 s · Today only', { includeHiddenElements: true })).toBeTruthy()
    await act(async () => jest.advanceTimersByTime(5_000))
    expect(screen.getByText('15 s', { includeHiddenElements: true })).toBeTruthy()
  })

  it('is read as six characters in two groups, and again when it changes; the ring is not read', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
    jest.useFakeTimers({ now: NOW })
    await render(<DoorCode state="live" code="K7QM2X" rotatesAt={NOW + 20_000} testID="d" />)
    expect(screen.getByLabelText('Door code K 7 Q, M 2 X')).toBeTruthy()
    expect(screen.getByTestId('d-ring', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true)
    await screen.rerender(<DoorCode state="live" code="P4WN8R" rotatesAt={NOW + 50_000} testID="d" />)
    expect(announce).toHaveBeenCalledTimes(1)
    expect(announce).toHaveBeenCalledWith('Door code P 4 W, N 8 R')
  })

  it('covered by another screen (`active` false): it neither ticks nor announces', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
    jest.useFakeTimers({ now: NOW })
    await render(<DoorCode state="live" code="K7QM2X" rotatesAt={NOW + 20_000} active={false} />)
    await act(async () => jest.advanceTimersByTime(5_000))
    expect(screen.getByText('20 s', { includeHiddenElements: true })).toBeTruthy()
    await screen.rerender(<DoorCode state="live" code="P4WN8R" rotatesAt={NOW + 50_000} active={false} />)
    expect(announce).not.toHaveBeenCalled()
  })

  it('offline: no code, the wifi-off well and the sentence that says why', async () => {
    await render(<DoorCode state="offline" testID="d" />)
    expect(style('··· ···').color).toBe(COLOR.textTertiary)
    expect(screen.getByTestId('d-offline', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByLabelText('Door code unavailable. This pass needs a connection to show its code.')).toBeTruthy()
  })

  it('redeemed, used tonight and ended are still and neutral', async () => {
    await render(<DoorCode state="redeemed" redeemedAt="21:43" />)
    expect(screen.getByText('Redeemed 21:43', { includeHiddenElements: true })).toBeTruthy()
    await render(<DoorCode state="used" />)
    expect(screen.getByText('Used tonight', { includeHiddenElements: true })).toBeTruthy()
    await render(<DoorCode state="ended" endedLabel="ENDED SUNDAY" />)
    expect(screen.getByText('ENDED SUNDAY', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByText('This offer ended', { includeHiddenElements: true })).toBeTruthy()
  })
})
