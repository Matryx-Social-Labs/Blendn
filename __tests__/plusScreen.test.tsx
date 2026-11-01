/**
 * The Blend'n+ page as mounted (`app/plus.tsx`, Flow 12 · 12.2): never buys
 * anonymously, the server and not the store says what you have, "Not now" is
 * there, every way out is logged, and every state the design draws is on it.
 */
import React from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'
import { AccessibilityInfo, Linking } from 'react-native'
import * as WebBrowser from 'expo-web-browser'

const mockTrigger = { value: 'go_live_expiry' }
const mockToast = jest.fn()
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('expo-router', () => ({
  // A router modal holds the screen while focused (components/system/RouteModal): here it is focused while mounted.
  // A router modal releases the screen on its transitionEnd (components/system/RouteModal): no navigator here.
  useNavigation: () => undefined,
  useFocusEffect: (effect: () => void | (() => void)) => require('react').useEffect(effect, [effect]),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ trigger: mockTrigger.value }),
}))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
jest.mock('../components/ds/Orbs', () => ({ Orbs: () => null }))
// Its endless withRepeat would run ~3,800 frames through the 61 s fake-timer walk below.
jest.mock('../components/ds/Loader', () => ({ Spinner: () => null }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getMyPlus: jest.fn(), logPaywallEvent: jest.fn(async () => ({ success: true })) } }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
jest.mock('../lib/purchases', () => ({
  ...jest.requireActual('../lib/purchases'),
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
import { subscribePaywallClosed } from '../lib/paywall'
import { buyPackage, canBuyAs, loadPlusOffers, purchasesAvailable, restore } from '../lib/purchases'
import { showSheet } from '../lib/sheet'
import { dismissModals, LINK_HOLD_MAX_MS } from '../lib/pendingRoute'
/* eslint-enable import/first */

const monthly = { pkg: { identifier: '$rc_monthly', product: { price: 199, pricePerMonth: 199, pricePerMonthString: '₹199' } }, title: 'Blendn+ · Monthly', length: '1 month, renews monthly', price: '₹199.00' }
const yearly = { pkg: { identifier: '$rc_annual', product: { price: 1499, pricePerMonth: 124.92, pricePerMonthString: '₹125' } }, title: 'Blendn+ · Yearly', length: '1 year, renews yearly', price: '₹1,499.00' }
const nightPass = { pkg: { identifier: 'night_pass', product: { price: 49, pricePerMonth: 49, pricePerMonthString: '₹49' } }, title: 'Night Pass · 24 hours', length: '24 hours, does not renew', price: '₹49.00' }
const none = { success: true, data: { active: false, gated: true, product: null, source: null, expiresAt: null } }
const granted = { success: true, data: { active: true, gated: true, product: 'plus', source: 'grant', expiresAt: '2026-11-10T10:00:00.000Z' } }
const subscribed = { success: true, data: { active: true, gated: true, product: 'plus', source: 'apple', expiresAt: '2026-11-10T10:00:00.000Z' } }
const pass = { success: true, data: { active: true, gated: true, product: 'night_pass', source: 'google', expiresAt: '2026-10-11T00:30:00.000Z' } }
const launch = { success: true, data: { ...none.data, gated: false } }
const logged = () => (apiClient.logPaywallEvent as jest.Mock).mock.calls.map((c) => c[0])

/** The clock walk is ~1 s alone and several on a loaded machine (a full parallel run): it gets room, and a timeout cannot leave fake timers on for the tests after it. */
const CLOCK_WALK_TIMEOUT_MS = 30_000

const MONTHLY_CTA = 'Start Blend’n+ — ₹199.00 / month'
const NIGHT_CTA = 'Get the Night Pass — ₹49.00'
const button = (name: string) => screen.getByRole('button', { name })
const plan = (id: string) => screen.getByTestId(`plan-${id}`)

async function mount() {
  const view = await render(<PlusScreen />)
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  return view
}

afterEach(() => jest.useRealTimers())

beforeEach(() => {
  mockTrigger.value = 'go_live_expiry'
  mockToast.mockClear()
  ;(apiClient.getMyPlus as jest.Mock).mockReset().mockResolvedValue(none)
  ;(buyPackage as jest.Mock).mockReset()
  ;(restore as jest.Mock).mockReset()
  ;(showSheet as jest.Mock).mockReset()
  ;(purchasesAvailable as jest.Mock).mockReturnValue(true)
  ;(loadPlusOffers as jest.Mock).mockResolvedValue([monthly, nightPass])
  ;(canBuyAs as jest.Mock).mockResolvedValue(true)
})

it('lists the store\'s packages at the store\'s prices, says what Plus is, and logs "shown"', async () => {
  await mount()
  expect(plan('$rc_monthly').props.accessibilityLabel).toBe('Monthly, 199.00 rupees a month')
  expect(screen.getAllByText('₹199.00', { includeHiddenElements: true }).length).toBeGreaterThanOrEqual(1)
  expect(plan('night_pass').props.accessibilityLabel).toBe('Night Pass, 49.00 rupees, 24 hours · doesn’t renew')
  expect(screen.getAllByText('₹49.00', { includeHiddenElements: true }).length).toBeGreaterThanOrEqual(1)
  expect(screen.getByText('Stay live while you’re there')).toBeTruthy()
  expect(screen.getByText('Never for sale, on any plan')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Terms' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Privacy' })).toBeTruthy()
  expect(screen.getByText('Not now')).toBeTruthy()
  expect(apiClient.logPaywallEvent).toHaveBeenCalledWith('shown', 'go_live_expiry')
})

it('a yearly row carries the store-computed savings under its name', async () => {
  ;(loadPlusOffers as jest.Mock).mockResolvedValue([monthly, yearly, nightPass])
  await mount()
  expect(plan('$rc_annual').props.accessibilityLabel).toBe('Yearly, 1,499.00 rupees a year, About ₹125 a month · Save\u00A037%')
})

it('Monthly is picked first, the Night Pass is set apart, and the dock carries the picked price', async () => {
  ;(loadPlusOffers as jest.Mock).mockResolvedValue([monthly, yearly, nightPass])
  await mount()
  expect(plan('$rc_monthly').props.accessibilityState.checked).toBe(true)
  expect(plan('night_pass').props.accessibilityState.checked).toBe(false)
  expect(screen.getByTestId('plus-plans-apart')).toBeTruthy()
  expect(button(MONTHLY_CTA)).toBeTruthy()
  await act(async () => { fireEvent.press(plan('night_pass')) })
  expect(plan('night_pass').props.accessibilityState.checked).toBe(true)
  expect(button(NIGHT_CTA)).toBeTruthy()
  await act(async () => { fireEvent.press(plan('$rc_annual')) })
  expect(button('Start Blend’n+ — ₹1,499.00 / year')).toBeTruthy()
})

// D22 (App Review 2.1 / 3.1.2): sell what exists, and name nothing else. Negative control: the old "Coming soon" rows and
// the "On the way: partner perks, cosmetics and crew extras." line both fail it.
it('lists the shipped features only, and names nothing unbuilt, not even as on the way', async () => {
  await mount()
  expect(screen.getByLabelText(/^Stay live while you’re there\./)).toBeTruthy()
  expect(screen.queryByText('Coming soon')).toBeNull()
  expect(screen.queryByText(/on the way/i)).toBeNull()
  expect(screen.queryByText(/partner perks|cosmetics|crew extras/i)).toBeNull()
  expect(screen.queryByLabelText(/^Partner perks\./)).toBeNull()
})

it('never buys while RevenueCat is not this account: the plans and the button are off and say so', async () => {
  ;(canBuyAs as jest.Mock).mockResolvedValue(false)
  await mount()
  expect(screen.getByText('Purchases aren’t available yet.')).toBeTruthy()
  expect(button(MONTHLY_CTA).props.accessibilityState.disabled).toBe(true)
  await act(async () => { fireEvent.press(button(MONTHLY_CTA)) })
  await act(async () => { fireEvent.press(button('Restore purchases')) })
  expect(buyPackage).not.toHaveBeenCalled()
  expect(restore).not.toHaveBeenCalled()
})

it('a purchase is logged, then the SERVER is asked until it says active', async () => {
  ;(buyPackage as jest.Mock).mockResolvedValue({ kind: 'purchased' })
  ;(apiClient.getMyPlus as jest.Mock).mockResolvedValueOnce(none).mockResolvedValueOnce(granted)
  await mount()
  await act(async () => { fireEvent.press(button(MONTHLY_CTA)) })
  await act(async () => { await Promise.resolve() })
  expect(buyPackage).toHaveBeenCalledWith(monthly.pkg, 'u1')
  expect(logged()).toEqual(['shown', 'purchase_started', 'purchased'])
  expect(screen.getByText("You’re in.")).toBeTruthy()
  expect(screen.getByText(/^Blend’n\+ until /)).toBeTruthy()
})

it('buys the package that is picked, not the first', async () => {
  ;(buyPackage as jest.Mock).mockResolvedValue({ kind: 'cancelled' })
  await mount()
  await act(async () => { fireEvent.press(plan('night_pass')) })
  await act(async () => { fireEvent.press(button(NIGHT_CTA)) })
  expect(buyPackage).toHaveBeenCalledWith(nightPass.pkg, 'u1')
})

describe('a link that arrives mid-purchase or mid-restore waits for it (review LOW: never close the page under the store)', () => {
  /** Whether a link's dismissal has gone ahead (lib/pendingRoute `dismissModals`, the one every link and tap awaits). */
  const linkWent = () => {
    const went = { value: false }
    void dismissModals().then(() => {
      went.value = true
    })
    return went
  }

  it('a purchase holds it until the store answers', async () => {
    let answer: (v: unknown) => void = () => {}
    ;(buyPackage as jest.Mock).mockReturnValue(new Promise((r) => { answer = r }))
    await mount()
    await act(async () => { fireEvent.press(plan('night_pass')) })
    await act(async () => { fireEvent.press(button(NIGHT_CTA)) })

    const went = linkWent()
    await act(async () => { await Promise.resolve() })
    expect(went.value).toBe(false)

    await act(async () => { answer({ kind: 'cancelled' }) })
    expect(went.value).toBe(true)
  })

  it('a restore holds it too', async () => {
    let land: (v: unknown) => void = () => {}
    ;(restore as jest.Mock).mockReturnValue(new Promise((r) => { land = r }))
    await mount()
    await act(async () => { fireEvent.press(button('Restore purchases')) })

    const went = linkWent()
    await act(async () => { await Promise.resolve() })
    expect(went.value).toBe(false)

    await act(async () => { land({ kind: 'nothing' }) })
    expect(went.value).toBe(true)
  })

  it('but not forever: after LINK_HOLD_MAX_MS the link goes anyway', async () => {
    jest.useFakeTimers()
    ;(buyPackage as jest.Mock).mockReturnValue(new Promise(() => {}))
    await mount()
    await act(async () => { fireEvent.press(plan('night_pass')) })
    await act(async () => { fireEvent.press(button(NIGHT_CTA)) })

    const went = linkWent()
    await act(async () => { jest.advanceTimersByTime(LINK_HOLD_MAX_MS - 1) })
    expect(went.value).toBe(false)
    await act(async () => { jest.advanceTimersByTime(1) })
    expect(went.value).toBe(true)
  })

  it('with nothing in flight it does not wait', async () => {
    await mount()
    const went = linkWent()
    await act(async () => { await Promise.resolve() })
    expect(went.value).toBe(true)
  })
})

it('a cancelled purchase changes nothing and asks nothing', async () => {
  ;(buyPackage as jest.Mock).mockResolvedValue({ kind: 'cancelled' })
  await mount()
  ;(apiClient.getMyPlus as jest.Mock).mockClear()
  await act(async () => { fireEvent.press(plan('night_pass')) })
  await act(async () => { fireEvent.press(button(NIGHT_CTA)) })
  expect(apiClient.getMyPlus).not.toHaveBeenCalled()
  expect(showSheet).not.toHaveBeenCalled()
  expect(logged()).toEqual(['shown', 'purchase_started'])
})

describe('restore always ends in a visible result', () => {
  const dock = () => screen.getByTestId('plus-dock')

  it('nothing to restore: a toast, and the words stay in the dock after the toast is gone', async () => {
    ;(restore as jest.Mock).mockResolvedValue({ kind: 'nothing' })
    await mount()
    await act(async () => { fireEvent.press(button('Restore purchases')) })
    expect(mockToast).toHaveBeenCalledWith('No purchases to restore', 'info')
    expect(within(dock()).getByText('No purchases to restore')).toBeTruthy()
  })

  it('failing: an error toast, the reason in the dock, and the error haptic', async () => {
    ;(restore as jest.Mock).mockResolvedValue({ kind: 'failed', message: "Couldn’t reach the store. Try again." })
    await mount()
    await act(async () => { fireEvent.press(button('Restore purchases')) })
    expect(mockToast).toHaveBeenCalledWith("Couldn’t reach the store. Try again.", 'error', { haptic: 'error' })
    expect(within(dock()).getByText("Couldn’t reach the store. Try again.")).toBeTruthy()
  })

  it('restoring: "Restoring…" while it waits, gone when it answers', async () => {
    let land: (v: unknown) => void = () => {}
    ;(restore as jest.Mock).mockReturnValue(new Promise((r) => { land = r }))
    await mount()
    await act(async () => { fireEvent.press(button('Restore purchases')) })
    expect(within(dock()).getByText('Restoring…')).toBeTruthy()
    await act(async () => { land({ kind: 'nothing' }) })
    expect(within(dock()).queryByText('Restoring…')).toBeNull()
  })

  it('found something: "Restored", then the server is asked, then "You’re in."', async () => {
    ;(restore as jest.Mock).mockResolvedValue({ kind: 'restored' })
    ;(apiClient.getMyPlus as jest.Mock).mockResolvedValueOnce(none).mockResolvedValue(granted)
    await mount()
    await act(async () => { fireEvent.press(button('Restore purchases')) })
    await act(async () => { await Promise.resolve() })
    expect(mockToast).toHaveBeenCalledWith('Restored', 'success')
    expect(logged()).toEqual(['shown', 'restored'])
    expect(within(dock()).getByText("You’re in.")).toBeTruthy()
  })

  it('a store answer after "didn\'t answer" replaces that message', async () => {
    let late: (o: unknown) => void = () => {}
    ;(restore as jest.Mock).mockImplementation(async (_u: string, onLate: (o: unknown) => void) => {
      late = onLate
      return { kind: 'failed', message: "The store didn’t answer. Try again." }
    })
    await mount()
    await act(async () => { fireEvent.press(button('Restore purchases')) })
    expect(within(dock()).getByText("The store didn’t answer. Try again.")).toBeTruthy()
    await act(async () => { late({ kind: 'nothing' }) })
    expect(within(dock()).getByText('No purchases to restore')).toBeTruthy()
    expect(within(dock()).queryByText("The store didn’t answer. Try again.")).toBeNull()
  })

  it('a late find is confirmed with the server like any restore', async () => {
    let late: (o: unknown) => void = () => {}
    ;(restore as jest.Mock).mockImplementation(async (_u: string, onLate: (o: unknown) => void) => {
      late = onLate
      return { kind: 'failed', message: "The store didn’t answer. Try again." }
    })
    ;(apiClient.getMyPlus as jest.Mock).mockResolvedValueOnce(none).mockResolvedValue(granted)
    await mount()
    await act(async () => { fireEvent.press(button('Restore purchases')) })
    await act(async () => { late({ kind: 'restored' }) })
    await act(async () => { await Promise.resolve() })
    expect(mockToast).toHaveBeenCalledWith('Restored', 'success')
    expect(within(dock()).getByText("You’re in.")).toBeTruthy()
  })

  it('starting a purchase clears the last restore result, so it never sits above Buy', async () => {
    ;(restore as jest.Mock).mockResolvedValue({ kind: 'nothing' })
    ;(buyPackage as jest.Mock).mockResolvedValue({ kind: 'cancelled' })
    await mount()
    await act(async () => { fireEvent.press(button('Restore purchases')) })
    expect(within(dock()).getByText('No purchases to restore')).toBeTruthy()
    await act(async () => { fireEvent.press(button(MONTHLY_CTA)) })
    expect(within(dock()).queryByText('No purchases to restore')).toBeNull()
    expect(button(MONTHLY_CTA)).toBeTruthy()
  })

  it('the next tap clears the last result', async () => {
    ;(restore as jest.Mock).mockResolvedValueOnce({ kind: 'nothing' }).mockReturnValue(new Promise(() => {}))
    await mount()
    await act(async () => { fireEvent.press(button('Restore purchases')) })
    expect(within(dock()).getByText('No purchases to restore')).toBeTruthy()
    await act(async () => { fireEvent.press(button('Restore purchases')) })
    expect(within(dock()).queryByText('No purchases to restore')).toBeNull()
  })
})

describe('what is already active', () => {
  it('a granted account still sees the plans and can buy every product (App Review buys with a granted account)', async () => {
    ;(apiClient.getMyPlus as jest.Mock).mockResolvedValue(granted)
    ;(buyPackage as jest.Mock).mockResolvedValue({ kind: 'cancelled' })
    await mount()
    expect(screen.getByText(/^Blend’n\+ until /)).toBeTruthy()
    expect(screen.getByText('Blend’n+ · active')).toBeTruthy()
    await act(async () => { fireEvent.press(button(MONTHLY_CTA)) })
    expect(buyPackage).toHaveBeenCalled()
  })

  it('a Night Pass says until when, that it does not renew, and the dock still sells another', async () => {
    ;(apiClient.getMyPlus as jest.Mock).mockResolvedValue(pass)
    await mount()
    expect(screen.getByText(/^Until .*\d:\d{2}.*\. It doesn’t renew; another one adds 24 hours\.$/)).toBeTruthy()
    expect(screen.getByText('Night Pass · 24 hours')).toBeTruthy()
    expect(button(MONTHLY_CTA)).toBeTruthy()
  })

  it('a subscriber gets Manage and no purchase: the plans are drawn but locked, and a tap picks nothing', async () => {
    ;(apiClient.getMyPlus as jest.Mock).mockResolvedValue(subscribed)
    ;(loadPlusOffers as jest.Mock).mockResolvedValue([monthly, yearly, nightPass])
    await mount()
    for (const id of ['$rc_monthly', '$rc_annual', 'night_pass']) expect(plan(id).props.accessibilityState.disabled).toBe(true)
    await act(async () => { fireEvent.press(plan('night_pass')) })
    expect(plan('night_pass').props.accessibilityState.checked).toBe(false)
    expect(buyPackage).not.toHaveBeenCalled()
  })

  // OD-5 default (M5): Plus bought outside the app is not bought again here (a double charge). Negative control: dropping `outside` from `locked` or the dock action fails both.
  it('a Razorpay-sourced Plus gets no buy dock and no pickable plan', async () => {
    ;(apiClient.getMyPlus as jest.Mock).mockResolvedValue({ success: true, data: { active: true, gated: true, product: 'plus', source: 'razorpay', expiresAt: '2027-10-23T12:00:00.000Z' } })
    ;(loadPlusOffers as jest.Mock).mockResolvedValue([monthly, yearly, nightPass])
    await mount()
    expect(screen.queryByRole('button', { name: MONTHLY_CTA })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Manage Blend’n\+/ })).toBeNull()
    for (const id of ['$rc_monthly', '$rc_annual', 'night_pass']) expect(plan(id).props.accessibilityState.disabled).toBe(true)
    expect(screen.getByText(/Managed outside the app/)).toBeTruthy()
  })

  it('a store subscription is managed in the store: the dock reads Manage, and opens the store', async () => {
    ;(apiClient.getMyPlus as jest.Mock).mockResolvedValue(subscribed)
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    await mount()
    expect(screen.getByText(/^Blend’n\+ until .* · App Store$/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: MONTHLY_CTA })).toBeNull()
    await act(async () => { fireEvent.press(button('Manage Blend’n+')) })
    expect(open).toHaveBeenCalledWith('https://apps.apple.com/account/subscriptions')
    open.mockRestore()
  })
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
  await act(async () => { fireEvent.press(button(MONTHLY_CTA)) })
  await act(async () => { second.unmount() })
  expect(logged()).not.toContain('dismissed')
})

it('the back circle is a way out too', async () => {
  await mount()
  await act(async () => { fireEvent.press(button('Back')) })
  expect(router.back).toHaveBeenCalled()
})

describe('never sells what is free (review H2)', () => {
  it('opened from the profile in a launch season: says Plus is free here, lists no plans, the dock has nothing to buy', async () => {
    mockTrigger.value = 'profile'
    ;(apiClient.getMyPlus as jest.Mock).mockResolvedValue(launch)
    await mount()
    expect(screen.getByText(/free during launch in your city/)).toBeTruthy()
    expect(screen.queryByTestId('plan-$rc_monthly')).toBeNull()
    expect(screen.queryByText(/renew automatically/)).toBeNull()
    expect(button('Unlocked during launch · nothing to buy').props.accessibilityState.disabled).toBe(true)
  })

  it('opened from the profile where it is sold: lists the plans, with the platform\'s legal wording', async () => {
    mockTrigger.value = 'profile'
    await mount()
    expect(plan('$rc_monthly')).toBeTruthy()
    expect(screen.getByText(/Subscriptions renew automatically/)).toBeTruthy()
  })

  it('a gated moment (a PLUS_REQUIRED) always lists them', async () => {
    ;(apiClient.getMyPlus as jest.Mock).mockResolvedValue(launch)
    await mount()
    expect(plan('$rc_monthly')).toBeTruthy()
  })
})

describe('prices and the server, honestly', () => {
  it('while the prices load: a spinner on a plan-sized row, no plans', async () => {
    ;(loadPlusOffers as jest.Mock).mockReturnValue(new Promise(() => {}))
    await mount()
    expect(screen.getByLabelText('Loading prices')).toBeTruthy()
    expect(screen.queryByTestId('plan-$rc_monthly')).toBeNull()
    // The dock's button holds busy (its spinner shows after the grace), never a bare dead button. Negative control: `buying={busy === 'buy'}` fails this.
    expect(screen.getByRole('button', { name: 'Start Blend’n+' }).props.accessibilityState).toMatchObject({ busy: true })
  })

  // D2: the footer states GST only for rupee prices. Negative control: the old LEGAL ending in GST fails the USD half.
  it('the footer says prices include GST only when every price is in rupees', async () => {
    const inr = (o: typeof monthly) => ({ ...o, pkg: { ...o.pkg, product: { ...o.pkg.product, currencyCode: 'INR' } } })
    ;(loadPlusOffers as jest.Mock).mockResolvedValue([inr(monthly), inr(nightPass)])
    await mount()
    expect(screen.getByText(/Prices include GST\.$/)).toBeTruthy()
    await screen.unmount()
    ;(loadPlusOffers as jest.Mock).mockResolvedValue([monthly, nightPass].map((o) => ({ ...o, pkg: { ...o.pkg, product: { ...o.pkg.product, currencyCode: 'USD' } } })))
    await mount()
    expect(screen.getByText(/renew automatically/)).toBeTruthy()
    expect(screen.queryByText(/GST/)).toBeNull()
  })

  it('"Couldn\'t load prices" with Try again, which asks again', async () => {
    ;(loadPlusOffers as jest.Mock).mockResolvedValueOnce(null).mockResolvedValue([monthly])
    await mount()
    expect(screen.getByText('Couldn’t load prices')).toBeTruthy()
    // Nothing to buy: no dock offering a disabled button over the page.
    expect(screen.queryByTestId('plus-dock')).toBeNull()
    await act(async () => { fireEvent.press(button('Try again')) })
    expect(plan('$rc_monthly')).toBeTruthy()
    expect(screen.getByTestId('plus-dock')).toBeTruthy()
  })

  it('"Purchases aren\'t available yet" when the store keys are off: the plans are dimmed and Restore is off', async () => {
    ;(purchasesAvailable as jest.Mock).mockReturnValue(false)
    ;(canBuyAs as jest.Mock).mockResolvedValue(false)
    await mount()
    expect(screen.getByText('Purchases aren’t available yet.')).toBeTruthy()
    expect(plan('$rc_monthly').props.accessibilityState.disabled).toBe(true)
    expect(button('Restore purchases').props.accessibilityState.disabled).toBe(true)
  })

  it('when GET /me/plus fails and nothing else says Plus is for sale: one state with Try again, which asks again', async () => {
    mockTrigger.value = 'profile'
    ;(apiClient.getMyPlus as jest.Mock).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(none)
    await mount()
    expect(screen.getByText('Couldn’t load Blend’n+')).toBeTruthy()
    expect(screen.queryByTestId('plan-$rc_monthly')).toBeNull()
    await act(async () => { fireEvent.press(button('Try again')) })
    await act(async () => { await Promise.resolve() })
    expect(plan('$rc_monthly')).toBeTruthy()
    expect(screen.queryByText('Couldn’t load Blend’n+')).toBeNull()
  })

  it('the failed state keeps Restore and Manage (they do not depend on the status)', async () => {
    mockTrigger.value = 'profile'
    ;(apiClient.getMyPlus as jest.Mock).mockRejectedValue(new Error('offline'))
    ;(restore as jest.Mock).mockResolvedValue({ kind: 'nothing' })
    await mount()
    expect(screen.getByText('Couldn’t load Blend’n+')).toBeTruthy()
    await act(async () => { fireEvent.press(button('Restore purchases')) })
    expect(restore).toHaveBeenCalled()
    expect(button('Manage subscription')).toBeTruthy()
  })

  it('a gated moment still sells when the status ask failed', async () => {
    ;(apiClient.getMyPlus as jest.Mock).mockRejectedValue(new Error('offline'))
    await mount()
    expect(plan('$rc_monthly')).toBeTruthy()
  })
})

describe('the wait and the store', () => {
  it('a double tap buys once', async () => {
    let land: (v: unknown) => void = () => {}
    ;(buyPackage as jest.Mock).mockReturnValue(new Promise((r) => { land = r }))
    await mount()
    await act(async () => {
      fireEvent.press(button(MONTHLY_CTA))
      fireEvent.press(button(MONTHLY_CTA))
    })
    expect(buyPackage).toHaveBeenCalledTimes(1)
    await act(async () => { land({ kind: 'cancelled' }) })
  })

  it('a pending payment is not polled, and says so; the header reads Done and the dock has no button', async () => {
    ;(buyPackage as jest.Mock).mockResolvedValue({ kind: 'pending' })
    await mount()
    ;(apiClient.getMyPlus as jest.Mock).mockClear()
    await act(async () => { fireEvent.press(button(MONTHLY_CTA)) })
    expect(screen.getByText(/Your payment is pending/)).toBeTruthy()
    expect(apiClient.getMyPlus).not.toHaveBeenCalled()
    expect(screen.getByText('Done')).toBeTruthy()
    expect(screen.queryByRole('button', { name: MONTHLY_CTA })).toBeNull()
  })

  it('while confirming: Restore is off, the header reads Done, and a failed ask never strands the spinner', async () => {
    jest.useFakeTimers()
    try {
      ;(buyPackage as jest.Mock).mockResolvedValue({ kind: 'purchased' })
      await mount()
      ;(apiClient.getMyPlus as jest.Mock).mockRejectedValue(new Error('queue cleared'))
      await act(async () => { fireEvent.press(button(MONTHLY_CTA)) })
      expect(screen.getByText('Confirming with the store…')).toBeTruthy()
      expect(screen.getByText('Done')).toBeTruthy()
      expect(button('Restore purchases').props.accessibilityState).toMatchObject({ disabled: true })
      await act(async () => { fireEvent.press(button('Restore purchases')) })
      expect(restore).not.toHaveBeenCalled()
      await act(async () => { await jest.advanceTimersByTimeAsync(61_000) })
      expect(screen.getByText(/Taking longer than usual/)).toBeTruthy()
    } finally {
      jest.useRealTimers()
    }
  }, CLOCK_WALK_TIMEOUT_MS)

  it('says each state aloud for VoiceOver', async () => {
    const say = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
    ;(buyPackage as jest.Mock).mockResolvedValue({ kind: 'purchased' })
    ;(apiClient.getMyPlus as jest.Mock).mockResolvedValueOnce(none).mockResolvedValue(granted)
    await mount()
    await act(async () => { fireEvent.press(button(MONTHLY_CTA)) })
    await act(async () => { await Promise.resolve() })
    expect(say).toHaveBeenCalledWith('Confirming with the store')
    expect(say).toHaveBeenCalledWith("You’re in.")
    say.mockRestore()
  })

  // Drawn by the paywall itself, inside its RouteModal (review MED-C): the root sheet waits behind the paywall's hold.
  const storeError = () => within(screen.getByTestId('plus-store-error-modal', { includeHiddenElements: true }))

  it('"already bought" is a tray on the paywall that points at Manage subscription', async () => {
    ;(buyPackage as jest.Mock).mockResolvedValue({ kind: 'failed', message: 'You already have this. See it under Manage subscription.', manage: true })
    await mount()
    await act(async () => { fireEvent.press(button(MONTHLY_CTA)) })
    expect(showSheet).not.toHaveBeenCalled()
    expect(storeError().getByText('Already purchased')).toBeTruthy()
    expect(storeError().getByText('You already have this. See it under Manage subscription.')).toBeTruthy()
    expect(storeError().getByRole('button', { name: 'Manage subscription' })).toBeTruthy()
    expect(storeError().getByRole('button', { name: 'Close' })).toBeTruthy()
  })

  it('any other store error is a tray on the paywall with its own words and only a way out', async () => {
    ;(buyPackage as jest.Mock).mockResolvedValue({ kind: 'failed', message: 'No connection to the store. Check your connection and try again.' })
    await mount()
    await act(async () => { fireEvent.press(button(MONTHLY_CTA)) })
    expect(storeError().getByText('The purchase didn’t go through')).toBeTruthy()
    expect(storeError().getByText('No connection to the store. Check your connection and try again.')).toBeTruthy()
    expect(storeError().queryByRole('button', { name: 'Manage subscription' })).toBeNull()
  })

  it('tells the expiry prompt it has closed', async () => {
    const closed = jest.fn()
    const off = subscribePaywallClosed(closed)
    const view = await mount()
    await act(async () => { view.unmount() })
    expect(closed).toHaveBeenCalledTimes(1)
    // Left without doing anything: a decline, so the prompt behind it may come back.
    expect(closed).toHaveBeenCalledWith('dismissed')
    off()
  })

  it('says it was done when something was bought here, so the prompt does not come back', async () => {
    ;(buyPackage as jest.Mock).mockResolvedValue({ kind: 'pending' })
    mockTrigger.value = 'profile'
    const closed = jest.fn()
    const off = subscribePaywallClosed(closed)
    const view = await mount()
    await act(async () => { fireEvent.press(button(MONTHLY_CTA)) })
    await act(async () => { view.unmount() })
    expect(closed).toHaveBeenCalledWith('done')
    off()
  })
})

describe('Terms and Privacy open in the app', () => {
  it('in the in-app browser, not Linking', async () => {
    const linking = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    await mount()
    await act(async () => { fireEvent.press(screen.getByRole('link', { name: 'Terms' })) })
    await act(async () => { fireEvent.press(screen.getByRole('link', { name: 'Privacy' })) })
    // One macrotask after the tap (lib/links: a sheet closing in that tick is waited for, SCRUM-994).
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)))
    expect(WebBrowser.openBrowserAsync).toHaveBeenNthCalledWith(1, 'https://blendn.app/terms', expect.any(Object))
    expect(WebBrowser.openBrowserAsync).toHaveBeenNthCalledWith(2, 'https://blendn.app/privacy', expect.any(Object))
    expect(linking).not.toHaveBeenCalled()
    linking.mockRestore()
  })
})

/**
 * Scroll-edge chrome (motion #30): at rest the circle and "Not now" sit straight on the page; the
 * bar's glass is mounted once the content has moved under it, and goes when it is back at the top.
 *
 * Negative control: mounting the bar unconditionally (the old header) fails "no bar at rest".
 */
describe('the bar at the scroll edge', () => {
  const scrollTo = async (y: number) => {
    await act(async () => {
      fireEvent.scroll(screen.getByTestId('plus-scroll'), { nativeEvent: { contentOffset: { y } } })
    })
  }

  it('no bar at rest; its glass is mounted once the page has scrolled under it, and gone at the top again', async () => {
    await mount()
    expect(screen.queryByTestId('plus-header-bar')).toBeNull()
    await scrollTo(40)
    expect(screen.getByTestId('plus-header-bar')).toBeTruthy()
    await scrollTo(0)
    expect(screen.queryByTestId('plus-header-bar')).toBeNull()
    // Both ways out are there throughout.
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy()
  })
})

// D-M10: the hero's wordmark never breaks "Blend’ / n+" at AX. Negative control: without `numberOfLines={1}` it fails.
it('sets the hero wordmark on one line, shrunk to fit', async () => {
  await mount()
  expect(screen.getByTestId('plus-wordmark').props.numberOfLines).toBe(1)
  expect(screen.getByTestId('plus-wordmark').props.adjustsFontSizeToFit).toBe(true)
})
