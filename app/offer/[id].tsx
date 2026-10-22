import AsyncStorage from '@react-native-async-storage/async-storage'
import { router, useFocusEffect, useIsFocused, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button } from '../../components/ds/Button'
import { useCoachMarkSpot } from '../../components/ds/CoachMarkHost'
import { font, useBoldText } from '../../components/ds/shared'
import { StateScreen } from '../../components/ds/StateScreen'
import { DoorTicket, OfferHeader, RegularAsk, RegularOff, RegularOn } from '../../components/offer/OfferSections'
import { SkeletonBlock } from '../../components/Skeleton'
import { useToast } from '../../components/Toast'
import { markCoachUsed, useCoachMark } from '../../lib/coachMarks'
import { COLOR, RADIUS, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { Logger } from '../../lib/logger'
import {
  maybeLaterKey,
  regularsActive,
  nextRefreshMs,
  OFFER_REPORT_REASONS,
  offersApi,
  passView,
  validUntil,
  type OfferReportReason,
  type OpenedOffer,
  type RegularPrefs,
} from '../../lib/offers'
import { serverNow, serverOffset } from '../../lib/serverClock'
import { showSheet, type Sheet } from '../../lib/sheet'

/** The ticket's height while it loads, so the page does not jump when it lands. */
const TICKET_SKELETON = 480
const COACH_TEXT = 'Show this to the staff. They type the code and tap Redeemed. It works once, today.'

/** `gone`: not yours to open (404), nothing to retry. `failed`: the read did not work, with the server's own words if it gave any. */
type Failure = { kind: 'gone' } | { kind: 'failed'; detail: string | null }

/**
 * An offer and its door pass (Flow 13 · 13.2, R3-G, R4-D13; plan v2 step 12;
 * guidelines/flow-13/flow13.js `pass`).
 *
 * Opened from the push or the bell. The place and its words come from the
 * server here, never from the push (a lock screen names nothing). While the
 * offer can be used, the pass is live: the server's six-character code, a
 * ring that drains to the code's next turn, a disc that pours — so a
 * screenshot is visibly dead, and its code stops working within a minute.
 * Staff type the code on their screen and tap "Redeemed"; this screen asks the
 * server again before each turn and shows "Redeemed" when it says so.
 *
 * Below, once: "Let <place> know you're a regular" — yes sends `known: true`;
 * "Not now" sends nothing (RG-I02). Report this offer and Stop offers from
 * <place> are under the ⋯.
 */
export default function OfferScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const focused = useIsFocused()
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const [offer, setOffer] = useState<OpenedOffer | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  /** The last read failed: a stale code then says it needs a connection, not that a fresh one is coming. */
  const [lastReadFailed, setLastReadFailed] = useState(false)
  const [prefs, setPrefs] = useState<RegularPrefs | null>(null)
  /** "Not now" for this place, remembered on this phone (L9): null while it is being read. */
  const [later, setLater] = useState<boolean | null>(null)
  /** They turned the yes off here: the card does not come straight back this visit. */
  const [turnedOff, setTurnedOff] = useState(false)
  const [saving, setSaving] = useState(false)

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
          setFailure(null)
          setLastReadFailed(false)
        } else {
          setLastReadFailed(true)
          setFailure(res.errorCode === 'NOT_FOUND' ? { kind: 'gone' } : { kind: 'failed', detail: res.error || null })
        }
      })
      .catch((error) => {
        if (mine !== seq.current) return
        Logger.warn('offers', 'Offer load threw', { error: String(error) })
        setLastReadFailed(true)
        setFailure({ kind: 'failed', detail: null })
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

  /** Whether the change landed; a refusal is a toast in the server's words. */
  const savePrefs = async (body: Parameters<typeof offersApi.setPrefs>[1], saved?: string): Promise<boolean> => {
    if (!venueId || saving) return false
    setSaving(true)
    try {
      const res = await offersApi.setPrefs(venueId, body)
      if (res.success && res.data) {
        setPrefs(res.data)
        if (saved) showToast(saved, 'success')
        return true
      }
      showToast(res.error || "That didn’t save. Try again.", 'error', { haptic: 'error' })
      return false
    } finally {
      setSaving(false)
    }
  }

  const sayYes = () => void savePrefs({ known: true })
  const turnOff = async () => {
    if (await savePrefs({ known: false })) setTurnedOff(true)
  }

  const notNow = () => {
    setLater(true)
    if (venueId) AsyncStorage.setItem(maybeLaterKey(venueId), '1').catch(() => {})
  }

  // "Stop offers from <place>" (review M6): the same switch as on the place's page.
  const stopOffers = () =>
    void savePrefs(
      { offersMuted: true },
      `No more offers from ${offer?.venue.name ?? 'this place'}. Turn them back on from its page.`
    )

  /** Report this offer: the reason, an optional note for "Something else", then Send report (R13). */
  const reportStep = (): Sheet => ({
    kind: 'reasons',
    title: 'Report this offer',
    message: "What’s wrong with it? We look at every report; the place isn’t told who sent it.",
    reasons: OFFER_REPORT_REASONS.map(({ value, label }) => ({ value, label })),
    submitLabel: 'Send report',
    run: async (reason, note) => {
      if (!id) return { ok: false, error: "That report didn’t go through. Try again." }
      const res = await offersApi.report(id, reason as OfferReportReason, note)
      return res.success
        ? { ok: true, toast: 'Reported. Thanks — we look at every report.' }
        : { ok: false, error: res.error || "That report didn’t go through. Try again." }
    },
  })

  const openMore = () => {
    if (!offer) return
    showSheet({
      kind: 'actions',
      layout: 'rows',
      title: `${offer.venue.name}’s offer`,
      actions: [
        { label: 'Report this offer', icon: 'flag', next: reportStep },
        ...(prefs && !prefs.offersMuted ? [{ label: `Stop offers from ${offer.venue.name}`, icon: 'bell-off' as const, then: stopOffers }] : []),
        { label: 'Cancel', cancel: true },
      ],
    })
  }

  // Deferred feature: nothing about being a regular shows unless the server says it is live here.
  const regulars = regularsActive(prefs)
  const ask = regulars && !!offer && !!prefs && !prefs.known && later === false && !turnedOff

  return (
    <View style={styles.screen}>
      <OfferHeader onBack={() => router.back()} onMore={offer ? openMore : undefined} moreLabel={offer ? `${offer.venue.name}’s offer, more` : 'More'} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACE.xxl }]} showsVerticalScrollIndicator={false}>
        {offer ? (
          <>
            <PassBody offer={offer} lastReadFailed={lastReadFailed} focused={focused} />
            {ask && prefs ? <RegularAsk venueName={offer.venue.name} prefs={prefs} saving={saving} onYes={sayYes} onLater={notNow} /> : null}
            {regulars && prefs?.known ? <RegularOn venueName={offer.venue.name} saving={saving} onOff={() => void turnOff()} /> : null}
            {regulars && turnedOff && !prefs?.known ? <RegularOff venueName={offer.venue.name} /> : null}
            <Button kind="tertiary" label={`See ${offer.venue.name}`} onPress={() => router.push(`/venue/${offer.venue.id}` as never)} />
          </>
        ) : failure ? (
          <StateScreen
            icon={failure.kind === 'gone' ? 'ticket' : 'cloud-off'}
            title={failure.kind === 'gone' ? 'This offer isn’t yours to open' : 'This offer didn’t load'}
            body={failure.kind === 'gone' ? undefined : failure.detail ?? 'Check your connection and try again.'}
            actions={
              failure.kind === 'gone'
                ? [{ label: 'Go back', kind: 'secondary', onPress: () => router.back() }]
                : [{ label: 'Try again', onPress: load }]
            }
            testID="offer-failed"
          />
        ) : (
          <View accessible accessibilityLabel="Loading the offer">
            <SkeletonBlock width="100%" height={TICKET_SKELETON} borderRadius={RADIUS.card} />
          </View>
        )}
      </ScrollView>
    </View>
  )
}

/**
 * The ticket and the sentence under it, a leaf that ticks itself once a second
 * (so the screen above does not re-render every second): the face of the pass
 * depends on whether the code is still fresh. A code past its turn with no
 * fresh one is hidden, never shown stale (L2).
 */
function PassBody({ offer, lastReadFailed, focused }: { offer: OpenedOffer; lastReadFailed: boolean; focused: boolean }) {
  const bold = useBoldText()
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow()), 1000)
    return () => clearInterval(timer)
  }, [])
  const view = passView(offer, now, lastReadFailed)

  // The ring counts down on this phone's clock; the turn is the server's, so move it by the skew.
  const turn = offer.pass && view.door === 'live' ? Date.parse(offer.pass.rotatesAt) - serverOffset() : undefined

  // The staff's redeem arrives from the server: the one success haptic (R3-G), and the first-time note is spent.
  const previous = useRef(offer.state)
  useEffect(() => {
    if (previous.current !== 'redeemed' && offer.state === 'redeemed') {
      H.success()
      markCoachUsed('door_pass')
    }
    previous.current = offer.state
  }, [offer.state])

  // The first time a pass is live: what the staff do with the code (once ever, via the coach mark).
  const codeRow = useRef<View>(null)
  const coach = useCoachMark('door_pass', { ready: view.door === 'live' })
  useCoachMarkSpot(coach.visible, {
    target: codeRow,
    text: COACH_TEXT,
    place: 'above',
    radius: RADIUS.rowInCard,
    onDismiss: coach.dismiss,
    onLost: coach.lose,
    testID: 'door-pass-coach',
  })

  return (
    <>
      <DoorTicket
        venueName={offer.venue.name}
        offerText={offer.text}
        until={validUntil(offer.endsAt)}
        endsAt={offer.endsAt}
        view={view}
        code={view.door === 'live' ? offer.pass?.code : undefined}
        rotatesAt={turn}
        active={focused}
        codeRef={codeRow}
      />
      <Text accessibilityLiveRegion="polite" style={[font('meta', bold), styles.foot]}>
        {view.foot}
      </Text>
    </>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.ink },
  content: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.sm, gap: SPACE.lg },
  foot: { color: COLOR.textSecondary, textAlign: 'center' },
})
