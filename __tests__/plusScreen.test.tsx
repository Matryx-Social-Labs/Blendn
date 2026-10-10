/**
 * The Blendn+ paywall as mounted (`app/plus.tsx`, plan v2 step 11): never
 * buys anonymously, the server and not the store says what you have, "Not
 * now" is there, and every way out is logged.
 */
import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ trigger: 'go_live_expiry' }),
}))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }))
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }))
jest.mock('../components/AppHeader', () => {
  const R = require('react')
  const { Pressable, Text } = require('react-native')
  return {
    AppHeader: ({ rightTextButton }: { rightTextButton: { label: string; onPress: () => void } }) =>
      R.createElement(Pressable, { onPress: rightTextButton.onPress }, R.createElement(Text, null, rightTextButton.label)),
  }
})
jest.mock('../components/ui/PlaceholderBanner', () => ({ PlaceholderBanner: () => null }))
jest.mock('../components/motion/ScalePress', () => ({ __esModule: true, default: require('react-native').Pressable }))
jest.mock('../components/ui/Text', () => ({ Text: require('react-native').Text }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getMyPlus: jest.fn(), logPaywallEvent: jest.fn(async () => ({ success: true })) } }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
jest.mock('../lib/purchases', () => ({
  purchasesAvailable: jest.fn(() => true),
  canBuyAs: jest.fn(),
  loadPlusOffers: jest.fn(),
  buyPackage: jest.fn(),
  restore: jest.fn(),
  manageSubscriptionUrl: jest.fn(async () => 'https://apps.apple.com/account/subscriptions'),
}))

/* eslint-disable import/first */
import { router } from 'expo-router'
import PlusScreen from '../app/plus'
import { apiClient } from '../lib/apiClient'
import { buyPackage, canBuyAs, loadPlusOffers, restore } from '../lib/purchases'
/* eslint-enable import/first */

const monthly = { pkg: { identifier: '$rc_monthly' }, title: 'Blendn+ · Monthly', length: '1 month, renews monthly', price: '₹199.00' }
const nightPass = { pkg: { identifier: 'night_pass' }, title: 'Night Pass · 24 hours', length: '24 hours, does not renew', price: '₹49.00' }
const none = { success: true, data: { active: false, product: null, source: null, expiresAt: null } }
const granted = { success: true, data: { active: true, product: 'plus', source: 'grant', expiresAt: '2026-11-10T10:00:00.000Z' } }
const logged = () => (apiClient.logPaywallEvent as jest.Mock).mock.calls.map((c) => c[0])

async function mount() {
  const view = await render(<PlusScreen />)
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  return view
}

beforeEach(() => {
  ;(apiClient.getMyPlus as jest.Mock).mockResolvedValue(none)
  ;(loadPlusOffers as jest.Mock).mockResolvedValue([monthly, nightPass])
  ;(canBuyAs as jest.Mock).mockResolvedValue(true)
})

it('lists the store\'s packages at the store\'s prices, says what Plus is, and logs "shown"', async () => {
  await mount()
  expect(screen.getByText('Blendn+ · Monthly')).toBeTruthy()
  expect(screen.getByText('₹199.00')).toBeTruthy()
  expect(screen.getByText('Night Pass · 24 hours')).toBeTruthy()
  expect(screen.getByText("Stay live while I'm here")).toBeTruthy()
  expect(screen.getByText('Terms of Use')).toBeTruthy()
  expect(screen.getByText('Privacy Policy')).toBeTruthy()
  expect(screen.getByText('Not now')).toBeTruthy()
  expect(apiClient.logPaywallEvent).toHaveBeenCalledWith('shown', 'go_live_expiry')
})

it('never buys while RevenueCat is not this account: the buttons are off and say so', async () => {
  ;(canBuyAs as jest.Mock).mockResolvedValue(false)
  await mount()
  expect(screen.getByText("Purchases aren't available yet.")).toBeTruthy()
  await act(async () => { fireEvent.press(screen.getByText('Blendn+ · Monthly')) })
  await act(async () => { fireEvent.press(screen.getByText('Restore purchases')) })
  expect(buyPackage).not.toHaveBeenCalled()
  expect(restore).not.toHaveBeenCalled()
})

it('a purchase is logged, then the SERVER is asked until it says active', async () => {
  ;(buyPackage as jest.Mock).mockResolvedValue({ kind: 'purchased' })
  ;(apiClient.getMyPlus as jest.Mock).mockResolvedValueOnce(none).mockResolvedValueOnce(granted)
  await mount()
  await act(async () => { fireEvent.press(screen.getByText('Blendn+ · Monthly')) })
  await act(async () => { await Promise.resolve() })
  expect(buyPackage).toHaveBeenCalledWith(monthly.pkg)
  expect(logged()).toEqual(['shown', 'purchase_started', 'purchased'])
  expect(screen.getByText("You're in.")).toBeTruthy()
  expect(screen.getByText(/^Blendn\+ until /)).toBeTruthy()
})

it('a cancelled purchase changes nothing and asks nothing', async () => {
  ;(buyPackage as jest.Mock).mockResolvedValue({ kind: 'cancelled' })
  await mount()
  ;(apiClient.getMyPlus as jest.Mock).mockClear()
  await act(async () => { fireEvent.press(screen.getByText('Night Pass · 24 hours')) })
  expect(apiClient.getMyPlus).not.toHaveBeenCalled()
  expect(logged()).toEqual(['shown', 'purchase_started'])
})

it('restore with nothing to restore says so', async () => {
  ;(restore as jest.Mock).mockResolvedValue({ kind: 'nothing' })
  await mount()
  await act(async () => { fireEvent.press(screen.getByText('Restore purchases')) })
  expect(screen.getByText('No purchases to restore')).toBeTruthy()
})

it('with Plus already on, the packages stay listed and buyable (App Review buys with a granted account)', async () => {
  ;(apiClient.getMyPlus as jest.Mock).mockResolvedValue(granted)
  ;(buyPackage as jest.Mock).mockResolvedValue({ kind: 'cancelled' })
  await mount()
  expect(screen.getByText(/^Blendn\+ until /)).toBeTruthy()
  await act(async () => { fireEvent.press(screen.getByText('Blendn+ · Monthly')) })
  expect(buyPackage).toHaveBeenCalled()
})

it('"Not now" closes, and leaving without buying is logged as dismissed; after a purchase it is not', async () => {
  const first = await mount()
  await act(async () => { fireEvent.press(screen.getByText('Not now')) })
  expect(router.back).toHaveBeenCalled()
  await act(async () => { first.unmount() })
  expect(logged()).toEqual(['shown', 'dismissed'])

  ;(apiClient.logPaywallEvent as jest.Mock).mockClear()
  ;(buyPackage as jest.Mock).mockResolvedValue({ kind: 'purchased' })
  ;(apiClient.getMyPlus as jest.Mock).mockResolvedValue(granted)
  const second = await mount()
  await act(async () => { fireEvent.press(screen.getByText('Blendn+ · Monthly')) })
  await act(async () => { second.unmount() })
  expect(logged()).not.toContain('dismissed')
})
