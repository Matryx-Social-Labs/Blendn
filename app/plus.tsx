import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Banner } from '../components/ds/Banner'
import { BannerPresence } from '../components/motion/BannerPresence'
import { Spinner } from '../components/ds/Loader'
import { ManageStatusRow } from '../components/ds/ManageStatusRow'
import { Grain } from '../components/ds/Grain'
import { PlanCard, PlanList } from '../components/ds/PlanCard'
import { font, HueProvider, useBoldText, useLargeText } from '../components/ds/shared'
import { StateScreen } from '../components/ds/StateScreen'
import { openStoreSubscriptions } from '../components/plus/storeActions'
import { StoreErrorSheet, type StoreError } from '../components/plus/StoreErrorSheet'
import { disclosureLine, NeverForSaleRow, PlusActions, PlusTerms, PlusHeader, PlusHero, PlusNote, useHeaderHeight, WhatYouGet } from '../components/plus/PlusSections'
import { useToast } from '../components/Toast'
import { apiClient } from '../lib/apiClient'
import { barTop } from '../lib/barGeometry'
import { COLOR, MAX_FONT_SCALE, RADIUS, SPACE } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { BLENDN_LINKS, openInApp } from '../lib/links'
import { isPaywallTrigger } from '../lib/paywallPolicy'
import {
  ctaParts,
  defaultPick,
  isNightPass,
  knownPlus,
  planRowFor,
  planSubline,
  PLUS_FEATURES,
  taxLine,
  waitForPlus,
  type PlusStatus,
} from '../lib/plus'
import { manageCard } from '../lib/plusManage'
import { buyPackage, canBuyAs, loadPlusOffers, purchasesAvailable, restore, type PlusOffer, type RestoreOutcome } from '../lib/purchases'
import { useAuth } from '../lib/useAuth'
import { notePaywallClosed, notePaywallEvent } from '../lib/paywall'
import { useTopBarState } from '../lib/useTopBarState'
import { RouteModal } from '../components/system/RouteModal'
import { holdLinks } from '../lib/pendingRoute'

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

/** The paywall's Night Pass row says how long and that nothing renews (remaining-screens 01 A). */
const NIGHT_PASS_SUB = 'One night, 24 hours · doesn’t renew'

const NOT_CONNECTED = 'We couldn’t connect your account to the store. Close this and try again.'

const LAUNCH_LINE = "Blend’n+ is free during launch in your city. Staying live and your full night history are everyone’s for now — nothing to buy."

/**
 * Blend'n+ — the page (Flow 12 · 12.2, R3-G, R4-D12; guidelines/flow-12/flow12.js `page`).
 *
 * The plans first, at the store's prices, then what Plus is and what is never
 * for sale, and the way out ("Not now"); the dock restates the pick and its
 * price beside the store's renew line and Restore · Terms · Privacy
 * (remaining-screens 01 A / 02 A). Somebody who already has it gets no plans
 * and no Start: the dock opens Manage, whose plans open this page with one
 * picked (`plan`), which then sells it whatever is active (App Review buys
 * every product from a granted account that way, guideline 2.1(b)).
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
  const params = useLocalSearchParams<{ trigger?: string; plan?: string }>()
  const trigger = isPaywallTrigger(params.trigger) ? params.trigger : 'profile'
  const { user } = useAuth()
  const userId = user?.id ?? null
  const { showToast } = useToast()
  const headerHeight = useHeaderHeight()
  const insets = useSafeAreaInsets()
  // The board starts the compact hero 32 under the circle row, in the bar's band: the mark is centred between the circle
  // and "Not now" (remaining-screens 01 A). At AX only the wordmark stays, at the left edge under the circle, so the page
  // starts under the bar.
  const contentTop = useLargeText() ? headerHeight + SPACE.sm : barTop(insets.top) + SPACE.xxl
  const bar = useTopBarState()

  const [status, setStatus] = useState<PlusStatus | null>(null)
  const [statusLoad, setStatusLoad] = useState<StatusLoad>('loading')
  /** undefined: loading; null: the store could not be reached; []: nothing to sell. */
  const [offers, setOffers] = useState<PlusOffer[] | null | undefined>(undefined)
  const [buyable, setBuyable] = useState(false)
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null)
  // A link or a tap that arrives mid-purchase or mid-restore waits for it, rather than closing the page under the store.
  useEffect(() => (busy ? holdLinks() : undefined), [busy])
  const [phase, setPhase] = useState<Phase>('idle')
  const [picked, setPicked] = useState<string | null>(params.plan ?? null)
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

  /** `purchase`: wait for the buy to land on top of what the account held. A restore has nothing new to wait for. */
  const confirm = async (purchase = false) => {
    setPhase('confirming')
    say('Confirming with the store')
    let granted: PlusStatus | null = null
    // An active account (a grant, a Night Pass) waits for the purchase to land, not for "active" (SYS-03).
    const before = purchase ? (status ?? knownPlus()) : null
    try {
      granted = await waitForPlus(() => !mounted.current, Date.now, before)
    } catch {
      granted = null
    } finally {
      if (mounted.current) {
        if (granted) {
          setStatus(granted)
          H.success()
        }
        setPhase(granted ? 'done' : 'slow')
        say(granted ? "You’re in." : 'Taking longer than usual.')
      }
    }
  }

  /** A purchase the store refused, in its words (review MED-C: drawn by this page, not the root sheet). */
  const [storeError, setStoreError] = useState<StoreError | null>(null)
  const open = (url: string) => openInApp(url).catch(() => showToast("That page didn’t open. Try again.", 'error'))
  const manage = () => void openStoreSubscriptions(() => showToast("That page didn’t open. Try again.", 'error'))
  const toManage = () => router.push('/plus-manage' as never)

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
        setStoreError({ message: result.message, manage: result.manage })
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
      await confirm(true)
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
    if (working.current) return
    // Restore is never greyed (remaining-screens 01 A): where the store is not this account it says so instead.
    if (!buyable) {
      setNotice(NOT_CONNECTED)
      say(NOT_CONNECTED)
      return
    }
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
  // A plan picked on Manage (a grant, a Night Pass): sold here whatever is already active.
  const asked = forSale ? offers?.find((o) => o.pkg.identifier === params.plan) : undefined
  // Already has it (a grant, a pass, a store plan, Razorpay): no plans and no Start; the dock opens Manage (02 A).
  const has = status?.active === true && !asked
  // The store has nothing to sell on this phone: said once, and Restore is the one action (02 A).
  const empty = forSale && !has && Array.isArray(offers) && (offers.length === 0 || !purchasesAvailable())
  const sellable = purchasesAvailable() && buyable && (offers?.length ?? 0) > 0
  // Anything bought or restored moves the phase on (pending, confirming, …): from then the way out is Done.
  const finished = phase !== 'idle'
  // What you have, in Manage's words (one card, one set of sentences); nothing for a launch season, which is the banner's.
  const card = status?.active ? manageCard(status, Platform.OS === 'android' ? 'android' : 'ios') : null
  const failed = !forSale && statusLoad === 'failed'
  const pick = offers?.find((o) => o.pkg.identifier === picked) ?? offers?.find((o) => o.pkg.identifier === defaultPick(offers ?? []))
  const locked = !sellable || busy !== null || finished
  const action = failed ? 'none' : has ? 'manage' : launch ? 'launch' : !forSale || offers === null ? 'none' : empty ? 'restore' : 'buy'
  const platform = Platform.OS === 'android' ? 'android' : 'ios'
  const disclosure = disclosureLine(platform, offers?.some(isNightPass) === true, taxLine(offers))
  const storeBusy = busy === 'buy' || phase === 'confirming'

  const plans = (list: PlusOffer[]) => (
    <PlanList testID="plus-plans" cards>
      {[...list.filter((o) => !isNightPass(o)), ...list.filter(isNightPass)].map((offer) => (
        <PlanCard
          key={offer.pkg.identifier}
          testID={`plan-${offer.pkg.identifier}`}
          name={isNightPass(offer) ? 'Night Pass' : (planRowFor(offer)?.name ?? offer.title)}
          per={planRowFor(offer)?.per}
          sub={isNightPass(offer) ? NIGHT_PASS_SUB : (planSubline(offer, list) ?? undefined)}
          price={offer.price}
          selected={pick?.pkg.identifier === offer.pkg.identifier}
          disabled={locked}
          onPress={() => setPicked(offer.pkg.identifier)}
        />
      ))}
    </PlanList>
  )

  const plansSection = () => {
    if (!forSale) return statusLoad === 'loading' ? <PricesLoading /> : null
    if (has) return null
    if (offers === undefined) return <PricesLoading />
    if (offers === null) {
      return (
        <View style={styles.inline}>
          <StateScreen
            icon="cloud-off"
            title="Couldn’t load prices"
            body="Check your connection and try again."
            actions={[{ label: 'Try again', kind: 'lit', onPress: retryOffers }]}
            testID="plus-prices-failed"
          />
        </View>
      )
    }
    if (empty) return <NothingOnSale />
    return (
      <View style={styles.section}>
        {plans(offers)}
        {!buyable ? <PlusNote text="Purchases aren’t available yet." /> : null}
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <Grain />
      {/* First in the tree for the focus order (it draws over the scroll by zIndex). */}
      <PlusHeader done={finished || has} onClose={close} state={bar.state === 'rest' ? 'rest' : 'scrolled'} />
      <ScrollView
        testID="plus-scroll"
        contentContainerStyle={[styles.content, { paddingTop: contentTop, paddingBottom: dockHeight + SPACE.xl }]}
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
            {launch && !has ? <BannerPresence><Banner kind="info" text={LAUNCH_LINE} testID="plus-launch" /></BannerPresence> : null}
            {plansSection()}
            <WhatYouGet features={PLUS_FEATURES} />
            <NeverForSaleRow />
          </>
        )}
        <PlusTerms
          disclosure={action === 'buy' ? disclosure : null}
          restore={action !== 'restore'}
          restoring={busy === 'restore'}
          storeBusy={storeBusy}
          onRestore={() => void restoreAll()}
          onTerms={() => void open(BLENDN_LINKS.terms)}
          onPrivacy={() => void open(BLENDN_LINKS.privacy)}
        />
      </ScrollView>
      {/* Restore, Terms and Privacy stay even when the status could not be read: they do not depend on it. */}
      <PlusActions
        onHeight={setDockHeight}
        phase={phase}
        restoring={busy === 'restore'}
        notice={notice}
        action={action}
        cta={ctaParts(pick)}
        disabled={locked || !pick}
        // While the store prices load the button holds with a spinner (after the grace), never a bare dead button.
        buying={busy === 'buy' || (forSale && offers === undefined)}
        storeBusy={storeBusy}
        disclosure={disclosure}
        onBuy={() => pick && void buy(pick)}
        onManage={toManage}
        onRestore={() => void restoreAll()}
        onTerms={() => void open(BLENDN_LINKS.terms)}
        onPrivacy={() => void open(BLENDN_LINKS.privacy)}
      />
      {/* Drawn here, so it presents from the paywall (inside its RouteModal): the root sheet would wait behind it. */}
      <StoreErrorSheet error={storeError} onClose={() => setStoreError(null)} onManage={manage} />
    </View>
  )
}

/** Violet world: Blendn+ is yours, not an outing: one hue on this screen (`HueProvider`), so the plan's radio and the dock agree. */
export default function PlusScreen() {
  return (
    <HueProvider value="violet">
      <RouteModal>
        <PlusScreenContent />
      </RouteModal>
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
  // The board's 14 between sections: SPACE.md, the nearer of 12 / 16 on a page whose DS rows already run taller.
  content: { paddingHorizontal: SPACE.gutter, gap: SPACE.md },
  section: { gap: SPACE.sm },
  nothing: { borderRadius: RADIUS.sheet, backgroundColor: COLOR.surface, padding: SPACE.lg, gap: SPACE.xs },
  ink: { color: COLOR.textPrimary, textAlign: 'center' },
  secondary: { color: COLOR.textSecondary, textAlign: 'center' },
  inline: { alignItems: 'center' },
  loading: { height: SPACE.xxxl + SPACE.xl, alignItems: 'center', justifyContent: 'center' },
})

/** remaining-screens 02 A: the store has nothing to sell on this phone — said once, and Restore is the dock's one action. */
function NothingOnSale() {
  const bold = useBoldText()
  return (
    <View testID="plus-nothing-on-sale" accessible style={styles.nothing}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.ink]}>Plans aren’t on sale here yet</Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.secondary]}>The store has nothing to sell on this phone. If you bought Blend’n+ before, restore it.</Text>
    </View>
  )
}
