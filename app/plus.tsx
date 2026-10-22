import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Platform, ScrollView, StyleSheet, View } from 'react-native'

import { Banner } from '../components/ds/Banner'
import { Spinner } from '../components/ds/Loader'
import { ManageStatusRow } from '../components/ds/ManageStatusRow'
import { NeverForSalePanel } from '../components/ds/NeverForSalePanel'
import { Orbs } from '../components/ds/Orbs'
import { Grain } from '../components/ds/Grain'
import { NightPassRow, PlanCard, PlanList } from '../components/ds/PlanCard'
import { HueProvider } from '../components/ds/shared'
import { StateScreen } from '../components/ds/StateScreen'
import { openStoreSubscriptions, showStoreError } from '../components/plus/storeActions'
import { PlusActions, PlusFooter, PlusHeader, PlusHeading, PlusHero, PlusNote, useHeaderHeight, WhatYouGet } from '../components/plus/PlusSections'
import { useToast } from '../components/Toast'
import { apiClient } from '../lib/apiClient'
import { COLOR, SPACE } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { BLENDN_LINKS, openInApp } from '../lib/links'
import { isPaywallTrigger } from '../lib/paywallPolicy'
import {
  ctaParts,
  defaultPick,
  dockMode,
  isNightPass,
  planRowFor,
  planSubline,
  PLUS_COMING_SOON,
  PLUS_FEATURES,
  waitForPlus,
  type PlusStatus,
} from '../lib/plus'
import { manageCard } from '../lib/plusManage'
import { buyPackage, canBuyAs, loadPlusOffers, purchasesAvailable, restore, type PlusOffer, type RestoreOutcome } from '../lib/purchases'
import { useAuth } from '../lib/useAuth'
import { notePaywallClosed, notePaywallEvent } from '../lib/paywall'
import { useTopBarState } from '../lib/useTopBarState'

type Phase = 'idle' | 'confirming' | 'pending' | 'slow' | 'done'

/** `loading` until the server answers; `failed` when it could not (no status, no launch line, no plans — it says so). */
type StatusLoad = 'loading' | 'ok' | 'failed'

/** Said aloud as the screen's state changes: iOS VoiceOver ignores `accessibilityLiveRegion`. */
const say = (text: string) => AccessibilityInfo.announceForAccessibility(text)

/**
 * Triggers that are themselves a gated moment: the server refused "stay"
 * (`go_live_expiry`) or locked nights (`recap`). Anywhere else, plans show
 * only when the server says Blendn+ is for sale to this person (`gated`).
 */
const GATED_TRIGGERS = new Set(['go_live_expiry', 'recap'])

const LAUNCH_LINE = "Blend’n+ is free during launch in your city. Staying live and your full night history are everyone's for now — nothing to buy."

/**
 * Blend'n+ — the page (Flow 12 · 12.2, R3-G, R4-D12; guidelines/flow-12/flow12.js `page`).
 *
 * What Plus is, the plans at the store's prices, and the way out ("Not now").
 * Opened through `lib/paywall.ts`, whose policy decides when it may arrive by
 * itself. The store sells; the **server** unlocks: after a purchase or a restore
 * this asks `GET /me/plus` until the webhook has landed, and never reads
 * RevenueCat to decide what you have. The buy button stays off unless
 * RevenueCat's user is this account (`canBuyAs`) — never anonymous.
 *
 * The purchase sheet itself (App Store / Google Play) is the OS's: OS chrome,
 * not tokens (Prompt 10). The app draws nothing there and plays no haptic while
 * it is up; it draws the outcome — a tray for a store error, a toast for a
 * restore, the dock for the wait.
 */
function PlusScreenContent() {
  const params = useLocalSearchParams<{ trigger?: string }>()
  const trigger = isPaywallTrigger(params.trigger) ? params.trigger : 'profile'
  const { user } = useAuth()
  const userId = user?.id ?? null
  const { showToast } = useToast()
  const headerHeight = useHeaderHeight()
  const bar = useTopBarState()

  const [status, setStatus] = useState<PlusStatus | null>(null)
  const [statusLoad, setStatusLoad] = useState<StatusLoad>('loading')
  /** undefined: loading; null: the store could not be reached; []: nothing to sell. */
  const [offers, setOffers] = useState<PlusOffer[] | null | undefined>(undefined)
  const [buyable, setBuyable] = useState(false)
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [picked, setPicked] = useState<string | null>(null)
  /** What Restore found, in the dock until the next tap: a toast alone is gone in three seconds. */
  const [notice, setNotice] = useState<string | null>(null)
  const [dockHeight, setDockHeight] = useState(0)
  /** What happened here, so closing after a purchase is not logged as a dismissal. */
  const outcome = useRef<'purchased' | 'pending' | 'restored' | null>(null)
  /** A tap guard that holds within one frame — state would let a double tap through. */
  const working = useRef(false)
  const mounted = useRef(true)

  // Shown on arrival; dismissed on leaving by any door (Not now, a swipe, back) unless something was bought.
  useEffect(() => {
    mounted.current = true
    notePaywallEvent('shown', trigger)
    return () => {
      mounted.current = false
      if (!outcome.current) notePaywallEvent('dismissed', trigger)
      // Bought or restored here: the people who waited on it (the expiry prompt) hear it was done, not declined.
      notePaywallClosed(outcome.current ? 'done' : 'dismissed')
    }
  }, [trigger])

  const fetchOffers = useCallback(() => {
    void Promise.all([loadPlusOffers(), canBuyAs(userId)])
      .then(([loaded, ok]) => {
        if (!mounted.current) return
        setOffers(loaded)
        setBuyable(ok)
      })
      .catch(() => {
        if (mounted.current) setOffers(null)
      })
  }, [userId])
  const retryOffers = () => {
    setOffers(undefined)
    fetchOffers()
  }

  const loadStatus = useCallback(() => {
    apiClient
      .getMyPlus()
      .then((res) => {
        if (!mounted.current) return
        if (res.success && res.data) setStatus(res.data)
        setStatusLoad(res.success && res.data ? 'ok' : 'failed')
      })
      .catch(() => {
        if (mounted.current) setStatusLoad('failed')
      })
  }, [])

  useEffect(() => {
    loadStatus()
    fetchOffers()
  }, [loadStatus, fetchOffers])
  const retryAll = () => {
    setStatusLoad('loading')
    loadStatus()
    retryOffers()
  }

  const confirm = async () => {
    setPhase('confirming')
    say('Confirming with the store')
    let granted: PlusStatus | null = null
    try {
      granted = await waitForPlus(() => !mounted.current)
    } catch {
      granted = null
    } finally {
      if (mounted.current) {
        if (granted) {
          setStatus(granted)
          H.success()
        }
        setPhase(granted ? 'done' : 'slow')
        say(granted ? "You're in." : 'Taking longer than usual.')
      }
    }
  }

  const open = (url: string) => openInApp(url).catch(() => showToast("That page didn't open. Try again.", 'error'))
  const manage = () => void openStoreSubscriptions(() => showToast("That page didn't open. Try again.", 'error'))

  const buy = async (offer: PlusOffer) => {
    if (working.current || !buyable) return
    working.current = true
    setBusy('buy')
    setNotice(null)
    notePaywallEvent('purchase_started', trigger)
    try {
      const result = await buyPackage(offer.pkg, userId)
      if (!mounted.current) return
      if (result.kind === 'cancelled') return
      if (result.kind === 'failed') {
        showStoreError(result.message, result.manage, manage)
        say(result.message)
        return
      }
      outcome.current = result.kind
      if (result.kind === 'pending') {
        // Not polled: a UPI approval or Ask to Buy can take hours. Settings and Going re-read on return.
        setPhase('pending')
        say('Payment pending')
        return
      }
      notePaywallEvent('purchased', trigger)
      await confirm()
    } finally {
      working.current = false
      if (mounted.current) setBusy(null)
    }
  }

  /** What a restore's answer does: words for nothing or a failure, the server's confirmation for a find. */
  const settleRestore = async (result: RestoreOutcome) => {
    if (result.kind === 'nothing' || result.kind === 'failed') {
      const text = result.kind === 'nothing' ? 'No purchases to restore' : result.message
      setNotice(text)
      if (result.kind === 'failed') showToast(text, 'error', { haptic: 'error' })
      else showToast(text, 'info')
      say(text)
      return
    }
    setNotice(null)
    outcome.current = 'restored'
    notePaywallEvent('restored', trigger)
    showToast('Restored', 'success')
    await confirm()
  }

  const restoreAll = async () => {
    if (working.current || !buyable) return
    working.current = true
    setBusy('restore')
    setNotice(null)
    try {
      const result = await restore(userId, (late) => {
        // The store answered after we had said it did not: say what it said.
        if (mounted.current) void settleRestore(late)
      })
      if (!mounted.current) return
      await settleRestore(result)
    } finally {
      working.current = false
      if (mounted.current) setBusy(null)
    }
  }

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/events' as never))

  // Never sell what is free: plans only in a gated moment, or where the server says Plus is for sale (review H2).
  const forSale = GATED_TRIGGERS.has(trigger) || status?.gated === true
  const launch = !forSale && status !== null
  const sellable = purchasesAvailable() && buyable && (offers?.length ?? 0) > 0
  // Anything bought or restored moves the phase on (pending, confirming, …): from then the way out is Done.
  const finished = phase !== 'idle'
  // What you have, in Manage's words (one card, one set of sentences); nothing for a launch season, which is the banner's.
  const card = status?.active ? manageCard(status, Platform.OS === 'android' ? 'android' : 'ios') : null
  const failed = !forSale && statusLoad === 'failed'
  const pick = offers?.find((o) => o.pkg.identifier === picked) ?? offers?.find((o) => o.pkg.identifier === defaultPick(offers ?? []))
  // A subscriber manages in the store (12.2 #06): the plans stay drawn, but nothing is pickable and no pick plays a haptic.
  const managing = dockMode(status) === 'manage'
  // No buy dock when the page failed, nor when the store could not be reached for prices: it would offer a button with nothing behind it.
  const dockShown = !failed && !(forSale && offers === null)
  const locked = !sellable || busy !== null || finished || managing

  const plans = (list: PlusOffer[]) => {
    const subs = list.filter((o) => !isNightPass(o))
    const night = list.filter(isNightPass)
    return (
      <PlanList testID="plus-plans" apartFrom={subs.length && night.length ? subs.length : undefined}>
        {[
          ...subs.map((offer) => (
            <PlanCard
              key={offer.pkg.identifier}
              testID={`plan-${offer.pkg.identifier}`}
              name={planRowFor(offer)?.name ?? offer.title}
              per={planRowFor(offer)?.per}
              sub={planSubline(offer, list) ?? undefined}
              price={offer.price}
              selected={pick?.pkg.identifier === offer.pkg.identifier}
              disabled={locked}
              onPress={() => setPicked(offer.pkg.identifier)}
            />
          )),
          ...night.map((offer) => (
            <NightPassRow
              key={offer.pkg.identifier}
              testID={`plan-${offer.pkg.identifier}`}
              price={offer.price}
              selected={pick?.pkg.identifier === offer.pkg.identifier}
              disabled={locked}
              onPress={() => setPicked(offer.pkg.identifier)}
            />
          )),
        ]}
      </PlanList>
    )
  }

  const plansSection = () => {
    // Listed and buyable even with Blendn+ already on (a grant, a Night Pass): App Review signs in with a granted account and must be able to buy every product (guideline 2.1(b)); the status card says what you have.
    if (!forSale) return statusLoad === 'loading' ? <PricesLoading /> : null
    if (offers === undefined) return <PricesLoading />
    return (
      <View style={styles.section}>
        <PlusHeading>Plans</PlusHeading>
        {offers === null ? (
          <View style={styles.inline}>
            <StateScreen
              icon="cloud-off"
              title="Couldn’t load prices"
              body="Check your connection and try again."
              actions={[{ label: 'Try again', kind: 'lit', onPress: retryOffers }]}
              testID="plus-prices-failed"
            />
          </View>
        ) : (
          <>
            {plans(offers)}
            {offers.some(isNightPass) ? <PlusNote text="Night Pass is a one-off, not a subscription." /> : null}
            {!sellable ? <PlusNote text="Purchases aren’t available yet." /> : null}
          </>
        )}
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <Orbs set="brand" />
      <Grain />
      {/* First in the tree for the focus order (it draws over the scroll by zIndex). */}
      <PlusHeader done={finished} onClose={close} state={bar.state === 'rest' ? 'rest' : 'scrolled'} />
      <ScrollView
        testID="plus-scroll"
        contentContainerStyle={[styles.content, { paddingTop: headerHeight + SPACE.sm, paddingBottom: (dockShown ? dockHeight : 0) + SPACE.xl }]}
        showsVerticalScrollIndicator={false}
        {...bar.scrollProps}
      >
        <PlusHero />
        {failed ? (
          <StateScreen
            icon="cloud-off"
            title="Couldn’t load Blend’n+"
            body="Check your connection and try again."
            actions={[{ label: 'Try again', onPress: retryAll }]}
            testID="plus-status-failed"
          />
        ) : (
          <>
            {card ? <ManageStatusRow status={card.status} sentence={card.sentence} store={card.store} testID="plus-status" /> : null}
            {launch ? <Banner kind="info" text={LAUNCH_LINE} testID="plus-launch" /> : null}
            <WhatYouGet features={PLUS_FEATURES} comingSoon={PLUS_COMING_SOON} />
            <NeverForSalePanel />
            {plansSection()}
          </>
        )}
        {/* Restore and Manage stay even when the status could not be read: they do not depend on it. */}
        <PlusFooter
          forSale={forSale}
          restoreDisabled={!buyable || busy !== null}
          restoring={busy === 'restore'}
          onTerms={() => void open(BLENDN_LINKS.terms)}
          onPrivacy={() => void open(BLENDN_LINKS.privacy)}
          onRestore={() => void restoreAll()}
          onManage={() => manage()}
        />
      </ScrollView>
      {dockShown ? (
        <PlusActions
          onHeight={setDockHeight}
          phase={phase}
          restoring={busy === 'restore'}
          notice={notice}
          action={launch ? 'launch' : managing ? 'manage' : forSale ? 'buy' : 'none'}
          cta={ctaParts(pick)}
          disabled={locked || !pick}
          buying={busy === 'buy'}
          onBuy={() => pick && void buy(pick)}
          onManage={() => manage()}
        />
      ) : null}
    </View>
  )
}

/** Violet world: Blendn+ is yours, not an outing: one hue on this screen (`HueProvider`), so the plan's radio and the dock agree. */
export default function PlusScreen() {
  return (
    <HueProvider value="violet">
      <PlusScreenContent />
    </HueProvider>
  )
}

/** "Loading prices" — a spinner on a plan-sized row, so the page does not jump when the plans land. */
function PricesLoading() {
  return (
    <View style={styles.loading} accessible accessibilityLabel="Loading prices">
      <Spinner size={20} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.ink },
  content: { paddingHorizontal: SPACE.gutter, gap: SPACE.xl },
  section: { gap: SPACE.md },
  inline: { alignItems: 'center' },
  loading: { height: SPACE.xxxl + SPACE.xl, alignItems: 'center', justifyContent: 'center' },
})
