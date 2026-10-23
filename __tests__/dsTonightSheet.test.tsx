/*
 * <TonightSheet> (guidelines/components/TonightSheet.html, Flow 12 · 12.1,
 * ROUND3 G2): Blend'n+ offered where it would help tonight, in one sentence.
 * Night Pass (24 hours, doesn't renew) first and preselected, Monthly second;
 * Continue — price (H.primary), the free path, "See all plans", the legal links. The store's
 * outcome: cancelled and failed say nothing was charged; pending waits.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'

import { TonightSheet } from '../components/ds/TonightSheet'
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

let primary: jest.SpyInstance
let select: jest.SpyInstance
beforeEach(() => {
  primary = jest.spyOn(H, 'primary').mockImplementation(() => {})
  select = jest.spyOn(H, 'select').mockImplementation(() => {})
})

const sheet = (props: Partial<React.ComponentProps<typeof TonightSheet>> = {}) => (
  <TonightSheet
    visible
    onClose={jest.fn()}
    trigger="stay"
    venue="Toit"
    prices={{ night: '₹49', monthly: '₹199' }}
    pick="night"
    onPick={jest.fn()}
    onContinue={jest.fn()}
    onFree={jest.fn()}
    onSeeAll={jest.fn()}
    onTerms={jest.fn()}
    onPrivacy={jest.fn()}
    onRestore={jest.fn()}
    store="ios"
    {...props}
  />
)

describe('<TonightSheet>', () => {
  it('one trigger sentence; Night Pass first and picked; Monthly second', async () => {
    await render(sheet())
    expect(screen.getByRole('header', { name: 'Stay live while you’re here' })).toBeTruthy()
    expect(screen.getByText('Up to 4 hours at Toit tonight, carried on while your phone sees you inside.')).toBeTruthy()
    const radios = screen.getAllByRole('radio')
    expect(radios[0].props.accessibilityLabel).toBe('Just tonight, 49 rupees, 24 hours · doesn’t renew')
    expect(radios[0].props.accessibilityState).toMatchObject({ checked: true })
    expect(radios[1].props.accessibilityLabel).toBe('Blend’n+ monthly, 199 rupees a month')
  })

  it('Continue names the price and plays H.primary; picking Monthly plays H.select', async () => {
    const onContinue = jest.fn()
    const onPick = jest.fn()
    await render(sheet({ onContinue, onPick }))
    await fireEvent.press(screen.getAllByRole('radio')[1])
    expect(select).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith('monthly')
    const go = screen.getByRole('button', { name: 'Continue — ₹49' })
    await fireEvent(go, 'pressIn')
    await fireEvent.press(go)
    expect(primary).toHaveBeenCalledTimes(1)
    expect(onContinue).toHaveBeenCalledTimes(1)
    await screen.unmount() // one sheet on screen at a time (lib/modalTurn): the first goes before the next
    await render(sheet({ pick: 'monthly' }))
    expect(screen.getByRole('button', { name: 'Continue — ₹199' })).toBeTruthy()
  })

  it('the free path is always there: Go live for 1 hour — free, or Not now', async () => {
    const onFree = jest.fn()
    await render(sheet({ onFree }))
    await fireEvent(screen.getByRole('button', { name: 'Go live for 1 hour — free' }), 'pressIn')
    await fireEvent.press(screen.getByRole('button', { name: 'Go live for 1 hour — free' }))
    expect(onFree).toHaveBeenCalledTimes(1)
    expect(primary).toHaveBeenCalledTimes(1)
    await screen.unmount() // one sheet on screen at a time (lib/modalTurn): the first goes before the next
    await render(sheet({ trigger: 'night' }))
    await fireEvent(screen.getByRole('button', { name: 'Not now' }), 'pressIn')
    expect(primary).toHaveBeenCalledTimes(1)
  })

  it('from the expiry prompt: Extend 45 min — free (G1)', async () => {
    await render(sheet({ trigger: 'expiry' }))
    expect(screen.getByRole('button', { name: 'Extend 45 min — free' })).toBeTruthy()
    expect(screen.getByText('Your free time at Toit is up. Stay keeps you live for up to 4 hours.')).toBeTruthy()
  })

  it('cancelled and failed say nothing was charged; failed offers Try again', async () => {
    await render(sheet({ status: 'cancelled' }))
    expect(screen.getByText('Nothing was charged.')).toBeTruthy()
    await screen.unmount() // one sheet on screen at a time (lib/modalTurn): the first goes before the next
    await render(sheet({ status: 'failed' }))
    expect(screen.getByText('The store couldn’t complete it. Nothing was charged.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again — ₹49' })).toBeTruthy()
  })

  it('pending: waits for the store; Continue steps back to a disabled secondary and the plans wait', async () => {
    const onPick = jest.fn()
    await render(sheet({ status: 'pending', store: 'android', onPick }))
    expect(screen.getByText('Waiting for Google Play to confirm. You can keep using Blend’n.')).toBeTruthy()
    const go = screen.getByRole('button', { name: 'Continue — ₹49' })
    expect(go.props.accessibilityState).toMatchObject({ disabled: true })
    await fireEvent(go, 'pressIn')
    expect(primary).not.toHaveBeenCalled()
    const monthly = screen.getAllByRole('radio')[1]
    expect(monthly.props.accessibilityState).toMatchObject({ disabled: true })
    await fireEvent.press(monthly)
    expect(onPick).not.toHaveBeenCalled()
  })

  it('See all plans, and the GST line', async () => {
    const onSeeAll = jest.fn()
    await render(sheet({ onSeeAll }))
    await fireEvent.press(screen.getByRole('button', { name: 'See all plans' }))
    expect(onSeeAll).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Night Pass is a one-off. Prices include GST.')).toBeTruthy()
  })

  /**
   * H3 (App Store 3.1.2 / Play): where a subscription is the pick, its renewal and cancellation terms are on the sheet that sells it.
   * Negative control: always rendering the GST line fails "the monthly pick carries the store's terms".
   */
  it('the monthly pick carries the store’s renewal and cancellation terms in place of the GST line; the Night Pass says it is a one-off', async () => {
    const legal = 'Payment is charged to your Apple Account at confirmation. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period. Night Pass is a one-off. Prices include GST.'
    await render(sheet({ pick: 'monthly', legal }))
    expect(screen.getByTestId('tonight-legal').props.children).toBe(legal)
    expect(screen.queryByText('Prices include GST.')).toBeNull()
    await screen.unmount() // one sheet on screen at a time (lib/modalTurn): the first goes before the next
    await render(sheet({ pick: 'night', legal }))
    expect(screen.getByText('Night Pass is a one-off. Prices include GST.')).toBeTruthy()
  })

  it('without the store’s wording the monthly pick still says prices include GST', async () => {
    await render(sheet({ pick: 'monthly' }))
    expect(screen.getByText('Prices include GST.')).toBeTruthy()
  })

  it('Restore purchases says it is restoring, and holds', async () => {
    const onRestore = jest.fn()
    await render(sheet({ restoring: true, onRestore }))
    await fireEvent.press(screen.getByRole('link', { name: 'Restoring…' }))
    expect(onRestore).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Restoring…' }).props.accessibilityState).toMatchObject({ busy: true })
  })

  it('Terms, Privacy and Restore purchases are links', async () => {
    const onRestore = jest.fn()
    await render(sheet({ onRestore }))
    expect(screen.getByRole('link', { name: 'Terms' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Privacy' })).toBeTruthy()
    await fireEvent.press(screen.getByRole('link', { name: 'Restore purchases' }))
    expect(onRestore).toHaveBeenCalledTimes(1)
  })
})
