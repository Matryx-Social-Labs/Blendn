import { router, Stack, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button } from '../components/ds/Button'
import { Spinner } from '../components/ds/Loader'
import { ManageStatusRow } from '../components/ds/ManageStatusRow'
import { SettingsGroup, SettingsRow } from '../components/ds/SettingsRow'
import { font, HueProvider, useBoldText } from '../components/ds/shared'
import { StateScreen } from '../components/ds/StateScreen'
import { TopBar } from '../components/ds/TopBar'
import { openStoreSubscriptions } from '../components/plus/storeActions'
import { useToast } from '../components/Toast'
import { apiClient } from '../lib/apiClient'
import { COLOR, SPACE } from '../lib/design/tokens'
import { planRowFor, waitForPlus, type PlusStatus } from '../lib/plus'
import { manageCard, startsAgain } from '../lib/plusManage'
import { canBuyAs, loadPlusOffers, restore, type PlusOffer, type RestoreOutcome } from '../lib/purchases'
import { useAuth } from '../lib/useAuth'
import { useTopBarOverlay } from '../lib/useTopBarState'

const STORE: 'ios' | 'android' = Platform.OS === 'android' ? 'android' : 'ios'
const FOOT = 'Cancelling is one tap into the store. Nothing here asks you to stay.'

/**
 * Manage (Settings › Blend'n+, Flow 12 · 12.3, R4.1 12.2 · 12.3): what is true
 * about your Blend'n+ in one card, then the two things you can do — manage it in
 * the store (one tap) and restore purchases. Where a subscription ended or was
 * refunded, and only there, it sells: Start Blend'n+ at the store's own price,
 * which opens the page. Cancelling is in the store; nothing here asks you to stay.
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
  const [monthly, setMonthly] = useState<PlusOffer | null>(null)
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
  useEffect(() => {
    if (nothing) router.replace({ pathname: '/plus', params: { trigger: 'profile' } } as never)
  }, [nothing])

  // The price of starting again, only where this screen would sell it.
  const sells = card ? startsAgain(card.status) : false
  useEffect(() => {
    if (!sells) return
    let cancelled = false
    void loadPlusOffers()
      .then((offers) => !cancelled && setMonthly(offers?.find((o) => o.pkg.identifier === '$rc_monthly') ?? null))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [sells])

  const manage = () => void openStoreSubscriptions(() => showToast("That page didn't open. Try again.", 'error'))

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
    if (!(await canBuyAs(userId))) return showToast("We couldn't connect your account to the store. Close this and try again.", 'error', { haptic: 'error' })
    setRestoring(true)
    try {
      // The store answered after we had said it did not: say what it said.
      await settle(await restore(userId, (late) => void settle(late)))
    } finally {
      if (mounted.current) setRestoring(false)
    }
  }

  const start = () => router.push({ pathname: '/plus', params: { trigger: 'profile' } } as never)
  const storeName = STORE === 'android' ? 'Google Play' : 'the App Store'

  return (
    <View style={styles.container}>
      {/* Its own header is the design's TopBar; the route is not listed in the root layout, so it says so itself. */}
      <Stack.Screen options={{ headerShown: false }} />
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
          <>
            <ManageStatusRow status={card.status} sentence={card.sentence} store={STORE} onFix={manage} testID="plus-manage-status" />
            <SettingsGroup>
              <SettingsRow
                icon="external-link"
                title={`Manage in ${storeName}`}
                hint="Change plan, pause or cancel · one tap"
                trail="external"
                opens={`opens ${storeName}`}
                onPress={manage}
                testID="plus-manage-store"
              />
              <SettingsRow icon="rotate-ccw" title="Restore purchases" trail="chevron" busy={restoring} disabled={restoring} onPress={() => void restoreAll()} testID="plus-manage-restore" />
            </SettingsGroup>
            {card.status === 'launch' ? (
              <Button kind="secondary" label="Nothing to buy during launch" disabled />
            ) : sells ? (
              <Button
                label="Start Blend’n+ —"
                price={monthly ? { amount: monthly.price, per: planRowFor(monthly)?.per } : undefined}
                accessibilityLabel={monthly ? `Start Blend’n+, ${monthly.price} a month` : 'Start Blend’n+'}
                onPress={start}
                testID="plus-manage-start"
              />
            ) : null}
            <Text style={[font('meta', bold), styles.foot]}>{FOOT}</Text>
          </>
        ) : null}
      </ScrollView>
      <View style={bar.barPin} pointerEvents="box-none">
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
  loading: { height: SPACE.xxxl + SPACE.xl, alignItems: 'center', justifyContent: 'center' },
  foot: { color: COLOR.textTertiary, paddingHorizontal: SPACE.md },
})
