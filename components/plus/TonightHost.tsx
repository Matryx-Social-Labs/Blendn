import { router } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'

import { HueProvider } from '../ds/shared'
import { TonightSheet, type TonightPick } from '../ds/TonightSheet'
import { useToast } from '../Toast'
import { apiClient } from '../../lib/apiClient'
import { BLENDN_LINKS, openInApp } from '../../lib/links'
import { notePaywallClosed, notePaywallEvent, registerTonightHost, type TonightRequest } from '../../lib/paywall'
import { goesLiveWhenUnlocked, isGenericFailure, paywallTriggerFor, purchasedToast, tonightOffers } from '../../lib/tonight'
import { waitForPlus } from '../../lib/plus'
import { buyPackage, canBuyAs, loadPlusOffers, restore, type PlusOffer, type RestoreOutcome } from '../../lib/purchases'
import { afterSheetDismissed } from '../../lib/sheetDismissed'
import { useAuth } from '../../lib/useAuth'
import { useLatest } from '../../lib/useLatest'
import { LEGAL } from './PlusSections'
import { openStoreSubscriptions, showStoreError } from './storeActions'

/** In a launch season nothing is for sale, so the sheet never opens: this says why, once (Flow 12 · 12.1 #11). */
export const LAUNCH_TOAST = 'Blend’n+ is free during launch in your city. Nothing to buy.'
/** The grant took longer than the minute we wait for it: it lands when the store confirms. */
export const SLOW_GRANT_TOAST = 'Taking longer than usual. It unlocks as soon as the store confirms.'

const STORE: 'ios' | 'android' = Platform.OS === 'android' ? 'android' : 'ios'

type Sale = { request: TonightRequest; prices: { night: PlusOffer; monthly: PlusOffer } }
type Status = 'idle' | 'pending' | 'cancelled' | 'failed'

/**
 * The contextual Blend'n+ sheet, drawn once for the whole app (Flow 12 · 12.1,
 * ROUND3 G2). Mounted at the root beside `LiveAtVenue`, because the lock it
 * answers is met on the venue page, in the expiry prompt and on Going, and the
 * sheet is the same everywhere. Opened through `openTonight` (lib/paywall.ts),
 * which owns the policy and the places it never opens.
 *
 * The store sells and the server unlocks, as on the page: after a purchase or
 * a restore this asks `GET /me/plus` until the webhook has landed
 * (`waitForPlus`) and never reads RevenueCat for what you have. It does not
 * open at all in a launch season (a toast says so), and it falls back to the
 * page when the store cannot price both things (the page says "Couldn't load
 * prices" and keeps Restore).
 */
export function TonightHost() {
  const { showToast } = useToast()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [sale, setSale] = useState<Sale | null>(null)
  const [visible, setVisible] = useState(false)
  const [pick, setPick] = useState<TonightPick>('night')
  const [status, setStatus] = useState<Status>('idle')
  const [restoring, setRestoring] = useState(false)
  /** One store call at a time; a ref, so a double tap inside one frame is one. */
  const working = useRef(false)
  /** Whether the person bought or restored here, so closing is not logged as a dismissal. */
  const acted = useRef(false)
  const mounted = useRef(true)
  const saleRef = useLatest(sale)
  /** Asked for, or on screen: a second ask while one is being prepared or shown is the same ask. */
  const engaged = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const open = useCallback(
    async (request: TonightRequest) => {
      if (engaged.current) return
      engaged.current = true
      const trigger = paywallTriggerFor(request.trigger)
      const [plus, loaded, buyable] = await Promise.all([
        apiClient.getMyPlus().catch(() => null),
        loadPlusOffers(),
        canBuyAs(userId),
      ])
      if (!mounted.current) return
      if (plus?.success && plus.data && !plus.data.gated) {
        engaged.current = false
        return showToast(LAUNCH_TOAST, 'info')
      }
      const prices = tonightOffers(loaded)
      if (!prices || !buyable) {
        // No prices to show: the page has the words for that.
        engaged.current = false
        router.push({ pathname: '/plus', params: { trigger } } as never)
        return
      }
      acted.current = false
      working.current = false
      setSale({ request, prices })
      setPick('night')
      setStatus('idle')
      setVisible(true)
      notePaywallEvent('shown', trigger)
    },
    [userId, showToast]
  )
  useEffect(() => registerTonightHost((request) => void open(request)), [open])

  // The store's prices, warm before anybody asks: the sheet opens on a tap with nothing to show for it while the store answers.
  // `canBuyAs` waits for the store to know this account, and the SDK keeps the offering it fetched.
  useEffect(() => {
    if (!userId) return
    void canBuyAs(userId)
      .then((ok) => (ok ? loadPlusOffers() : null))
      .catch(() => {})
  }, [userId])

  /** Away: the sheet leaves, and what waited for it (the expiry prompt) hears how it went. */
  const leave = useCallback((how: 'done' | 'dismissed') => {
    const current = saleRef.current
    setVisible(false)
    engaged.current = false
    if (current && !acted.current && how === 'dismissed') notePaywallEvent('dismissed', paywallTriggerFor(current.request.trigger))
    notePaywallClosed(how)
  }, [saleRef])

  /** The server has (or has not yet) granted what was bought: the locked thing works, or says it is coming. */
  const settled = async (granted: boolean, restored: boolean) => {
    const current = saleRef.current
    if (!mounted.current || !current) return
    // A grant that has not landed is not something done: the expiry prompt may come back for the free way on.
    if (engaged.current) leave(granted ? 'done' : 'dismissed')
    if (!granted) return showToast(SLOW_GRANT_TOAST, 'info')
    // A Stay goes live by itself and says so; anything else says what was bought, and the lock is lifted.
    if (!goesLiveWhenUnlocked(current.request.trigger)) showToast(restored ? 'Restored' : purchasedToast(pick), 'success', { haptic: 'success' })
    current.request.onUnlocked?.()
  }

  const buy = async () => {
    const current = saleRef.current
    if (working.current || !current) return
    working.current = true
    setStatus('idle')
    const trigger = paywallTriggerFor(current.request.trigger)
    const offer = pick === 'night' ? current.prices.night : current.prices.monthly
    notePaywallEvent('purchase_started', trigger)
    try {
      const result = await buyPackage(offer.pkg, userId)
      if (!mounted.current) return
      if (result.kind === 'cancelled') return setStatus('cancelled')
      if (result.kind === 'pending') {
        // A UPI approval or Ask to Buy can take hours: not polled. The sheet says so and the page re-reads on return.
        acted.current = true
        return setStatus('pending')
      }
      if (result.kind === 'failed') {
        if (isGenericFailure(result.message) && !result.manage) return setStatus('failed')
        // A store error with its own words is a tray, once the sheet has gone (iOS drops a modal over one that is leaving).
        leave('dismissed')
        await afterSheetDismissed()
        return showStoreError(result.message, result.manage, () => void openStoreSubscriptions(() => showToast("That page didn't open. Try again.", 'error')))
      }
      acted.current = true
      notePaywallEvent('purchased', trigger)
      // The same line as a payment waiting on the store: the plans step back until the server says yes.
      setStatus('pending')
      const granted = await waitForPlus(() => !mounted.current)
      await settled(granted !== null, false)
    } finally {
      working.current = false
    }
  }

  const settleRestore = async (result: RestoreOutcome) => {
    if (!mounted.current) return
    if (result.kind === 'nothing') return showToast('No purchases to restore', 'info')
    if (result.kind === 'failed') return showToast(result.message, 'error', { haptic: 'error' })
    const current = saleRef.current
    acted.current = true
    if (current) notePaywallEvent('restored', paywallTriggerFor(current.request.trigger))
    setStatus('pending')
    const granted = await waitForPlus(() => !mounted.current)
    await settled(granted !== null, true)
  }

  const restoreAll = async () => {
    if (working.current) return
    working.current = true
    setRestoring(true)
    try {
      // The store answered after we had said it did not: say what it said.
      const result = await restore(userId, (late) => void settleRestore(late))
      await settleRestore(result)
    } finally {
      working.current = false
      if (mounted.current) setRestoring(false)
    }
  }

  const seeAll = async () => {
    const current = saleRef.current
    if (!current) return
    acted.current = true
    setVisible(false)
    engaged.current = false
    await afterSheetDismissed()
    // The page reports how it closed itself when it unmounts (`app/plus.tsx`): this sheet's closing says nothing.
    router.push({ pathname: '/plus', params: { trigger: paywallTriggerFor(current.request.trigger) } } as never)
  }

  const free = () => {
    const current = saleRef.current
    if (!current) return
    leave('dismissed')
    current.request.onFree?.()
  }

  const openLink = (url: string) => openInApp(url).catch(() => showToast("That page didn't open. Try again.", 'error'))

  if (!sale) return null
  const { request, prices } = sale
  return (
    <HueProvider value="violet">
      <TonightSheet
        visible={visible}
        // While the store's own sheet is up the person is in the store's hands: ours holds.
        // Closed with a purchase on its way (pending, or confirming) is not a decline: `acted` says it was bought.
        onClose={() => (working.current && status !== 'pending' ? undefined : leave(acted.current ? 'done' : 'dismissed'))}
        trigger={request.trigger}
        venue={request.venue}
        prices={{ night: prices.night.price, monthly: prices.monthly.price }}
        pick={pick}
        onPick={setPick}
        onContinue={() => void buy()}
        onFree={free}
        onSeeAll={() => void seeAll()}
        onTerms={() => void openLink(BLENDN_LINKS.terms)}
        onPrivacy={() => void openLink(BLENDN_LINKS.privacy)}
        onRestore={() => void restoreAll()}
        status={status}
        store={STORE}
        legal={LEGAL[STORE]}
        restoring={restoring}
      />
    </HueProvider>
  )
}
