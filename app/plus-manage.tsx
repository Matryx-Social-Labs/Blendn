import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button } from '../components/ds/Button'
import { Spinner } from '../components/ds/Loader'
import { ManageStatusRow } from '../components/ds/ManageStatusRow'
import { PlanCard, PlanList } from '../components/ds/PlanCard'
import { SettingsGroup, SettingsRow } from '../components/ds/SettingsRow'
import { font, HueProvider, useBoldText } from '../components/ds/shared'
import { StateScreen } from '../components/ds/StateScreen'
import { TopBar } from '../components/ds/TopBar'
import { openStoreSubscriptions } from '../components/plus/storeActions'
import { useSkeletonCrossfade } from '../components/motion/useSkeletonCrossfade'
import { useToast } from '../components/Toast'
import { apiClient } from '../lib/apiClient'
import { COLOR, FONT_FAMILY, SPACE, MAX_FONT_SCALE } from '../lib/design/tokens'
import { ctaParts, defaultPick, isNightPass, planRowFor, planSubline, PLUS_FEATURES, storeRow, waitForPlus, type PlusStatus } from '../lib/plus'
import { manageCard, shortDate, startsAgain } from '../lib/plusManage'
import { canBuyAs, loadPlusOffers, restore, type PlusOffer, type RestoreOutcome } from '../lib/purchases'
import { useAuth } from '../lib/useAuth'
import { useTopBarOverlay } from '../lib/useTopBarState'

const STORE: 'ios' | 'android' = Platform.OS === 'android' ? 'android' : 'ios'
const FOOT = 'Cancelling is one tap into the store. Nothing here asks you to stay.'

/**
 * Manage (Settings › Blend'n+, Flow 12 · 12.3, remaining-screens 03 A): what is
 * true about your Blend'n+ in one card — the plan, the date, the store and what
 * it includes — then the two things you can do: change or cancel it in the
 * store (one tap, saying what cancelling costs) and restore purchases. A gift
 * or a Night Pass, where Blend'n+ is sold, lists the plans to keep it after its
 * date: a tap opens the page with that plan picked (decided 2026-11-19: the
 * board draws no buy button here, and App Review buys from a granted account
 * this way). Where a subscription ended or was refunded it sells: Start at the
 * store's own price, which opens the page. Cancelling is in the store; nothing
 * here asks you to stay.
 *
 * The server says what you have (`GET /me/plus`); this never reads RevenueCat for
 * it. A status the server does not describe yet is not drawn (`manageCard`).
 * Somebody with nothing to manage is sent to the page.
 */
function ManageContent() {
  const bold = useBoldText()
  const insets = useSafeAreaInsets()
  const bar = useTopBarOverlay()
  const { showToast } = useToast()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [status, setStatus] = useState<PlusStatus | null>(null)
  const [load, setLoad] = useState<'loading' | 'ok' | 'failed'>('loading')
  const [restoring, setRestoring] = useState(false)
  const [offers, setOffers] = useState<PlusOffer[] | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const read = useCallback(() => {
    apiClient
      .getMyPlus()
      .then((res) => {
        if (!mounted.current) return
        if (res.success && res.data) setStatus(res.data)
        setLoad(res.success && res.data ? 'ok' : 'failed')
      })
      .catch(() => mounted.current && setLoad('failed'))
  }, [])
  useFocusEffect(read)

  const card = manageCard(status, STORE)
  // Nothing to manage (it ended unnoticed, or it never began): the page is where Blend'n+ is.
  const nothing = load === 'ok' && !card
  const arrive = useSkeletonCrossfade(load === 'loading' || nothing)
  useEffect(() => {
    if (nothing) router.replace({ pathname: '/plus', params: { trigger: 'profile' } } as never)
  }, [nothing])

  // A gift of ours (D4): no store holds it, so no store row and no word about cancelling in one.
  const granted = status?.source === 'grant'
  // Bought outside the app: the status line says so; there is no store to open (OD-5).
  const outside = status?.source === 'razorpay'
  // The price of starting again, only where this screen would sell it.
  const sells = card ? startsAgain(card.status) && status?.gated === true : false
  // A gift or a pass ends on its date: the plans to keep it after, where Blend'n+ is sold (03 A).
  const keeps = status?.active === true && status.gated && !outside && (granted || status.product === 'night_pass')
  useEffect(() => {
    if (!sells && !keeps) return
    let cancelled = false
    void loadPlusOffers()
      .then((loaded) => !cancelled && setOffers(loaded ?? null))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [sells, keeps])
  const startCta = ctaParts(offers?.find((o) => o.pkg.identifier === '$rc_monthly'))

  const manage = () => void openStoreSubscriptions(() => showToast("That page didn’t open. Try again.", 'error'))

  const settle = async (result: RestoreOutcome) => {
    if (!mounted.current) return
    if (result.kind === 'nothing') return showToast('No purchases to restore', 'info')
    if (result.kind === 'failed') return showToast(result.message, 'error', { haptic: 'error' })
    showToast('Restored', 'success', { haptic: 'success' })
    // The server confirms what the store found; the card reads what it says.
    if (await waitForPlus(() => !mounted.current)) read()
  }
  const restoreAll = async () => {
    if (restoring) return
    if (!(await canBuyAs(userId))) return showToast("We couldn’t connect your account to the store. Close this and try again.", 'error', { haptic: 'error' })
    setRestoring(true)
    try {
      // The store answered after we had said it did not: say what it said.
      await settle(await restore(userId, (late) => void settle(late)))
    } finally {
      if (mounted.current) setRestoring(false)
    }
  }

  const start = () => router.push({ pathname: '/plus', params: { trigger: 'profile' } } as never)
  const buyPlan = (plan: string) => router.push({ pathname: '/plus', params: { trigger: 'profile', plan } } as never)
  // A store subscription: changed or cancelled in its store, and the card says what it includes.
  const subscription = !granted && !outside && status?.product !== 'night_pass'
  const row = card ? storeRow(card.store, status?.expiresAt) : null
  const until = shortDate(status?.expiresAt)
  const pick = defaultPick(offers ?? [])

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: bar.contentTop, paddingBottom: insets.bottom + SPACE.xl }]}
        scrollIndicatorInsets={{ top: bar.indicatorTop }}
        showsVerticalScrollIndicator={false}
        {...bar.scrollProps}
      >
        {load === 'loading' || nothing ? (
          <View style={styles.loading} accessible accessibilityLabel="Loading Blend’n+">
            <Spinner size={20} />
          </View>
        ) : load === 'failed' && !card ? (
          <StateScreen
            icon="cloud-off"
            title="Couldn’t load Blend’n+"
            body="Check your connection and try again."
            actions={[{ label: 'Try again', kind: 'lit', onPress: () => { setLoad('loading'); read() } }]}
            testID="plus-manage-failed"
          />
        ) : card ? (
          <Animated.View entering={arrive} style={styles.body}>
            <ManageStatusRow
              status={card.status}
              sentence={card.sentence}
              store={card.store}
              features={subscription && status?.active ? PLUS_FEATURES.map((f) => f.title) : undefined}
              onFix={manage}
              testID="plus-manage-status"
            />
            <SettingsGroup>
              {subscription && row ? (
                <SettingsRow
                  icon="external-link"
                  title={row.title}
                  hint={row.hint}
                  trail="external"
                  opens={`opens ${card.store === 'android' ? 'Google Play' : 'the App Store'}`}
                  onPress={manage}
                  testID="plus-manage-store"
                />
              ) : null}
              <SettingsRow
                icon="rotate-ccw"
                title="Restore purchases"
                hint={granted ? 'Bought it in a store before? Bring it back' : undefined}
                trail="chevron"
                busy={restoring}
                disabled={restoring}
                onPress={() => void restoreAll()}
                testID="plus-manage-restore"
              />
            </SettingsGroup>
            {keeps && offers?.length ? (
              <View style={styles.keep}>
                <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE.note} style={[font('note', bold, FONT_FAMILY.brand[500]), styles.label]}>
                  {until ? `Keep it after ${until}` : 'Keep it going'}
                </Text>
                <PlanList testID="plus-manage-plans" cards>
                  {[...offers.filter((o) => !isNightPass(o)), ...offers.filter(isNightPass)].map((offer) => (
                    <PlanCard
                      key={offer.pkg.identifier}
                      testID={`manage-plan-${offer.pkg.identifier}`}
                      name={isNightPass(offer) ? 'Night Pass' : (planRowFor(offer)?.name ?? offer.title)}
                      per={planRowFor(offer)?.per}
                      sub={isNightPass(offer) ? 'One night, 24 hours · doesn’t renew' : (planSubline(offer, offers) ?? undefined)}
                      price={offer.price}
                      selected={offer.pkg.identifier === pick}
                      onPress={() => buyPlan(offer.pkg.identifier)}
                    />
                  ))}
                </PlanList>
              </View>
            ) : null}
            {card.status === 'launch' ? (
              <Button kind="secondary" label="Nothing to buy during launch" disabled />
            ) : sells ? (
              <Button
                // The dock's words (`ctaParts`): with no price from the store, "Start Blend’n+" alone.
                label={startCta.lead}
                price={startCta.price}
                accessibilityLabel={startCta.spoken}
                onPress={start}
                testID="plus-manage-start"
              />
            ) : null}
            {subscription ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.foot]}>{FOOT}</Text> : null}
          </Animated.View>
        ) : null}
      </ScrollView>
      <View style={bar.barPin} onLayout={bar.onBarLayout} pointerEvents="box-none">
        <TopBar title="Blend’n+" state={bar.state} onBack={() => router.back()} testID="plus-manage-top" />
      </View>
    </View>
  )
}

/** Violet world: Blend'n+ is yours, not an outing (`HueProvider`), as Settings and the page. */
export default function PlusManageScreen() {
  return (
    <HueProvider value="violet">
      <ManageContent />
    </HueProvider>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: SPACE.gutter, gap: SPACE.xl },
  body: { gap: SPACE.xl },
  loading: { height: SPACE.xxxl + SPACE.xl, alignItems: 'center', justifyContent: 'center' },
  foot: { color: COLOR.textTertiary, paddingHorizontal: SPACE.md },
  keep: { gap: SPACE.sm },
  label: { color: COLOR.textSecondary, paddingHorizontal: SPACE.xs },
})
