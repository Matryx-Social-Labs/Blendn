import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native'
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
import { notePaywallClosed, notePaywallEvent } from '../lib/paywall'

type Phase = 'idle' | 'confirming' | 'pending' | 'slow' | 'done'

/** Said aloud as the screen's state changes: iOS VoiceOver ignores `accessibilityLiveRegion`. */
const say = (text: string) => AccessibilityInfo.announceForAccessibility(text)

/**
 * Triggers that are themselves a gated moment: the server refused "stay"
 * (`go_live_expiry`) or locked nights (`recap`). Anywhere else, plans show
 * only when the server says Blendn+ is for sale to this person (`gated`).
 */
const GATED_TRIGGERS = new Set(['go_live_expiry', 'recap'])

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
  /** undefined: loading; null: the store could not be reached; []: nothing to sell. */
  const [offers, setOffers] = useState<PlusOffer[] | null | undefined>(undefined)
  const [buyable, setBuyable] = useState(false)
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [notice, setNotice] = useState<{ text: string; manage?: boolean } | null>(null)
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
      notePaywallClosed()
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

  useEffect(() => {
    apiClient
      .getMyPlus()
      .then((res) => {
        if (mounted.current && res.success && res.data) setStatus(res.data)
      })
      .catch(() => {})
    fetchOffers()
  }, [fetchOffers])

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
        if (granted) setStatus(granted)
        setPhase(granted ? 'done' : 'slow')
        say(granted ? "You're in." : 'Taking longer than usual.')
      }
    }
  }

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
        setNotice({ text: result.message, manage: result.manage })
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

  const restoreAll = async () => {
    if (working.current || !buyable) return
    working.current = true
    setBusy('restore')
    setNotice(null)
    try {
      const result = await restore(userId)
      if (!mounted.current) return
      if (result.kind === 'nothing' || result.kind === 'failed') {
        const text = result.kind === 'nothing' ? 'No purchases to restore' : result.message
        setNotice({ text })
        say(text)
        return
      }
      outcome.current = 'restored'
      notePaywallEvent('restored', trigger)
      await confirm()
    } finally {
      working.current = false
      if (mounted.current) setBusy(null)
    }
  }

  const open = (url: string) => Linking.openURL(url).catch(() => showToast("That page didn't open. Try again.", 'error'))
  const manage = async () => open(await manageSubscriptionUrl())
  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/events' as never))

  const statusLine = plusStatusLine(status)
  // Never sell what is free: plans only in a gated moment, or where the server says Plus is for sale (review H2).
  const forSale = GATED_TRIGGERS.has(trigger) || status?.gated === true
  const sellable = purchasesAvailable() && buyable && (offers?.length ?? 0) > 0
  // Anything bought or restored moves the phase on (pending, confirming, …): from then the way out is Done.
  const finished = phase !== 'idle'

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <AppHeader title="Blendn+" rightTextButton={{ label: finished ? 'Done' : 'Not now', onPress: close }} />
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

        {!forSale && status ? (
          <Text variant="bodyStrong">
            {"Blendn+ is free during launch in your city. Staying live and your full night history are everyone's for now — nothing to buy."}
          </Text>
        ) : null}

        {phase === 'confirming' ? (
          <View style={styles.inline} accessibilityLiveRegion="polite">
            <ActivityIndicator color={EMBER.textSecondary} />
            <Text variant="meta">Confirming with the store…</Text>
          </View>
        ) : phase === 'slow' ? (
          <Text variant="meta" accessibilityLiveRegion="polite">
            {"Taking longer than usual — it'll unlock as soon as the store confirms."}
          </Text>
        ) : phase === 'pending' ? (
          <Text variant="meta" accessibilityLiveRegion="polite">
            {"Your payment is pending. Blendn+ unlocks once your bank or the store confirms it — that can take a while. You can close this; we'll pick it up when it does."}
          </Text>
        ) : phase === 'done' ? (
          <Text variant="bodyStrong" accessibilityLiveRegion="polite">{"You're in."}</Text>
        ) : null}

        {/*
          Listed and buyable even with Blendn+ already on (a grant, a Night Pass):
          App Review signs in with a granted account and must be able to buy
          every product (guideline 2.1(b)); the status line says what you have.
        */}
        {!forSale ? null : offers === undefined ? (
          <ActivityIndicator color={EMBER.textSecondary} accessibilityLabel="Loading prices" />
        ) : offers === null ? (
          <View style={styles.inline}>
            <Text variant="meta">{"Couldn't load prices."}</Text>
            <Pressable onPress={retryOffers} accessibilityRole="button" style={styles.quiet}>
              <Text variant="meta" style={styles.underline}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.offers}>
            {offers.map((offer) => {
              const disabled = !sellable || busy !== null
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
          <View style={styles.inline}>
            <Text variant="bodyStrong" accessibilityLiveRegion="polite">{notice.text}</Text>
            {notice.manage ? (
              <Pressable onPress={() => void manage()} accessibilityRole="button" style={styles.quiet}>
                <Text variant="meta" style={styles.underline}>Manage subscription</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* App Store 3.1.2: what renews, how to cancel, and the terms — beside the buttons. */}
        {forSale ? (
          <Text variant="caption" color={EMBER.textSecondary}>
            Subscriptions renew automatically at the price shown until you cancel, at least 24 hours before the period
            ends. Cancel any time in your App Store or Google Play account settings. The Night Pass is a one-time purchase
            for 24 hours and does not renew.
          </Text>
        ) : null}
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
            // Off while buying, restoring or confirming either: `busy` holds until the confirmation ends.
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
