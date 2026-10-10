import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppHeader } from '../components/AppHeader'
import ScalePress from '../components/motion/ScalePress'
import { useToast } from '../components/Toast'
import { PlaceholderBanner } from '../components/ui/PlaceholderBanner'
import { Text } from '../components/ui/Text'
import { apiClient } from '../lib/apiClient'
import { BLENDN_LINKS } from '../lib/links'
import { isPaywallTrigger } from '../lib/paywallPolicy'
import { PLUS_FEATURES, plusStatusLine, waitForPlus, type PlusStatus } from '../lib/plus'
import { buyPackage, canBuyAs, loadPlusOffers, manageSubscriptionUrl, purchasesAvailable, restore, type PlusOffer } from '../lib/purchases'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, OPACITY, SPACE } from '../lib/theme'
import { useAuth } from '../lib/useAuth'
import { notePaywallEvent } from '../lib/paywall'

type Phase = 'idle' | 'confirming' | 'slow' | 'done'

/**
 * Blendn+ — PLACEHOLDER DESIGN (plan v2 step 11; docs/PLACEHOLDER_SCREENS.md §13).
 *
 * What Plus is, the store's packages at the store's prices, and the way out
 * ("Not now"). Opened through `lib/paywall.ts`, whose policy decides when
 * it may arrive by itself. The store sells; the **server** unlocks: after a
 * purchase or a restore this asks `GET /me/plus` until the webhook has landed,
 * and never reads RevenueCat to decide what you have. The buy buttons stay off
 * unless RevenueCat's user is this account (`canBuyAs`) — never anonymous.
 */
export default function PlusScreen() {
  const params = useLocalSearchParams<{ trigger?: string }>()
  const trigger = isPaywallTrigger(params.trigger) ? params.trigger : 'profile'
  const { user } = useAuth()
  const userId = user?.id ?? null
  const { showToast } = useToast()

  const [status, setStatus] = useState<PlusStatus | null>(null)
  const [offers, setOffers] = useState<PlusOffer[] | null>(null)
  const [buyable, setBuyable] = useState(false)
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [notice, setNotice] = useState<string | null>(null)
  /** What happened here, so closing after a purchase is not logged as a dismissal. */
  const outcome = useRef<'purchased' | 'pending' | 'restored' | null>(null)
  const mounted = useRef(true)

  // Shown on arrival; dismissed on leaving by any door (Not now, a swipe, back) unless something was bought.
  useEffect(() => {
    mounted.current = true
    notePaywallEvent('shown', trigger)
    return () => {
      mounted.current = false
      if (!outcome.current) notePaywallEvent('dismissed', trigger)
    }
  }, [trigger])

  useEffect(() => {
    void apiClient.getMyPlus().then((res) => {
      if (mounted.current && res.success && res.data) setStatus(res.data)
    })
    void Promise.all([loadPlusOffers(), canBuyAs(userId)]).then(([loaded, ok]) => {
      if (!mounted.current) return
      setOffers(loaded)
      setBuyable(ok)
    })
  }, [userId])

  const confirm = async () => {
    setPhase('confirming')
    const granted = await waitForPlus(() => !mounted.current)
    if (!mounted.current) return
    if (granted) setStatus(granted)
    setPhase(granted ? 'done' : 'slow')
  }

  const buy = async (offer: PlusOffer) => {
    if (!buyable || busy) return
    setBusy('buy')
    setNotice(null)
    notePaywallEvent('purchase_started', trigger)
    const result = await buyPackage(offer.pkg)
    if (!mounted.current) return
    setBusy(null)
    if (result.kind === 'cancelled') return
    if (result.kind === 'failed') return setNotice(result.message)
    outcome.current = result.kind
    if (result.kind === 'purchased') notePaywallEvent('purchased', trigger)
    void confirm()
  }

  const restoreAll = async () => {
    if (!buyable || busy) return
    setBusy('restore')
    setNotice(null)
    const result = await restore()
    if (!mounted.current) return
    setBusy(null)
    if (result.kind === 'nothing') return setNotice('No purchases to restore')
    if (result.kind === 'failed') return setNotice(result.message)
    outcome.current = 'restored'
    notePaywallEvent('restored', trigger)
    void confirm()
  }

  const open = (url: string) => Linking.openURL(url).catch(() => showToast("That page didn't open. Try again.", 'error'))
  const manage = async () => open(await manageSubscriptionUrl())
  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/events' as never))

  const statusLine = plusStatusLine(status)
  const sellable = purchasesAvailable() && buyable && (offers?.length ?? 0) > 0
  const settled = phase === 'done' || phase === 'slow'

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <AppHeader title="Blendn+" rightTextButton={{ label: settled ? 'Done' : 'Not now', onPress: close }} />
      <ScrollView contentContainerStyle={styles.content}>
        <PlaceholderBanner />

        {statusLine ? (
          <View style={styles.statusPill} accessibilityRole="text">
            <Text variant="label" color={EMBER.onGradient}>{statusLine}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          {PLUS_FEATURES.map((f, i) => (
            <View key={f.title}>
              {i > 0 ? <View style={styles.divider} /> : null}
              <View style={styles.row} accessible accessibilityLabel={`${f.title}. ${f.detail}`}>
                <Ionicons name={f.icon} size={ICON.md} color={EMBER.textPrimary} />
                <View style={styles.rowText}>
                  <Text variant="bodyStrong">{f.title}</Text>
                  <Text variant="meta">{f.detail}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {phase === 'confirming' ? (
          <View style={styles.inline} accessibilityLiveRegion="polite">
            <ActivityIndicator color={EMBER.textSecondary} />
            <Text variant="meta">Confirming with the store…</Text>
          </View>
        ) : phase === 'slow' ? (
          <Text variant="meta" accessibilityLiveRegion="polite">
            {"Taking longer than usual — it'll unlock as soon as the store confirms."}
          </Text>
        ) : phase === 'done' ? (
          <Text variant="bodyStrong" accessibilityLiveRegion="polite">{"You're in."}</Text>
        ) : null}

        {/*
          Listed and buyable even with Blendn+ already on (a grant, a Night Pass):
          App Review signs in with a granted account and must be able to buy
          every product (guideline 2.1(b)); the status line says what you have.
        */}
        {offers === null ? (
          <ActivityIndicator color={EMBER.textSecondary} accessibilityLabel="Loading prices" />
        ) : (
          <View style={styles.offers}>
            {offers.map((offer) => {
              const disabled = !sellable || busy !== null || phase === 'confirming'
              return (
                <ScalePress
                  key={offer.pkg.identifier}
                  style={[styles.offer, disabled && styles.dimmed]}
                  onPress={() => void buy(offer)}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityLabel={`${offer.title}, ${offer.length}, ${offer.price}`}
                  accessibilityState={{ disabled, busy: busy === 'buy' }}
                >
                  <View style={styles.rowText}>
                    <Text variant="bodyStrong">{offer.title}</Text>
                    <Text variant="meta">{offer.length}</Text>
                  </View>
                  {/* App Store 3.1.2: the billed amount is the most prominent thing on the row. */}
                  <Text variant="heading">{offer.price}</Text>
                </ScalePress>
              )
            })}
            {!sellable ? <Text variant="meta">{"Purchases aren't available yet."}</Text> : null}
          </View>
        )}

        {notice ? (
          <Text variant="bodyStrong" accessibilityLiveRegion="polite">{notice}</Text>
        ) : null}

        {/* App Store 3.1.2: what renews, how to cancel, and the terms — beside the buttons. */}
        <Text variant="caption" color={EMBER.textSecondary}>
          Subscriptions renew automatically at the price shown until you cancel, at least 24 hours before the period
          ends. Cancel any time in your App Store or Google Play account settings. The Night Pass is a one-time purchase
          for 24 hours and does not renew.
        </Text>
        <View style={styles.links}>
          <Pressable onPress={() => void open(BLENDN_LINKS.terms)} accessibilityRole="link" style={styles.quiet}>
            <Text variant="meta" style={styles.underline}>Terms of Use</Text>
          </Pressable>
          <Pressable onPress={() => void open(BLENDN_LINKS.privacy)} accessibilityRole="link" style={styles.quiet}>
            <Text variant="meta" style={styles.underline}>Privacy Policy</Text>
          </Pressable>
        </View>

        <View style={styles.links}>
          <Pressable
            onPress={() => void restoreAll()}
            disabled={!buyable || busy !== null}
            accessibilityRole="button"
            accessibilityState={{ disabled: !buyable || busy !== null, busy: busy === 'restore' }}
            style={[styles.quiet, (!buyable || busy !== null) && styles.dimmed]}
          >
            <Text variant="meta">{busy === 'restore' ? 'Restoring…' : 'Restore purchases'}</Text>
          </Pressable>
          <Pressable onPress={() => void manage()} accessibilityRole="button" style={styles.quiet}>
            <Text variant="meta">Manage subscription</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  content: { paddingHorizontal: GUTTER, paddingVertical: SPACE.lg, gap: SPACE.xl },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACE.md,
    minHeight: CONTROL.sm,
    justifyContent: 'center',
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.accent,
  },
  card: {
    backgroundColor: EMBER.surfaceSunken,
    borderRadius: EMBER_RADIUS.md,
    borderWidth: 1,
    borderColor: EMBER.separator,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, padding: SPACE.lg },
  rowText: { flex: 1, gap: SPACE.xs },
  divider: { height: 1, backgroundColor: EMBER.separator, marginLeft: SPACE.lg + ICON.md + SPACE.md },
  inline: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  offers: { gap: SPACE.md },
  offer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    padding: SPACE.lg,
    minHeight: CONTROL.lg,
    borderRadius: EMBER_RADIUS.md,
    borderWidth: 1,
    borderColor: EMBER.separator,
    backgroundColor: EMBER.surface,
  },
  dimmed: { opacity: OPACITY.disabled },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xl },
  quiet: { minHeight: CONTROL.md, justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
})
