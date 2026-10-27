/*
 * <OfferCard> (guidelines/components/OfferCard.html, Flow 13, ROUND3 G3): a
 * venue speaks to its regulars. The offer, the window and validity, the
 * venue, "Why you got this" (the regulars rule) inline, Report and Stop under
 * ⋯, and the floor sentence. Used and ended dim to 72%.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import * as Reanimated from 'react-native-reanimated'

import { OfferCard } from '../components/ds/OfferCard'
import { DURATION } from '../lib/design/tokens'
import { H } from '../lib/haptics'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, withTiming: jest.fn(actual.withTiming), useReducedMotion: jest.fn(() => false) }
})
jest.mock('../lib/motion', () => ({ ...jest.requireActual('../lib/motion'), useReducedMotion: jest.fn(() => false) }))
// eslint-disable-next-line import/first
import { useReducedMotion } from '../lib/motion'

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const TOIT = { name: 'Toit', type: 'brewery', typeLabel: 'Brewery', area: 'Indiranagar' }
const card = (props: Partial<React.ComponentProps<typeof OfferCard>> = {}) => (
  <OfferCard venue={TOIT} offer="First drink on the house" window="Thu–Sun, before 10 pm" validUntil="Sun" onUse={jest.fn()} onMore={jest.fn()} testID="o" {...props} />
)

let primary: jest.SpyInstance
beforeEach(() => {
  primary = jest.spyOn(H, 'primary').mockImplementation(() => {})
})

describe('<OfferCard>', () => {
  it('reads venue → offer → window → validity', async () => {
    await render(card())
    expect(screen.getByLabelText('Toit: First drink on the house. Thu–Sun, before 10 pm, valid until Sun')).toBeTruthy()
  })

  it('Use at the door: H.primary on press-in (R3-G)', async () => {
    const onUse = jest.fn()
    await render(card({ onUse }))
    const use = screen.getByRole('button', { name: 'Use at the door' })
    await fireEvent(use, 'pressIn')
    await fireEvent.press(use)
    expect(primary).toHaveBeenCalledTimes(1)
    expect(onUse).toHaveBeenCalledTimes(1)
  })

  it('Why you got this expands inline to the regulars rule', async () => {
    await render(card())
    const why = screen.getByRole('button', { name: 'Why you got this' })
    expect(why.props.accessibilityState).toMatchObject({ expanded: false })
    await fireEvent.press(why)
    expect(screen.getByRole('button', { name: 'Why you got this' }).props.accessibilityState).toMatchObject({ expanded: true })
    expect(screen.getByText(/Toit sent this to everyone who’s been there 3 or more nights in the last 30 days\./)).toBeTruthy()
    expect(screen.getByText(/Blend’n picked who — Toit never sees the list, only roughly how many were sent and used\./)).toBeTruthy()
  })

  it('⋯ opens Report and Stop (the caller’s tray); the footer keeps only the floor', async () => {
    const onMore = jest.fn()
    await render(card({ onMore }))
    await fireEvent.press(screen.getByRole('button', { name: 'Toit’s offer, more' }))
    expect(onMore).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Offers only go to groups of 5 or more, so no one can be singled out.')).toBeTruthy()
    expect(screen.queryByText(/Turn off/)).toBeNull()
  })

  it.each([
    ['used', 'Used Fri'],
    ['ended', 'Ended Sun'],
  ] as const)('%s: 72%, says so, nothing to use', async (state, stateLabel) => {
    await render(card({ state, stateLabel }))
    expect(flat('o').opacity).toBe(0.72)
    expect(screen.getByText(stateLabel)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Use at the door' })).toBeNull()
  })
})

describe('"Why you got this" opens over base', () => {
  beforeEach(() => {
    ;(useReducedMotion as jest.Mock).mockReturnValue(false)
    jest.mocked(Reanimated.withTiming).mockClear()
  })
  const why = () => screen.getByRole('button', { name: 'Why you got this' })

  it('the card moves with its content (a layout transition), so the floor sentence glides down', async () => {
    await render(card())
    expect(screen.getByTestId('o').props.layout).toBeDefined()
  })

  it('the text fades in on entering and has an exit, and the chevron turns a quarter', async () => {
    await render(card())
    await fireEvent.press(why())
    const text = screen.getByTestId('o-why')
    expect(text.props.entering).toBeDefined()
    expect(text.props.exiting).toBeDefined()
    expect(Reanimated.withTiming).toHaveBeenCalledWith(90, expect.objectContaining({ duration: DURATION.base }))
  })

  it('closing turns the chevron back and takes the text away', async () => {
    await render(card())
    await fireEvent.press(why())
    jest.mocked(Reanimated.withTiming).mockClear()
    await fireEvent.press(why())
    expect(Reanimated.withTiming).toHaveBeenCalledWith(0, expect.objectContaining({ duration: DURATION.base }))
  })

  it('under Reduce Motion: no layout glide, the chevron jumps, the text still fades (200 ms)', async () => {
    ;(useReducedMotion as jest.Mock).mockReturnValue(true)
    await render(card())
    expect(screen.getByTestId('o').props.layout).toBeUndefined()
    await fireEvent.press(why())
    expect(Reanimated.withTiming).not.toHaveBeenCalledWith(90, expect.anything())
    expect(screen.getByTestId('o-why').props.entering).toBeDefined()
  })
})
