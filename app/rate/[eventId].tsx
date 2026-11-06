import { router, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Keyboard, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, FadeIn, FadeOut, LinearTransition, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { KeyboardFrame } from '../../components/chat/KeyboardFrame'
import { Button } from '../../components/ds/Button'
import { ScaleSteps } from '../../components/ds/ScaleSteps'
import { Dock } from '../../components/ds/Dock'
import { TopBar } from '../../components/ds/TopBar'
import { GoneCard } from '../../components/system/GoneCard'
import { useTopBarOverlay } from '../../lib/useTopBarState'
import { StateScreen } from '../../components/ds/StateScreen'
import { TextArea } from '../../components/ds/TextField'
import { font, HueProvider, useBoldText } from '../../components/ds/shared'
import { fadeInFast } from '../../components/motion/presence'
import { OfflineBanner, useOffline } from '../../components/OfflineBanner'
import { EventRow, IssueList, PersonRow, SentLine } from '../../components/rate/RateParts'
import { SkeletonBlock, SkeletonCircle } from '../../components/Skeleton'
import { useToast } from '../../components/Toast'
import { apiClient, type PeerRatingIssue } from '../../lib/apiClient'
import { COLOR, DURATION, EASING, MAX_FONT_SCALE, RADIUS, RISE, SPACE, SPRING } from '../../lib/design/tokens'
import { Logger } from '../../lib/logger'
import { askAboutNight, ratePeople, type RatePerson } from '../../lib/ratePeople'
import { rateRefusal } from '../../lib/rateRefusal'
import { isNightRated, markNightRated } from '../../lib/ratedNights'
import { useReducedMotion } from '../../lib/motion'
import { calendarDate } from '../../lib/time'

/**
 * After the night: how it was, and how the people you met were (Flow 3 `rate`).
 *
 * Two kinds of step, in order. **The night** first — one tap on a 1–5 and it
 * is sent (`rateEvent`, which had no caller until this screen) — then **each
 * person you matched with**, one at a time, their face and the name you know
 * them by. Either can be skipped, and the screen never asks twice.
 *
 * `DESIGN_HANDOFF.md` asks for something that "feels like a private note to us,
 * not a public review", so the scale is five plain steps with words at the
 * ends, not stars, and nothing is celebrated.
 *
 * ## Rules the design must not break
 *
 * **Never visible to the person rated.** There is no endpoint that returns a
 * rating to its subject and there must never be a screen where one could
 * surface. The person most likely to rate someone badly is the person who felt
 * least safe with them; showing it tells him that the woman who met him rated
 * him down, at an event where he knows who she is and may still be in the room.
 * The feature meant to protect her becomes what exposes her.
 *
 * **Only people you connected with.** A mutual like, so both opted in. Rating
 * anyone who merely shared a room is a review-bombing surface and a way to
 * punish someone for declining. Enforced server-side; the list comes from
 * `getRatablePeers` and is never assembled on the client. Their faces come from
 * the conversation list, never the public profile (`lib/ratePeople.ts` says
 * why).
 *
 * **Only after the event.** During the night a rating is leverage; afterwards
 * it is reflection. Also server-enforced.
 *
 * **Harassment is not a low rating with a label.** It routes to moderation and
 * is never averaged into anything. Four glowing ratings and one harassment
 * report is not a 4.2. The UI must never present it as the bottom of a scale.
 *
 * **A failed load is not "nothing to rate".** It says what failed and offers
 * to try again; "Nothing to rate" is only ever the server's real answer.
 *
 * ## Deliberately absent
 *
 * No star average anywhere. No "you rated them 2". No indication to anyone of
 * what anyone else said. Skipping is a first-class outcome and must stay free
 * of nagging: someone who does not want to rate is giving us information too.
 */

/*
 * Motion, and why there is so little of it.
 *
 * This is a private note, not an achievement: no celebration, no confetti, no
 * sound. What motion there is exists to stop the screen jumping.
 *
 * - **Between steps, and into the done state**, the form fades out while the
 *   next one fades in rising `RISE.list` on `DURATION.base` (DS #16). Without
 *   it Submit swapped one person's answers for a blank form in a single frame,
 *   which reads as "did that save, or did it reset?". Both layers are absolute
 *   in one stage, so the overlap is a crossfade and never a layout jump.
 * - **A choice** is the card's own ring and the chip's own fill, with its
 *   selection tick. It fires only when the answer changes.
 * - **The harassment note** arrives under the options with a layout glide,
 *   so nothing below it jumps.
 *
 * Reduce Motion: the rise goes, the fades stay. They are what say that
 * something changed.
 */
const ENTRANCE = Easing.bezier(...EASING.entrance)
const EXIT = Easing.bezier(...EASING.exit)

const riseIn = () => {
  'worklet'
  const t = { duration: DURATION.base, easing: ENTRANCE }
  return {
    initialValues: { opacity: 0, transform: [{ translateY: RISE.list }] },
    animations: {
      opacity: withTiming(1, t),
      transform: [{ translateY: withTiming(0, t) }],
    },
  }
}
const fadeInStage = FadeIn.duration(DURATION.base).easing(ENTRANCE)
const fadeOutStage = FadeOut.duration(DURATION.quick).easing(EXIT)
const GLIDE = LinearTransition.springify().stiffness(SPRING.settle.stiffness).damping(SPRING.settle.damping).mass(SPRING.settle.mass)

const ISSUES: { value: PeerRatingIssue; label: string }[] = [
  { value: 'none', label: 'Nothing went wrong' },
  { value: 'uncomfortable', label: 'They made me uncomfortable' },
  { value: 'no_show', label: "They didn’t turn up" },
  { value: 'misrepresented', label: "They weren’t who they said" },
  { value: 'harassment', label: 'They harassed me' },
]

/** The skeleton's face: the size it was before the row (a placeholder, not on the board). */
const FACE = 112
/** The note's box: two lines of text and its padding, not the 160 pt of a long answer. */
const NOTE_HEIGHT = 112
const NOTE_LIMIT = 500
/*
 * The board's column (Flow 4 `rate`): a row, then the question 28 under it, its line 6 under that, the scale 22 under the
 * line, and "Sent" 20 under the scale; on a person, "Did anything go wrong?" 28 under the scale and the issues 12 under it.
 * design-exception: 28, 22, 20 and 6 are the board's own margins (`.t28`, `.sc5`, `.sent`, `.sub`), off the 4 pt steps' pairs.
 */
const GAP = { question: 28, line: 6, scale: 22, sent: 20, issues: 12 } as const
/** The night's question (`.t28`). */
// design-exception: 28/33, between `title` 24/30 and `display` 34/40
const NIGHT_TITLE = { fontSize: 28, lineHeight: 33 }
/** The server's `max(500)` counts UTF-16 units. A field never truncates (the counter and Submit refuse instead). */
const noteLength = (value: string) => value.length

/** Never the server's sentence: it is written for an API caller. */
const SAVE_FAILED = "Couldn’t save that. Try again."
const SENT_LINE = 'Sent. Only we see this.'

type Load =
  | { kind: 'loading' }
  | { kind: 'error' }
  /** The night is not there to rate, or its window is not open (Flow 15 #11): the shared card, never a raw error. */
  | { kind: 'gone' }
  | {
      kind: 'ready'
      people: RatePerson[]
      title: string | null
      /** The night's cover, drawn above its question (TG-08); with none, its category plate (TG-06). */
      cover: string | null
      /** The night's first category's slug, for the plate when it has no cover. */
      category?: string
      /** "Sat 8 Nov" in the event's own zone, or empty when the event did not load. */
      day: string
      venue: string | null
      /** Whether to ask about the night: not if it was already rated. */
      askEvent: boolean
      /** You rated this night already (here, or on another launch): said so, rather than "Nothing to rate". */
      rated: boolean
    }

/**
 * Five plain steps with a word at each end.
 *
 * Not stars: a five-star row reads as a public review, and that is the one
 * tone this must not have. The words say what the ends mean, so the numbers
 * never have to. Drawn by the DS `ScaleSteps` (Flow 3 `scale`).
 */
function Scale({
  value,
  onChoose,
  low,
  high,
  disabled,
  subject,
}: {
  value: number | null
  onChoose: (n: number) => void
  low: string
  high: string
  disabled?: boolean
  subject: string
}) {
  return <ScaleSteps value={value} onChoose={onChoose} low={low} high={high} disabled={disabled} subject={subject} testID={`scale-${subject}`} />
}

function RatePeersContent() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>()
  const { showToast } = useToast()
  const bar = useTopBarOverlay()
  const insets = useSafeAreaInsets()
  const resetBar = bar.reset
  const bold = useBoldText()
  // An answer cannot be sent offline: the banner says so and the writes wait (reads stay), Flow 15 #16.
  const offline = useOffline()

  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  /** -1 is the night itself; 0… are people. */
  const [index, setIndex] = useState(-1)
  const [submitting, setSubmitting] = useState(false)
  /** How many things were actually sent, for the done state's words. */
  const [sent, setSent] = useState(0)

  const [eventRating, setEventRating] = useState<number | null>(null)
  const [rating, setRating] = useState<number | null>(null)
  const [issue, setIssue] = useState<PeerRatingIssue>('none')
  const [note, setNote] = useState('')
  const [dockHeight, setDockHeight] = useState(0)
  /** The night's tap landed: "Sent" shows in place for a beat before the people. */
  const [nightSent, setNightSent] = useState(false)
  const beat = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (beat.current) clearTimeout(beat.current)
  }, [])
  /** Each new card's header: focus moves there once it has come in (M5), so a screen reader hears where it is. */
  const header = useRef<View | Text>(null)
  const reduceMotion = useReducedMotion()
  const entering = reduceMotion ? fadeInStage : riseIn
  const glide = reduceMotion ? undefined : GLIDE
  // The note is the last field on a long form: when the keyboard comes up for
  // it, the form scrolls to its end so the note sits above the keys.
  const peerScroll = useRef<ScrollView>(null)
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => peerScroll.current?.scrollToEnd({ animated: !reduceMotion }))
    return () => sub.remove()
  }, [reduceMotion])

  // The chip and the card play the selection tick themselves: one event, one haptic.
  const chooseRating = useCallback((n: number) => setRating(n), [])
  const chooseIssue = useCallback((value: PeerRatingIssue) => setIssue(value), [])

  /*
   * Four reads, one of which decides the screen. The ratable list is the
   * gate: if it fails, nothing here is true and the screen says so. The
   * conversation list (faces), the event (its title) and your own rating
   * (whether to ask about the night) only make it nicer — their failure costs
   * a name, a title or a guess from the event's `userStatus`, never the screen.
   */
  useEffect(() => {
    if (!eventId) return
    let cancelled = false
    const id = String(eventId)
    Promise.all([
      apiClient.getRatablePeers(id),
      apiClient.getConversations().catch(() => null),
      apiClient.getEvent(id).catch(() => null),
      apiClient.getMyEventRating(id).catch(() => null),
    ])
      .then(([peers, conversations, event, own]) => {
        if (cancelled) return
        if (!peers.success || !peers.data) {
          Logger.warn('match', 'Ratable peers refused', { error: peers.error })
          setLoad({ kind: rateRefusal(peers).kind === 'gone' ? 'gone' : 'error' })
          return
        }
        const people = ratePeople(peers.data.userIds, conversations?.success ? conversations.data ?? [] : [])
        const askEvent = askAboutNight(own, event?.data?.userStatus?.userRating)
        const rated = !!own?.data?.ratedAt || isNightRated(id)
        if (rated) markNightRated(id)
        const cover = event?.data?.coverImageUrl ?? event?.data?.cover_image_url ?? null
        const category = event?.data?.categories?.[0]?.slug || undefined
        const start = event?.data?.startTime ?? event?.data?.start_time
        const day = calendarDate(start, { weekday: true, year: false, timeZone: event?.data?.timezone || undefined })
        const venue = event?.data?.venueName ?? event?.data?.venue_name ?? event?.data?.venue?.name ?? null
        const ask = askEvent && !rated
        setLoad({ kind: 'ready', people, title: event?.data?.title ?? null, cover, category, day, venue, askEvent: ask, rated })
        setIndex(ask ? -1 : 0)
      })
      .catch((e) => {
        Logger.error('match', 'Failed to load ratable peers', { error: e })
        if (!cancelled) setLoad({ kind: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [eventId, attempt])

  const retry = useCallback(() => {
    setLoad({ kind: 'loading' })
    setAttempt((a) => a + 1)
  }, [])

  const advance = useCallback(() => {
    setRating(null)
    setIssue('none')
    setNote('')
    setIndex((i) => i + 1)
    // The next form starts at its top, so the bar is at rest again (#30).
    resetBar()
  }, [resetBar])

  /** One tap and it is sent: the night is a single question. */
  const rateNight = useCallback(
    async (n: number) => {
      if (submitting || offline) return
      setEventRating(n)
      setSubmitting(true)
      try {
        const res = await apiClient.rateEvent(String(eventId), n)
        if (!res.success) {
          setEventRating(null)
          Logger.warn('events', 'Event rating refused', { error: res.error })
          const refusal = rateRefusal(res)
          if (refusal.kind === 'gone') return setLoad({ kind: 'gone' })
          // Not allowed, and asking again cannot change that: say why and go on to the people.
          if (refusal.kind === 'refused') {
            showToast(refusal.sentence, 'error', { haptic: 'error' })
            return advance()
          }
          showToast(SAVE_FAILED, 'error', { haptic: 'error' })
          return
        }
        setSent((s) => s + 1)
        markNightRated(String(eventId))
        setNightSent(true)
        AccessibilityInfo.announceForAccessibility(SENT_LINE)
        beat.current = setTimeout(advance, DURATION.moment)
      } catch (e) {
        Logger.error('events', 'Failed to rate the event', { error: e })
        setEventRating(null)
        showToast(SAVE_FAILED, 'error', { haptic: 'error' })
      } finally {
        setSubmitting(false)
      }
    },
    [advance, eventId, offline, showToast, submitting]
  )

  const people = load.kind === 'ready' ? load.people : []
  const person = index >= 0 ? people[index] : undefined
  const noteTooLong = noteLength(note) > NOTE_LIMIT

  const submit = useCallback(async () => {
    if (!person || rating === null || submitting || noteTooLong) return
    setSubmitting(true)
    try {
      const res = await apiClient.ratePeer(String(eventId), {
        userId: person.id,
        rating,
        issue,
        note: note.trim() || undefined,
      })
      if (!res.success) {
        Logger.warn('match', 'Peer rating refused', { error: res.error })
        const refusal = rateRefusal(res)
        if (refusal.kind === 'gone') return setLoad({ kind: 'gone' })
        // Not allowed to rate this person: say why and go on to the next, for a retry would be refused the same.
        if (refusal.kind === 'refused') {
          showToast(refusal.sentence, 'error', { haptic: 'error' })
          return advance()
        }
        showToast(SAVE_FAILED, 'error', { haptic: 'error' })
        return
      }
      setSent((s) => s + 1)
      markNightRated(String(eventId))
      advance()
    } catch (e) {
      Logger.error('match', 'Failed to submit peer rating', { error: e })
      showToast(SAVE_FAILED, 'error', { haptic: 'error' })
    } finally {
      setSubmitting(false)
    }
  }, [advance, eventId, issue, note, noteTooLong, person, rating, showToast, submitting])

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/going'))

  // One pager across the night and each person ("1 of 3"); none for a single step, where "1 of 1" says nothing.
  const ready = load.kind === 'ready'
  const steps = ready ? (load.askEvent ? 1 : 0) + people.length : 0
  const step = ready && load.askEvent ? index + 2 : index + 1
  const onStep = ready && (index === -1 || !!person)
  const progress = onStep && steps > 1 ? `${step} of ${steps}` : undefined

  // M5: once the new card is in (it rises over `base`), focus its header.
  const cardKey = ready ? (index >= people.length ? 'done' : String(index)) : load.kind
  useEffect(() => {
    if (!ready) return
    const timer = setTimeout(() => {
      if (header.current) AccessibilityInfo.sendAccessibilityEvent(header.current, 'focus')
    }, DURATION.base)
    return () => clearTimeout(timer)
  }, [cardKey, ready])

  // First in the tree, so a screen reader starts at Close. The DS bar, pinned over the form: the form scrolls under it and the
  // glass comes in behind (#30). "n of m" is Geist Mono at the right.
  const topBar = (
    <View style={[bar.barPin, styles.pin]}>
      <TopBar
        close
        onBack={close}
        state={bar.state}
        testID="rate-bar"
        progress={progress}
      />
    </View>
  )

  if (load.kind === 'loading') {
    return (
      <View style={styles.screen}>
        {topBar}
        {/* Shaped like what is coming: a face and two lines (U-L1), not a lone spinner. */}
        <View accessibilityLabel="Loading who you met" accessibilityState={{ busy: true }} style={[styles.skeleton, { paddingTop: bar.contentTop + SPACE.xxxl }]} testID="rate-skeleton">
          <SkeletonCircle width={FACE} />
          <SkeletonBlock width="60%" height={30} borderRadius={RADIUS.thumb} />
          <SkeletonBlock width="80%" height={20} borderRadius={RADIUS.thumb} />
        </View>
      </View>
    )
  }

  if (load.kind === 'error') {
    return (
      <View style={styles.screen}>
        {topBar}
        <Animated.View style={[styles.state, { paddingTop: bar.contentTop + SPACE.xxxl }]} entering={entering}>
          <StateScreen
            icon="cloud-off"
            title="Couldn’t load who you met"
            body="Check your connection and try again."
            actions={[{ label: 'Try again', onPress: retry }]}
            testID="rate-error"
          />
        </Animated.View>
      </View>
    )
  }

  if (load.kind === 'gone') {
    return (
      <View style={styles.screen}>
        {topBar}
        <Animated.View style={[styles.state, { paddingTop: bar.contentTop + SPACE.xxxl }]} entering={entering}>
          <GoneCard kind="rating" onBack={close} testID="rate-gone" />
        </Animated.View>
      </View>
    )
  }

  const onNight = index === -1
  const done = !onNight && index >= people.length
  // Nothing was ever asked: no night to rate and nobody to rate.
  const nothingToRate = people.length === 0 && !load.askEvent
  // Recap #04's words: you rated this night, so it says thanks rather than that there is nothing here.
  const ratedBefore = sent === 0 && load.rated
  // Said at the head of the form it is true of: a rating cannot be sent offline, and reads stay.
  const offlineNote = <OfflineBanner text="Offline. You can rate once you’re back." testID="rate-offline" />
  const scrollPad = { paddingTop: bar.contentTop, paddingBottom: dockHeight + SPACE.xl }

  return (
    <View style={styles.screen}>
      <KeyboardFrame>
        {topBar}
        <View style={styles.stage}>
          {done ? (
            <Animated.View key="done" style={styles.layer} entering={entering}>
              <View style={styles.centred}>
                <Text ref={header} accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE.display} style={[font('display', bold), styles.ink, styles.centreText]}>
                  {sent > 0 ? 'Thanks' : ratedBefore ? 'You rated this night' : nothingToRate ? 'Nothing to rate' : 'All done'}
                </Text>
                {/*
                  The same three cases as the title. After skipping the night with
                  nobody to rate, this used to say "You can rate people you
                  matched with…" under "All done", which read as a refusal.
                */}
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.secondary, styles.centreText]}>
                  {sent > 0 || ratedBefore
                    ? 'This is only ever seen by us. Nobody you rated will know.'
                    : nothingToRate
                      ? 'You can rate people you matched with, once the event has finished.'
                      : 'Nothing was sent. You can come back to this from Going.'}
                </Text>
              </View>
            </Animated.View>
          ) : onNight ? (
            <Animated.View key="night" style={styles.layer} entering={entering} exiting={fadeOutStage}>
              <ScrollView contentContainerStyle={[styles.scroll, scrollPad]} scrollIndicatorInsets={{ top: bar.indicatorTop }} {...bar.scrollProps}>
                {offlineNote}
                {/* The night itself in a row (Flow 4): its cover or plate, the title, its day and venue. Never no art. */}
                <EventRow title={load.title || 'This night'} day={load.day} venue={load.venue} cover={load.cover} category={load.category} />
                <Text
                  ref={header}
                  testID="rate-title"
                  accessibilityRole="header"
                  maxFontSizeMultiplier={MAX_FONT_SCALE.title}
                  style={[font('title', bold), NIGHT_TITLE, styles.ink, { marginTop: GAP.question }]}
                >
                  How was the night?
                </Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('lede', bold), styles.secondary, { marginTop: GAP.line }]}>
                  One tap. It helps whoever puts on the next one.
                </Text>
                <View style={{ marginTop: GAP.scale }}>
                  <Scale
                    value={eventRating}
                    onChoose={(n) => void rateNight(n)}
                    low="Not great"
                    high="Loved it"
                    disabled={submitting || offline || nightSent}
                    subject="The night"
                  />
                </View>
                {nightSent ? (
                  <View style={{ marginTop: GAP.sent }}>
                    <SentLine />
                  </View>
                ) : null}
              </ScrollView>
            </Animated.View>
          ) : person ? (
            /*
              Keyed by person, so Submit and Skip both swap the whole form: the
              old one fades out and the next rises in, and the new ScrollView
              starts at the top rather than wherever the last one was left.
            */
            <Animated.View key={`peer-${index}`} style={styles.layer} entering={entering} exiting={fadeOutStage}>
              <ScrollView
                ref={peerScroll}
                testID="rate-form"
                contentContainerStyle={[styles.scroll, scrollPad]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                scrollIndicatorInsets={{ top: bar.indicatorTop }}
                {...bar.scrollProps}
              >
                {offlineNote}
                <PersonRow ref={header as React.RefObject<View>} name={person.name} photo={person.photo ?? null} />
                <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE.title} style={[font('title', bold), styles.ink, { marginTop: GAP.question }]}>
                  How was meeting them?
                </Text>
                <View style={{ marginTop: GAP.scale }}>
                  <Scale value={rating} onChoose={chooseRating} low="Not for me" high="Would meet again" subject={`Meeting ${person.name}`} />
                </View>

                <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE.heading} style={[font('heading', bold), styles.ink, { marginTop: GAP.question }]}>
                  Did anything go wrong?
                </Text>
                <Animated.View layout={glide} style={[styles.issues, { marginTop: GAP.issues }]}>
                  <IssueList options={ISSUES} value={issue} onChoose={chooseIssue} />
                  {/* Faded, not popped: it lands mid-form, under the finger's eye line. */}
                  {issue === 'harassment' && (
                    <Animated.Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.warning]} entering={fadeInFast}>
                      This goes straight to our moderation team, not into any score. Someone will read it.
                    </Animated.Text>
                  )}
                </Animated.View>

                {/*
                  Kept, though the board draws neither (owner asked 2026-11-06): the note is the one place to say what
                  happened in your own words, and Submit sends it with the rest. Below the board's column, so it sits as drawn.
                */}
                <Animated.View layout={glide} style={{ marginTop: GAP.question }}>
                  <TextArea
                    label="Anything you want to tell us?"
                    value={note}
                    onChangeText={setNote}
                    placeholder="Optional. Only we read this"
                    limit={NOTE_LIMIT}
                    measure={noteLength}
                    error={noteTooLong ? `Keep it to ${NOTE_LIMIT} characters.` : undefined}
                    minHeight={NOTE_HEIGHT}
                    testID="rate-note"
                  />
                </Animated.View>
              </ScrollView>
            </Animated.View>
          ) : null}
        </View>
        {done ? (
          <Dock floating onHeight={setDockHeight} testID="rate-dock">
            <Button label="Done" kind="primary" onPress={close} testID="rate-done" />
          </Dock>
        ) : onNight ? (
          /* Skipping is a first-class outcome. No nagging, no guilt copy. At the foot with no bar behind it (Flow 4 `.skip`). */
          <View
            testID="rate-dock"
            onLayout={(e) => setDockHeight(e.nativeEvent.layout.height + SPACE.md)}
            style={[styles.skip, { bottom: insets.bottom + SPACE.md }]}
          >
            <Button
              label={people.length > 0 ? 'Skip to the people' : 'Skip'}
              kind="tertiary"
              size="md"
              onPress={advance}
              disabled={submitting || nightSent}
              testID="rate-skip-night"
            />
          </View>
        ) : person ? (
          <Dock floating onHeight={setDockHeight} testID="rate-dock">
            {/* Submit stays gated on a number (D14), and says why, rather than a disabled button that can't. */}
            {rating === null ? (
              <Text testID="rate-hint" maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary, styles.centreText]}>
                Pick a number to send
              </Text>
            ) : null}
            <Button label="Submit" kind="primary" onPress={() => void submit()} disabled={rating === null || noteTooLong || offline} loading={submitting} testID="rate-submit" />
            {/* Skipping is a first-class outcome. No nagging, no guilt copy. */}
            <Button label="Skip this person" kind="tertiary" size="md" onPress={advance} disabled={submitting} testID="rate-skip-person" />
          </Dock>
        ) : null}
      </KeyboardFrame>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.ink },
  // Outgoing and incoming layers overlap here during a swap, so both are absolute.
  // Over the form that scrolls under it, and still first in the tree: a screen reader starts at Close.
  pin: { zIndex: 2 },
  stage: { flex: 1 },
  layer: { ...StyleSheet.absoluteFill },
  scroll: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.lg },
  state: { flex: 1, paddingHorizontal: SPACE.gutter, paddingTop: SPACE.xxxl * 2 },
  skeleton: { alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.gutter, paddingTop: SPACE.xxxl },
  centred: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACE.gutter, gap: SPACE.md },
  centreText: { textAlign: 'center' },
  issues: { gap: SPACE.sm },
  skip: { position: 'absolute', left: SPACE.gutter, right: SPACE.gutter },
  warning: { color: COLOR.destructive },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
})

/** Rose world: one hue on this screen (`HueProvider`). */
export default function RatePeers() {
  return (
    <HueProvider value="rose">
      <RatePeersContent />
    </HueProvider>
  )
}
