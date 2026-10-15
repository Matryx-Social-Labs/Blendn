import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect, useIsFocused, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppHeader } from '../../components/AppHeader'
import ScalePress from '../../components/motion/ScalePress'
import { useToast } from '../../components/Toast'
import { PlaceholderBanner } from '../../components/ui/PlaceholderBanner'
import { Text } from '../../components/ui/Text'
import { Logger } from '../../lib/logger'
import AsyncStorage from '@react-native-async-storage/async-storage'

import ActionTray from '../../components/ActionTray'
import { codeIsFresh, codeLife, knownLine, maybeLaterKey, nextRefreshMs, offersApi, offerStateLine, spacedCode, type OfferReportReason, type OpenedOffer, type RegularPrefs } from '../../lib/offers'
import { serverNow } from '../../lib/serverClock'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, tint } from '../../lib/theme'

/**
 * An offer and its door pass — PLACEHOLDER DESIGN (plan v2 step 12;
 * docs/PLACEHOLDER_SCREENS.md §16).
 *
 * Opened from the push or the bell. The place and its words come from the
 * server here, never from the push (a lock screen names nothing). While the
 * offer can be used, the pass is live: the server's six-character code, a
 * clock that runs, a bar that drains to the code's next turn and a pulse — so a
 * screenshot is visibly dead, and its code stops working within a minute.
 * Staff type the code on their screen and tap "Redeemed"; this screen asks
 * the server again before each turn and shows "Redeemed" when it says so.
 *
 * Below, once: "Let <place> know you're a regular?" — yes sends `known: true`;
 * "Maybe later" sends nothing (RG-I02).
 */
export default function OfferScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const focused = useIsFocused()
  const { showToast } = useToast()
  const [offer, setOffer] = useState<OpenedOffer | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<RegularPrefs | null>(null)
  /** "Maybe later" for this place, remembered on this phone (L9): null while it is being read. */
  const [later, setLater] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [reporting, setReporting] = useState(false)

  const seq = useRef(0)
  /** Bumped by every answer, good or bad, so the refresh below re-arms even when the code has not turned yet. */
  const [answers, setAnswers] = useState(0)
  const load = useCallback(() => {
    if (!id) return
    const mine = ++seq.current
    offersApi
      .open(id)
      .then((res) => {
        if (mine !== seq.current) return
        if (res.success && res.data) {
          setOffer(res.data.offer)
          setFailed(null)
        } else {
          setFailed(res.errorCode === 'NOT_FOUND' ? 'This offer isn\'t yours to open.' : res.error || "This offer didn't load.")
        }
      })
      .catch((error) => {
        if (mine !== seq.current) return
        Logger.warn('offers', 'Offer load threw', { error: String(error) })
        setFailed("This offer didn't load.")
      })
      .finally(() => {
        if (mine === seq.current) setAnswers((n) => n + 1)
      })
  }, [id])
  useFocusEffect(load)

  // Back from the background: the code has turned.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load()
    })
    return () => sub.remove()
  }, [load])

  // While the pass is up, ask again before the code turns — and so see "Redeemed" soon after staff tap it.
  // Re-armed after every answer: the ask a second before the turn still gets the current code (same
  // rotatesAt), and a failed ask changes nothing — keyed on rotatesAt alone, either one ended the chain.
  const rotatesAt = offer?.pass?.rotatesAt ?? null
  useEffect(() => {
    if (!focused || offer?.state !== 'live') return
    const timer = setTimeout(load, nextRefreshMs(rotatesAt, serverNow()))
    return () => clearTimeout(timer)
  }, [focused, offer?.state, rotatesAt, answers, load])

  const venueId = offer?.venue.id ?? null
  useEffect(() => {
    if (!venueId) return
    AsyncStorage.getItem(maybeLaterKey(venueId))
      .then((v) => setLater(v === '1'))
      .catch(() => setLater(false))
    offersApi
      .prefs(venueId)
      .then((res) => {
        if (res.success && res.data) setPrefs(res.data)
      })
      .catch(() => {})
  }, [venueId])

  const sayYes = async () => {
    if (!venueId || saving) return
    setSaving(true)
    try {
      const res = await offersApi.setPrefs(venueId, { known: true })
      if (res.success && res.data) setPrefs(res.data)
      else showToast(res.error || "That didn't save. Try again.", 'error')
    } finally {
      setSaving(false)
    }
  }

  const maybeLater = () => {
    setLater(true)
    if (venueId) AsyncStorage.setItem(maybeLaterKey(venueId), '1').catch(() => {})
  }

  // "Stop offers from <place>", beside the pass (review M6): the same switch as on the place's page.
  const stopOffers = async () => {
    if (!venueId || saving) return
    setSaving(true)
    try {
      const res = await offersApi.setPrefs(venueId, { offersMuted: true })
      if (res.success && res.data) {
        setPrefs(res.data)
        showToast(`No more offers from ${offer?.venue.name ?? 'this place'}. Turn them back on from its page.`, 'success')
      } else showToast(res.error || "That didn't save. Try again.", 'error')
    } finally {
      setSaving(false)
    }
  }

  const report = async (reason: OfferReportReason) => {
    setReporting(false)
    if (!id) return
    const res = await offersApi.report(id, reason)
    if (res.success) showToast('Reported. Thanks — we look at every report.', 'success')
    else showToast(res.error || "That report didn't go through. Try again.", 'error')
  }

  const stateLine = offer ? offerStateLine(offer.state, offer.venue.name) : null

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <AppHeader title="Offer" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <PlaceholderBanner />
        {offer ? (
          <View style={styles.body}>
            <Text variant="meta">{offer.venue.name}</Text>
            <Text variant="title" accessibilityRole="header">
              {offer.text}
            </Text>
            <Text variant="meta">
              Until {new Date(offer.endsAt).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}
            </Text>

            {offer.state === 'live' && offer.pass ? (
              <DoorPass code={offer.pass.code} rotatesAt={offer.pass.rotatesAt} venueName={offer.venue.name} />
            ) : (
              <View style={styles.panel} accessibilityLiveRegion="polite">
                <Ionicons
                  name={offer.state === 'redeemed' ? 'checkmark-circle' : 'time-outline'}
                  size={ICON.lg}
                  color={offer.state === 'redeemed' ? EMBER.success : EMBER.textSecondary}
                />
                <Text variant="bodyStrong">{stateLine}</Text>
              </View>
            )}

            {prefs && !prefs.offersMuted ? (
              <Pressable onPress={stopOffers} disabled={saving} accessibilityRole="button" style={styles.quiet}>
                <Text variant="meta">{`Stop offers from ${offer.venue.name}`}</Text>
              </Pressable>
            ) : null}

            {prefs && !prefs.known && later === false ? (
              <View style={styles.panel}>
                <Text variant="bodyStrong">{`Let ${offer.venue.name} know you're a regular?`}</Text>
                <Text variant="meta">{`${knownLine(prefs, offer.venue.name)} You can take it back on the place's page.`}</Text>
                <View style={styles.row}>
                  <ScalePress style={styles.secondary} onPress={sayYes} disabled={saving} accessibilityRole="button" accessibilityState={{ busy: saving }}>
                    <Text variant="button">Yes, let them know</Text>
                  </ScalePress>
                  <Pressable onPress={maybeLater} accessibilityRole="button" style={styles.quiet}>
                    <Text variant="meta">Maybe later</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            {prefs?.known ? <Text variant="meta">{`${offer.venue.name} knows you're a regular.`}</Text> : null}

            <Pressable onPress={() => router.push(`/venue/${offer.venue.id}` as never)} accessibilityRole="link" style={styles.quiet}>
              <Text variant="meta" color={EMBER.textPrimary} style={styles.underline}>{`See ${offer.venue.name}`}</Text>
            </Pressable>
            <Pressable onPress={() => setReporting(true)} accessibilityRole="button" style={styles.quiet}>
              <Text variant="meta">Report this offer</Text>
            </Pressable>
          </View>
        ) : failed ? (
          <View style={styles.body} accessibilityLiveRegion="polite">
            <Text variant="heading">{failed}</Text>
            <ScalePress style={styles.panel} onPress={load} accessibilityRole="button" accessibilityLabel="Try again">
              <Text variant="bodyStrong">Try again</Text>
            </ScalePress>
          </View>
        ) : (
          <ActivityIndicator color={EMBER.textSecondary} accessibilityLabel="Loading the offer" />
        )}
      </ScrollView>
      <ActionTray
        visible={reporting}
        title="Report this offer"
        message="What's wrong with it? We look at every report; the place isn't told who sent it."
        buttons={[
          { label: 'Offensive', onPress: () => void report('offensive') },
          { label: 'Misleading', onPress: () => void report('misleading') },
          { label: 'Spam', onPress: () => void report('spam') },
          { label: 'Feels unsafe', onPress: () => void report('unsafe') },
          { label: 'Something else', onPress: () => void report('other') },
          { label: 'Cancel', onPress: () => setReporting(false) },
        ]}
        onClose={() => setReporting(false)}
        layout="stack"
        size="expanded"
      />
    </SafeAreaView>
  )
}

/**
 * The pass, a leaf that ticks itself once a second (so the screen above does
 * not re-render every second): the server's code, the time now, a bar that
 * drains to the code's next turn, and a pulse. With reduced motion the pulse
 * holds still; the clock and the bar still move.
 */
function DoorPass({ code, rotatesAt, venueName }: { code: string; rotatesAt: string; venueName: string }) {
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow()), 1000)
    return () => clearInterval(timer)
  }, [])
  const reduceMotion = useReducedMotion()
  const pulse = useSharedValue(1)
  useEffect(() => {
    if (reduceMotion) return
    pulse.set(withRepeat(withTiming(0.35, { duration: 900 }), -1, true))
  }, [pulse, reduceMotion])
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.get() }))
  const clock = new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })

  return (
    <View
      style={styles.pass}
      accessible
      accessibilityRole="text"
      accessibilityLabel={
        codeIsFresh(rotatesAt, now)
          ? `Door pass for ${venueName}. Code ${code.split('').join(' ')}. Show it to the staff.`
          : `Door pass for ${venueName}. Getting a fresh code.`
      }
    >
      <View style={styles.row}>
        <Animated.View style={[styles.liveDot, pulseStyle]} />
        <Text variant="label" color={EMBER.onGradient}>
          {`LIVE PASS · ${clock}`}
        </Text>
      </View>
      {/* A code past its turn with no fresh one is hidden, never shown stale (L2). */}
      {codeIsFresh(rotatesAt, now) ? (
        // design-exception: the code is read across a door, so it is set wider than any role.
        <Text variant="display" color={EMBER.onGradient} style={styles.code}>
          {spacedCode(code)}
        </Text>
      ) : (
        <Text variant="bodyStrong" color={EMBER.onGradient}>
          Getting a fresh code…
        </Text>
      )}
      <View style={styles.track}>
        <View style={[styles.bar, { width: `${Math.round(codeLife(rotatesAt, now) * 100)}%` }]} />
      </View>
      <Text variant="meta" color={EMBER.onGradient}>
        Show this at the door. Staff type the code and tap Redeemed.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  content: { paddingHorizontal: GUTTER, paddingVertical: SPACE.lg, gap: SPACE.xl },
  body: { gap: SPACE.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' },
  panel: {
    gap: SPACE.sm,
    padding: SPACE.lg,
    borderRadius: EMBER_RADIUS.md,
    borderWidth: 1,
    borderColor: EMBER.separator,
    backgroundColor: EMBER.surfaceSunken,
  },
  pass: { gap: SPACE.md, padding: SPACE.xl, borderRadius: EMBER_RADIUS.lg, backgroundColor: EMBER.accent, alignItems: 'center' },
  // design-exception: wide tracking so six characters read as two groups at arm's length.
  code: { letterSpacing: 6, textAlign: 'center' },
  track: { alignSelf: 'stretch', height: SPACE.xs, borderRadius: EMBER_RADIUS.pill, backgroundColor: tint(EMBER.onGradient, 0.25) },
  bar: { height: SPACE.xs, borderRadius: EMBER_RADIUS.pill, backgroundColor: EMBER.onGradient },
  liveDot: { width: SPACE.sm, height: SPACE.sm, borderRadius: EMBER_RADIUS.pill, backgroundColor: EMBER.onGradient },
  // Bordered, not filled: the pass is this screen's one accent.
  secondary: {
    minHeight: CONTROL.md,
    borderRadius: EMBER_RADIUS.pill,
    borderWidth: 1,
    borderColor: EMBER.separator,
    backgroundColor: tint(EMBER.textPrimary, 0.06),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.lg,
  },
  quiet: { minHeight: CONTROL.md, justifyContent: 'center', alignSelf: 'flex-start' },
  underline: { textDecorationLine: 'underline' },
})
