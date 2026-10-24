/**
 * The Tonight sheet as the app draws it (Flow 12 · 12.1), every purchase state: loading
 * (the asks before it opens), offline (no prices → the page), launch season (never opens),
 * cancelled, failed, pending, purchased, restored. The store sells and the server unlocks,
 * so a purchase that the server has not granted is "taking longer", never "you're in".
 *
 * Negative controls (the client keeps no registry): removing the `!plus.data.gated` check fails
 * "in a launch season it never opens"; letting `waitForPlus` returning null fall through to the
 * unlocked path fails "a grant that has not landed says so and unlocks nothing".
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'

const mockShowToast = jest.fn()
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
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
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getMyPlus: jest.fn(), logPaywallEvent: jest.fn(async () => ({ success: true })) } }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
jest.mock('../lib/sheetDismissed', () => ({ ...jest.requireActual('../lib/sheetDismissed'), afterSheetDismissed: () => Promise.resolve() }))
jest.mock('../lib/links', () => ({ ...jest.requireActual('../lib/links'), openInApp: jest.fn(async () => {}) }))
jest.mock('../lib/sheet', () => ({ ...jest.requireActual('../lib/sheet'), showSheet: jest.fn() }))
jest.mock('../lib/purchases', () => ({
  ...jest.requireActual('../lib/purchases'),
  loadPlusOffers: jest.fn(),
  canBuyAs: jest.fn(),
  buyPackage: jest.fn(),
  restore: jest.fn(),
  manageSubscriptionUrl: jest.fn(async () => 'https://apps.apple.com/account/subscriptions'),
}))
jest.mock('../lib/plus', () => ({ ...jest.requireActual('../lib/plus'), waitForPlus: jest.fn() }))

/* eslint-disable import/first */
import { router } from 'expo-router'
import { TonightHost, LAUNCH_TOAST, SLOW_GRANT_TOAST } from '../components/plus/TonightHost'
import { apiClient } from '../lib/apiClient'
import { openInApp } from '../lib/links'
import { notePathname, openTonight, resetPaywallSession, subscribePaywallClosed } from '../lib/paywall'
import { waitForPlus } from '../lib/plus'
import { buyPackage, canBuyAs, loadPlusOffers, restore, NIGHT_PASS_ID } from '../lib/purchases'
import { showSheet } from '../lib/sheet'
/* eslint-enable import/first */

const offer = (identifier: string, price: number, priceString: string) => ({ pkg: { identifier, product: { price, priceString } }, title: '', length: '', price: priceString })
const OFFERS = [offer('$rc_monthly', 199, '₹199'), offer(NIGHT_PASS_ID, 49, '₹49')]
const gatedNoPlus = { success: true, data: { active: false, gated: true, product: null, source: null, expiresAt: null } }

const onFree = jest.fn()
const onUnlocked = jest.fn()
const request = { trigger: 'stay' as const, venue: 'Toit', onFree, onUnlocked }
const closed: string[] = []

async function openSheet(req: Parameters<typeof openTonight>[0] = request) {
  await render(<TonightHost />)
  await act(async () => {
    await openTonight(req, { userInitiated: true })
  })
}
const flush = async () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve() })
const press = async (name: string) => {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }))
  })
}

beforeEach(async () => {
  jest.clearAllMocks()
  closed.length = 0
  resetPaywallSession()
  notePathname('/venue/v1')
  await require('@react-native-async-storage/async-storage').clear()
  ;(apiClient.getMyPlus as jest.Mock).mockResolvedValue(gatedNoPlus)
  ;(loadPlusOffers as jest.Mock).mockResolvedValue(OFFERS)
  ;(canBuyAs as jest.Mock).mockResolvedValue(true)
  ;(waitForPlus as jest.Mock).mockResolvedValue({ active: true })
})
beforeAll(() => {
  subscribePaywallClosed((how) => closed.push(how))
})

const events = () => (apiClient.logPaywallEvent as jest.Mock).mock.calls.map((c) => c[0])

describe('before anybody asks', () => {
  it('the prices are warmed for the signed-in account, once the store knows it', async () => {
    await render(<TonightHost />)
    await flush()
    expect(canBuyAs).toHaveBeenCalledWith('u1')
    expect(loadPlusOffers).toHaveBeenCalledTimes(1)
  })

  it('a store that does not know this account is not asked for prices', async () => {
    ;(canBuyAs as jest.Mock).mockResolvedValue(false)
    await render(<TonightHost />)
    await flush()
    expect(loadPlusOffers).not.toHaveBeenCalled()
  })
})

describe('opening it', () => {
  it('draws the Stay tap with the store’s two prices, the Night Pass first and picked, and logs it shown', async () => {
    await openSheet()
    expect(screen.getByRole('header', { name: 'Stay live while you’re here' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue — ₹49' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Go live for 1 hour — free' })).toBeTruthy()
    expect(events()).toEqual(['shown'])
    expect(apiClient.logPaywallEvent).toHaveBeenCalledWith('shown', 'go_live_expiry')
  })

  it('in a launch season it never opens: a toast says why', async () => {
    ;(apiClient.getMyPlus as jest.Mock).mockResolvedValue({ success: true, data: { active: false, gated: false, product: null, source: null, expiresAt: null } })
    await openSheet()
    expect(screen.queryByRole('header', { name: 'Stay live while you’re here' })).toBeNull()
    expect(mockShowToast).toHaveBeenCalledWith(LAUNCH_TOAST, 'info')
    expect(events()).toEqual([])
  })

  it('offline or unpriced: the page opens, which has the words for it', async () => {
    ;(loadPlusOffers as jest.Mock).mockResolvedValue(null)
    await openSheet()
    expect(router.push).toHaveBeenCalledWith({ pathname: '/plus', params: { trigger: 'go_live_expiry' } })
    expect(screen.queryByRole('header', { name: 'Stay live while you’re here' })).toBeNull()
  })

  it('a store that cannot price both things sells nothing here', async () => {
    ;(loadPlusOffers as jest.Mock).mockResolvedValue([offer('$rc_monthly', 199, '₹199')])
    await openSheet()
    expect(router.push).toHaveBeenCalled()
  })

  it('a store account that is not this account cannot buy: the page', async () => {
    ;(canBuyAs as jest.Mock).mockResolvedValue(false)
    await openSheet()
    expect(router.push).toHaveBeenCalled()
  })

  it('the earlier nights say so, and their free path is "Not now"', async () => {
    await openSheet({ trigger: 'night', venue: '' })
    expect(screen.getByRole('header', { name: 'Your earlier nights' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy()
    expect(apiClient.logPaywallEvent).toHaveBeenCalledWith('shown', 'recap')
  })
})

describe('the way on that costs nothing', () => {
  it('the free path closes the sheet and does the free thing, and counts as a dismissal', async () => {
    await openSheet()
    await press('Go live for 1 hour — free')
    expect(onFree).toHaveBeenCalledTimes(1)
    expect(events()).toEqual(['shown', 'dismissed'])
    expect(closed).toEqual(['dismissed'])
  })

  it('"Not now" on a perk-less lock only closes', async () => {
    await openSheet({ trigger: 'night', venue: '' })
    await press('Not now')
    expect(onFree).not.toHaveBeenCalled()
    expect(closed).toEqual(['dismissed'])
  })

  it('See all plans opens the page on the same trigger, and is not a dismissal', async () => {
    await openSheet()
    await press('See all plans')
    expect(router.push).toHaveBeenCalledWith({ pathname: '/plus', params: { trigger: 'go_live_expiry' } })
    expect(events()).toEqual(['shown'])
    // The page says how it closed when it unmounts; this sheet's own closing says nothing.
    expect(closed).toEqual([])
  })

  it('Terms opens our own page in the app', async () => {
    await openSheet()
    await act(async () => {
      fireEvent.press(screen.getByRole('link', { name: 'Terms' }))
    })
    expect(openInApp).toHaveBeenCalledWith('https://blendn.app/terms')
  })
})

describe('the store’s terms (App Store 3.1.2 / Play)', () => {
  it('the monthly pick shows renewal and cancellation on the sheet that sells it; the Night Pass says it is a one-off', async () => {
    await openSheet()
    // No currency on these offers, and the host passes no `tax` yet: no GST sentence (D2).
    expect(screen.getByTestId('tonight-legal').props.children).toBe('Night Pass is a one-off.')
    await act(async () => {
      fireEvent.press(screen.getAllByRole('radio')[1])
    })
    const terms = String(screen.getByTestId('tonight-legal').props.children)
    expect(terms).toMatch(/renew automatically/)
    expect(terms).toMatch(/cancel/i)
    expect(terms).not.toMatch(/GST/)
  })
})

describe('buying', () => {
  it('purchased: the server grants it, the Stay goes live by itself, and nobody is told "bought" twice', async () => {
    ;(buyPackage as jest.Mock).mockResolvedValue({ kind: 'purchased' })
    await openSheet()
    await press('Continue — ₹49')
    expect(buyPackage).toHaveBeenCalledWith(OFFERS[1].pkg, 'u1')
    expect(waitForPlus).toHaveBeenCalled()
    expect(onUnlocked).toHaveBeenCalledTimes(1)
    expect(mockShowToast).not.toHaveBeenCalled()
    expect(events()).toEqual(['shown', 'purchase_started', 'purchased'])
    expect(closed).toEqual(['done'])
  })

  it('Monthly picked buys Monthly', async () => {
    ;(buyPackage as jest.Mock).mockResolvedValue({ kind: 'purchased' })
    await openSheet()
    await act(async () => {
      fireEvent.press(screen.getAllByRole('radio')[1])
    })
    await press('Continue — ₹199')
    expect(buyPackage).toHaveBeenCalledWith(OFFERS[0].pkg, 'u1')
  })

  it('a lock that is not a go-live is told what was bought, with the success haptic', async () => {
    ;(buyPackage as jest.Mock).mockResolvedValue({ kind: 'purchased' })
    await openSheet({ trigger: 'night', venue: '', onUnlocked })
    await press('Continue — ₹49')
    expect(mockShowToast).toHaveBeenCalledWith('Blend’n+ · Night Pass · 24 hours', 'success', { haptic: 'success' })
    // The lock is lifted: Going reads the earlier nights again.
    expect(onUnlocked).toHaveBeenCalledTimes(1)
  })

  it('a grant that has not landed says so and unlocks nothing', async () => {
    ;(buyPackage as jest.Mock).mockResolvedValue({ kind: 'purchased' })
    ;(waitForPlus as jest.Mock).mockResolvedValue(null)
    await openSheet()
    await press('Continue — ₹49')
    expect(onUnlocked).not.toHaveBeenCalled()
    expect(mockShowToast).toHaveBeenCalledWith(SLOW_GRANT_TOAST, 'info')
  })

  it('cancelled: nothing was charged, and the sheet stays for another try', async () => {
    ;(buyPackage as jest.Mock).mockResolvedValue({ kind: 'cancelled' })
    await openSheet()
    await press('Continue — ₹49')
    expect(screen.getByText('Nothing was charged.')).toBeTruthy()
    expect(closed).toEqual([])
    expect(waitForPlus).not.toHaveBeenCalled()
  })

  it('failed with the default sentence: "Nothing was charged", Try again', async () => {
    ;(buyPackage as jest.Mock).mockResolvedValue({ kind: 'failed', message: "The purchase didn’t go through. Try again." })
    await openSheet()
    await press('Continue — ₹49')
    expect(screen.getByText('The store couldn’t complete it. Nothing was charged.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again — ₹49' })).toBeTruthy()
    expect(showSheet).not.toHaveBeenCalled()
  })

  it('failed with its own words (Screen Time, another account): a tray carries them in full, after the sheet has gone', async () => {
    ;(buyPackage as jest.Mock).mockResolvedValue({ kind: 'failed', message: "Purchases aren't allowed on this device. Check Screen Time or your store's settings." })
    await openSheet()
    await press('Continue — ₹49')
    expect(showSheet).toHaveBeenCalledWith(expect.objectContaining({ title: 'The purchase didn’t go through', message: expect.stringContaining('Screen Time') }))
    expect(closed).toEqual(['dismissed'])
  })

  it('already purchased: the tray points at Manage subscription', async () => {
    ;(buyPackage as jest.Mock).mockResolvedValue({ kind: 'failed', message: 'You already have this.', manage: true })
    await openSheet()
    await press('Continue — ₹49')
    expect(showSheet).toHaveBeenCalledWith(expect.objectContaining({ title: 'Already purchased', actions: expect.arrayContaining([expect.objectContaining({ label: 'Manage subscription' })]) }))
  })

  it('pending: the sheet waits with the store, polls nothing, and Continue steps back', async () => {
    ;(buyPackage as jest.Mock).mockResolvedValue({ kind: 'pending' })
    await openSheet()
    await press('Continue — ₹49')
    expect(screen.getByText(/Waiting for the App Store to confirm/)).toBeTruthy()
    expect(waitForPlus).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Continue — ₹49' }).props.accessibilityState).toMatchObject({ disabled: true })
    // Leaving it is not a dismissal: something is in the store's hands.
    expect(events()).toEqual(['shown', 'purchase_started'])
  })

  it('closed while the purchase is confirming is not a decline: the prompt behind it does not come back', async () => {
    let grant!: (v: unknown) => void
    ;(waitForPlus as jest.Mock).mockReturnValue(new Promise((resolve) => (grant = resolve)))
    ;(buyPackage as jest.Mock).mockResolvedValue({ kind: 'purchased' })
    await openSheet()
    await press('Continue — ₹49')
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }))
    })
    expect(closed).toEqual(['done'])
    expect(events()).not.toContain('dismissed')
    await act(async () => grant({ active: true }))
    // The grant lands after: the lock still works, and the prompt is not told twice.
    expect(onUnlocked).toHaveBeenCalledTimes(1)
    expect(closed).toEqual(['done'])
  })

  it('a grant that never lands is not "done": the prompt behind it may come back for the free way on', async () => {
    ;(buyPackage as jest.Mock).mockResolvedValue({ kind: 'purchased' })
    ;(waitForPlus as jest.Mock).mockResolvedValue(null)
    await openSheet()
    await press('Continue — ₹49')
    expect(closed).toEqual(['dismissed'])
  })

  it('a second tap while the store is up is one purchase', async () => {
    let finish!: (v: unknown) => void
    ;(buyPackage as jest.Mock).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    await openSheet()
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Continue — ₹49' }))
      fireEvent.press(screen.getByRole('button', { name: 'Continue — ₹49' }))
    })
    expect(buyPackage).toHaveBeenCalledTimes(1)
    await act(async () => finish({ kind: 'cancelled' }))
  })
})

describe('restoring', () => {
  it('nothing to restore is a toast, and the sheet stays', async () => {
    ;(restore as jest.Mock).mockResolvedValue({ kind: 'nothing' })
    await openSheet()
    await act(async () => {
      fireEvent.press(screen.getByRole('link', { name: 'Restore purchases' }))
    })
    expect(mockShowToast).toHaveBeenCalledWith('No purchases to restore', 'info')
    expect(closed).toEqual([])
  })

  it('a failed restore says what the store said, with the error haptic', async () => {
    ;(restore as jest.Mock).mockResolvedValue({ kind: 'failed', message: "Couldn't reach the store. Try again." })
    await openSheet()
    await act(async () => {
      fireEvent.press(screen.getByRole('link', { name: 'Restore purchases' }))
    })
    expect(mockShowToast).toHaveBeenCalledWith("Couldn't reach the store. Try again.", 'error', { haptic: 'error' })
  })

  it('while the store is asked, the link says so', async () => {
    let answer!: (v: unknown) => void
    ;(restore as jest.Mock).mockReturnValue(new Promise((resolve) => (answer = resolve)))
    await openSheet()
    await act(async () => {
      fireEvent.press(screen.getByRole('link', { name: 'Restore purchases' }))
    })
    expect(screen.getByRole('link', { name: 'Restoring…' })).toBeTruthy()
    await act(async () => answer({ kind: 'nothing' }))
    expect(screen.getByRole('link', { name: 'Restore purchases' })).toBeTruthy()
  })

  it('restored: the server confirms, the lock works, and it is logged', async () => {
    ;(restore as jest.Mock).mockResolvedValue({ kind: 'restored' })
    await openSheet()
    await act(async () => {
      fireEvent.press(screen.getByRole('link', { name: 'Restore purchases' }))
    })
    expect(waitForPlus).toHaveBeenCalled()
    expect(onUnlocked).toHaveBeenCalledTimes(1)
    expect(events()).toContain('restored')
    expect(closed).toEqual(['done'])
  })
})

describe('leaving it', () => {
  it('opens again after it closed (the host is not spent by one sale)', async () => {
    await openSheet()
    await press('Go live for 1 hour — free')
    resetPaywallSession()
    await act(async () => {
      await openTonight(request, { userInitiated: true })
    })
    expect(screen.getByRole('button', { name: 'Continue — ₹49' })).toBeTruthy()
    expect(events().filter((e: string) => e === 'shown')).toHaveLength(2)
  })
})
