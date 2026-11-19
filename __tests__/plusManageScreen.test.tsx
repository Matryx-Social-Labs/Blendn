/**
 * Manage as its own screen (`app/plus-manage.tsx`, Flow 12 · 12.3, remaining-screens 03 A): one
 * card with what it includes, change or cancel in the store, Restore; a gift's plans to keep it,
 * each opening the page with that plan picked; and — only where a subscription ended — Start.
 * Somebody with nothing to manage is sent to the page. The server says what you have; the screen
 * never asks RevenueCat.
 *
 * Negative controls (the client keeps no registry): selling on every status (dropping `sells`)
 * fails "an active subscription is not sold to"; opening Manage from `/plus` itself (replacing
 * the page route with this one in `Start`) fails "Start opens the page, never itself".
 */
import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Linking } from 'react-native'

const mockToast = jest.fn()
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('expo-router', () => {
  const R = require('react')
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
    Stack: { Screen: () => null },
    useFocusEffect: (cb: () => void) => R.useEffect(cb, []),
  }
})
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} />, isGlassEffectAPIAvailable: jest.fn(() => true), isLiquidGlassAvailable: jest.fn(() => true) }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
jest.mock('../components/ds/Loader', () => ({ Spinner: () => null }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getMyPlus: jest.fn() } }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
jest.mock('../lib/plus', () => ({ ...jest.requireActual('../lib/plus'), waitForPlus: jest.fn() }))
jest.mock('../lib/purchases', () => ({
  ...jest.requireActual('../lib/purchases'),
  canBuyAs: jest.fn(),
  loadPlusOffers: jest.fn(),
  restore: jest.fn(),
  manageSubscriptionUrl: jest.fn(async () => 'https://apps.apple.com/account/subscriptions'),
}))

/* eslint-disable import/first */
import { router } from 'expo-router'
import PlusManageScreen from '../app/plus-manage'
import { apiClient } from '../lib/apiClient'
import { waitForPlus } from '../lib/plus'
import { canBuyAs, loadPlusOffers, restore } from '../lib/purchases'
/* eslint-enable import/first */

const status = (patch: object) => ({ success: true, data: { active: true, gated: true, product: 'plus', source: 'apple', expiresAt: '2026-11-03T12:00:00', ...patch } })
const monthly = { pkg: { identifier: '$rc_monthly', product: { price: 199 } }, price: '₹199' }
const yearly = { pkg: { identifier: '$rc_annual', product: { price: 1499, pricePerMonth: 124.92, pricePerMonthString: '₹125' } }, price: '₹1,499' }
const flush = async () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve() })
async function mount(res: unknown) {
  ;(apiClient.getMyPlus as jest.Mock).mockResolvedValue(res)
  await render(<PlusManageScreen />)
  await flush()
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(canBuyAs as jest.Mock).mockResolvedValue(true)
  ;(loadPlusOffers as jest.Mock).mockResolvedValue([monthly])
  ;(waitForPlus as jest.Mock).mockResolvedValue({ active: true })
})

describe('an active subscription', () => {
  // remaining-screens 03 A. Negative controls: the old "Manage in the App Store" row and a card with no checklist fail it.
  it('one card with what it includes, change or cancel in the store, Restore — and nothing to buy', async () => {
    await mount(status({}))
    expect(screen.getByRole('header', { name: 'Blend’n+' })).toBeTruthy()
    expect(screen.getByLabelText(/^Blend’n\+ · active\. Blend’n\+ until .* · App Store$/)).toBeTruthy()
    expect(screen.getByLabelText('Includes: Stay live while you’re there, Your full night history')).toBeTruthy()
    expect(screen.getByRole('link', { name: /^Change or cancel in the App Store, You keep Blend’n\+ until .*3.* if you cancel/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Restore purchases/ })).toBeTruthy()
    expect(screen.queryByTestId('plus-manage-start')).toBeNull()
    expect(screen.queryByTestId('plus-manage-plans')).toBeNull()
    expect(screen.getByText('Cancelling is one tap into the store. Nothing here asks you to stay.')).toBeTruthy()
    expect(loadPlusOffers).not.toHaveBeenCalled()
  })

  it('Google Play is named for Google Play', async () => {
    await mount(status({ source: 'google' }))
    expect(screen.getByRole('link', { name: /^Change or cancel in Google Play/ })).toBeTruthy()
  })

  it('the store row opens the store’s own page', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    await mount(status({}))
    await act(async () => { fireEvent.press(screen.getByRole('link', { name: /^Change or cancel in the App Store/ })) })
    expect(open).toHaveBeenCalledWith('https://apps.apple.com/account/subscriptions')
    open.mockRestore()
  })
})

// OD-5 (SYS-17): a Razorpay-sourced Plus has no store row and points nowhere.
describe('a Blend’n+ bought outside the app', () => {
  it('has no store row, no cancelling footer, and says it is managed outside the app', async () => {
    await mount(status({ source: 'razorpay', expiresAt: '2027-10-23T12:00:00' }))
    expect(screen.queryByTestId('plus-manage-store')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText(/Managed outside the app/)).toBeTruthy()
    expect(screen.queryByText(/Cancelling is one tap/)).toBeNull()
  })
})

// D4: a gift of ours is in no store. remaining-screens 03 A: said once ("a gift from Blend’n"), and the plans to keep it
// after its date open the page with that plan picked (decided 2026-11-19: the board draws no buy button here).
// Negative controls: drawing the store row for every card, or the old duplicated "Free until … · nothing to manage" line.
describe('a granted Blend’n+', () => {
  it('a gift, once: no store row, no word about cancelling, Restore says what it is for', async () => {
    await mount(status({ source: 'grant', expiresAt: '2027-10-23T12:00:00' }))
    expect(screen.getByLabelText('Blend’n+ · a gift from Blend’n. Until 23 Oct 2027 · nothing renews, nothing to pay')).toBeTruthy()
    expect(screen.queryByTestId('plus-manage-store')).toBeNull()
    expect(screen.queryByText(/nothing to manage/)).toBeNull()
    expect(screen.queryByText(/Cancelling is one tap/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Restore purchases, Bought it in a store before? Bring it back' })).toBeTruthy()
  })

  it('the plans to keep it after its date; a tap opens the page with that plan picked', async () => {
    ;(loadPlusOffers as jest.Mock).mockResolvedValue([monthly, yearly])
    await mount(status({ source: 'grant', expiresAt: '2027-10-23T12:00:00' }))
    expect(screen.getByRole('header', { name: 'Keep it after 23 Oct 2027' })).toBeTruthy()
    expect(screen.getByTestId('manage-plan-$rc_annual').props.accessibilityState.checked).toBe(true)
    await act(async () => { fireEvent.press(screen.getByTestId('manage-plan-$rc_monthly')) })
    expect(router.push).toHaveBeenCalledWith({ pathname: '/plus', params: { trigger: 'profile', plan: '$rc_monthly' } })
    // The picked one opens it too: a re-tap is passed on.
    await act(async () => { fireEvent.press(screen.getByTestId('manage-plan-$rc_annual')) })
    expect(router.push).toHaveBeenCalledWith({ pathname: '/plus', params: { trigger: 'profile', plan: '$rc_annual' } })
  })

  it('a Night Pass keeps the plans too; where Blend’n+ is not sold there are none', async () => {
    await mount(status({ product: 'night_pass', source: 'apple' }))
    expect(screen.getByTestId('manage-plan-$rc_monthly')).toBeTruthy()
    expect(screen.queryByTestId('plus-manage-store')).toBeNull()
    await screen.unmount()
    ;(loadPlusOffers as jest.Mock).mockClear()
    await mount(status({ source: 'grant', gated: false }))
    expect(screen.queryByTestId('plus-manage-plans')).toBeNull()
    expect(loadPlusOffers).not.toHaveBeenCalled()
  })
})

describe('where a subscription ended, and only there, it sells', () => {
  it('Start Blend’n+ at the store’s own price opens the page — never itself', async () => {
    await mount(status({ active: false, product: null, source: null, expiresAt: '2026-11-03T12:00:00', state: 'expired' }))
    expect(screen.getByLabelText(/Blend’n\+ ended\. It ended .*Everything you had is still yours to see/)).toBeTruthy()
    const start = screen.getByTestId('plus-manage-start')
    expect(start.props.accessibilityLabel).toBe('Start Monthly · ₹199 / month')
    await act(async () => { fireEvent.press(start) })
    expect(router.push).toHaveBeenCalledWith({ pathname: '/plus', params: { trigger: 'profile' } })
  })

  it('without a price from the store it still starts, with the words alone', async () => {
    ;(loadPlusOffers as jest.Mock).mockResolvedValue(null)
    await mount(status({ active: false, product: null, source: null, state: 'refunded' }))
    expect(screen.getByTestId('plus-manage-start').props.accessibilityLabel).toBe('Start Blend’n+')
    expect(screen.getByText('Start Blend’n+')).toBeTruthy()
  })
})

describe('a launch season', () => {
  it('sells nothing even when the server still says the subscription ended', async () => {
    await mount(status({ active: false, gated: false, product: null, source: null, state: 'expired' }))
    expect(screen.queryByTestId('plus-manage-start')).toBeNull()
    expect(screen.queryByText(/extras are locked/)).toBeNull()
    expect(screen.getByLabelText(/Free during launch\./)).toBeTruthy()
  })

  it('says nothing renews and that there is nothing to buy', async () => {
    await mount(status({ active: false, gated: false, product: null, source: null, expiresAt: null }))
    expect(screen.getByLabelText(/Free during launch\./)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Nothing to buy during launch' }).props.accessibilityState).toMatchObject({ disabled: true })
  })
})

describe('nothing to manage, or no answer', () => {
  it('somebody who never had it is sent to the page', async () => {
    await mount(status({ active: false, product: null, source: null, expiresAt: null }))
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/plus', params: { trigger: 'profile' } })
  })

  it('a server that does not answer says so, with Try again that asks again', async () => {
    await mount({ success: false, error: 'Request timed out' })
    expect(screen.getByRole('header', { name: 'Couldn’t load Blend’n+' })).toBeTruthy()
    ;(apiClient.getMyPlus as jest.Mock).mockResolvedValue(status({}))
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Try again' })) })
    await flush()
    expect(screen.getByLabelText(/Blend’n\+ · active/)).toBeTruthy()
  })
})

describe('Restore purchases', () => {
  const press = async () => {
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: /Restore purchases/ })) })
    await flush()
  }

  it('nothing to restore: a toast', async () => {
    ;(restore as jest.Mock).mockResolvedValue({ kind: 'nothing' })
    await mount(status({}))
    await press()
    expect(mockToast).toHaveBeenCalledWith('No purchases to restore', 'info')
  })

  it('a store that cannot be reached says so, with the error haptic', async () => {
    ;(restore as jest.Mock).mockResolvedValue({ kind: 'failed', message: "Couldn't reach the store. Try again." })
    await mount(status({}))
    await press()
    expect(mockToast).toHaveBeenCalledWith("Couldn't reach the store. Try again.", 'error', { haptic: 'error' })
  })

  it('restored: the server confirms, the card is read again', async () => {
    ;(restore as jest.Mock).mockResolvedValue({ kind: 'restored' })
    await mount(status({}))
    ;(apiClient.getMyPlus as jest.Mock).mockClear()
    await press()
    expect(mockToast).toHaveBeenCalledWith('Restored', 'success', { haptic: 'success' })
    expect(waitForPlus).toHaveBeenCalled()
    expect(apiClient.getMyPlus).toHaveBeenCalled()
  })

  it('a store account that is not this account cannot restore: it says so, and does not ask the store', async () => {
    ;(canBuyAs as jest.Mock).mockResolvedValue(false)
    await mount(status({}))
    await press()
    expect(restore).not.toHaveBeenCalled()
    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining("couldn’t connect your account"), 'error', { haptic: 'error' })
  })
})
