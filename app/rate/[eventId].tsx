import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
// The library one: react-native's own left the Submit button under the home
// indicator, where taps are the system's (SCRUM-201).
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, { Easing, FadeIn, FadeOut, useReducedMotion, withTiming } from 'react-native-reanimated'

import { Face } from '../../components/blendn/Face'
import ScalePress from '../../components/motion/ScalePress'
import { fadeInFast } from '../../components/motion/presence'
import { useToast } from '../../components/Toast'
import { Text } from '../../components/ui/Text'
import { apiClient, type PeerRatingIssue } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { askAboutNight, ratePeople, type RatePerson } from '../../lib/ratePeople'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE } from '../../lib/theme'

/**
 * After the night: how it was, and how the people you met were.
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
 * - **Between steps, and into the done state**, the form fades out (120ms)
 *   while the next one fades in rising 8pt (220ms, strong ease-out). Without
 *   it Submit swapped one person's answers for a blank form in a single frame,
 *   which reads as "did that save, or did it reset?". Both layers are absolute
 *   in one stage, so the overlap is a crossfade and never a layout jump.
 * - **A choice** eases its fill over 150ms, fires a selection tick and presses
 *   to 0.97. It fires only when the answer changes, so tapping the chosen one
 *   again does nothing.
 *
 * Reduce Motion: the rise goes, the fades and the fill stay. They are what say
 * that something changed.
 */
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)

const riseIn = () => {
  'worklet'
  const t = { duration: 220, easing: EASE_OUT }
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 8 }] },
    animations: {
      opacity: withTiming(1, t),
      transform: [{ translateY: withTiming(0, t) }],
    },
  }
}
const fadeInStage = FadeIn.duration(220).easing(EASE_OUT)
const fadeOutStage = FadeOut.duration(120).easing(EASE_OUT)

// A state change on a control someone is looking at: short, and ease-out.
// The `transition` shorthand, not `transitionProperty` & co.: SDK 53's
// react-native-web types declare those as CSS strings, which collide with
// Reanimated's; the shorthand string satisfies both (see FilterControl).
const FILL_TRANSITION = { transition: 'background-color 150ms cubic-bezier(0.23, 1, 0.32, 1)' }
const LABEL_TRANSITION = { transition: 'color 150ms cubic-bezier(0.23, 1, 0.32, 1)' }

const ISSUES: { value: PeerRatingIssue; label: string }[] = [
  { value: 'none', label: 'Nothing went wrong' },
  { value: 'uncomfortable', label: 'They made me uncomfortable' },
  { value: 'no_show', label: "They didn't turn up" },
  { value: 'misrepresented', label: "They weren't who they said" },
  { value: 'harassment', label: 'They harassed me' },
]

const FACE = CONTROL.lg * 2

type Load =
  | { kind: 'loading' }
  | { kind: 'error' }
  | {
      kind: 'ready'
      people: RatePerson[]
      title: string | null
      /** Whether to ask about the night: not if it was already rated. */
      askEvent: boolean
    }

/**
 * Five plain steps with a word at each end.
 *
 * Not stars: a five-star row reads as a public review, and that is the one
 * tone this must not have. The words say what the ends mean, so the numbers
 * never have to.
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
  return (
    <View style={styles.scale}>
      <View style={styles.scaleRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <ScalePress
            key={n}
            haptic={false}
            disabled={disabled}
            onPress={() => onChoose(n)}
            style={styles.scaleCell}
            accessibilityRole="button"
            accessibilityState={{ selected: value === n, disabled }}
            accessibilityLabel={`${subject}: ${n} out of 5${n === 1 ? `, ${low}` : n === 5 ? `, ${high}` : ''}`}
          >
            <Animated.View style={[styles.chip, value === n && styles.chipSelected, FILL_TRANSITION]}>
              <Animated.Text style={[styles.chipText, value === n && styles.chipTextSelected, LABEL_TRANSITION]}>
                {n}
              </Animated.Text>
            </Animated.View>
          </ScalePress>
        ))}
      </View>
      <View style={styles.scaleEnds} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text variant="meta" color={EMBER.textTertiary}>
          {low}
        </Text>
        <Text variant="meta" color={EMBER.textTertiary}>
          {high}
        </Text>
      </View>
    </View>
  )
}

export default function RatePeers() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>()
  const { showToast } = useToast()

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
  const reduceMotion = useReducedMotion()
  const entering = reduceMotion ? fadeInStage : riseIn

  // One tick per changed answer. Re-tapping the current choice is not a change.
  const chooseRating = useCallback((n: number) => {
    setRating((prev) => {
      if (prev !== n) Haptics.selectionAsync().catch(() => {})
      return n
    })
  }, [])
  const chooseIssue = useCallback((value: PeerRatingIssue) => {
    setIssue((prev) => {
      if (prev !== value) Haptics.selectionAsync().catch(() => {})
      return value
    })
  }, [])

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
          setLoad({ kind: 'error' })
          return
        }
        const people = ratePeople(peers.data.userIds, conversations?.success ? conversations.data ?? [] : [])
        const askEvent = askAboutNight(own, event?.data?.userStatus?.userRating)
        setLoad({ kind: 'ready', people, title: event?.data?.title ?? null, askEvent })
        setIndex(askEvent ? -1 : 0)
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
  }, [])

  /** One tap and it is sent: the night is a single question. */
  const rateNight = useCallback(
    async (n: number) => {
      if (submitting) return
      Haptics.selectionAsync().catch(() => {})
      setEventRating(n)
      setSubmitting(true)
      try {
        const res = await apiClient.rateEvent(String(eventId), n)
        if (!res.success) {
          setEventRating(null)
          showToast(res.error || 'Could not save that. Try again.', 'error')
          return
        }
        setSent((s) => s + 1)
        advance()
      } catch (e) {
        Logger.error('events', 'Failed to rate the event', { error: e })
        setEventRating(null)
        showToast('Could not save that. Try again.', 'error')
      } finally {
        setSubmitting(false)
      }
    },
    [advance, eventId, showToast, submitting]
  )

  const people = load.kind === 'ready' ? load.people : []
  const person = index >= 0 ? people[index] : undefined

  const submit = useCallback(async () => {
    if (!person || rating === null || submitting) return
    setSubmitting(true)
    try {
      const res = await apiClient.ratePeer(String(eventId), {
        userId: person.id,
        rating,
        issue,
        note: note.trim() || undefined,
      })
      if (!res.success) {
        showToast('Could not save that. Try again.', 'error')
        return
      }
      setSent((s) => s + 1)
      advance()
    } catch (e) {
      Logger.error('match', 'Failed to submit peer rating', { error: e })
      showToast('Could not save that. Try again.', 'error')
    } finally {
      setSubmitting(false)
    }
  }, [advance, eventId, issue, note, person, rating, showToast, submitting])

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/going'))

  const topBar = (
    <View style={styles.topBar}>
      <Pressable
        onPress={close}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
      >
        <Ionicons name="close" size={ICON.lg} color={EMBER.textPrimary} />
      </Pressable>
      {load.kind === 'ready' && person ? (
        <Text variant="caption" color={EMBER.textSecondary}>
          {index + 1} of {people.length}
        </Text>
      ) : null}
    </View>
  )

  if (load.kind === 'loading') {
    return (
      <SafeAreaView style={styles.container}>
        {topBar}
        <ActivityIndicator color={EMBER.textSecondary} style={styles.loader} />
      </SafeAreaView>
    )
  }

  if (load.kind === 'error') {
    return (
      <SafeAreaView style={styles.container}>
        {topBar}
        <Animated.View style={styles.centred} entering={entering}>
          <Ionicons name="cloud-offline-outline" size={ICON.lg} color={EMBER.textTertiary} />
          <Text variant="title" style={styles.centreText}>
            Couldn&apos;t load who you met
          </Text>
          <Text variant="body" color={EMBER.textSecondary} style={styles.centreText}>
            Check your connection and try again.
          </Text>
          <ScalePress onPress={retry} style={styles.primaryButton} accessibilityRole="button">
            <Text variant="button" color={EMBER.onGradient}>
              Try again
            </Text>
          </ScalePress>
        </Animated.View>
      </SafeAreaView>
    )
  }

  const onNight = index === -1
  const done = !onNight && index >= people.length

  return (
    <SafeAreaView style={styles.container}>
      {topBar}
      <View style={styles.stage}>
        {done ? (
          <Animated.View key="done" style={styles.layer} entering={entering}>
            <View style={styles.centred}>
              <Text variant="display" style={styles.centreText}>
                {sent > 0 ? 'Thanks' : people.length === 0 && !load.askEvent ? 'Nothing to rate' : 'All done'}
              </Text>
              <Text variant="body" color={EMBER.textSecondary} style={styles.centreText}>
                {sent > 0
                  ? 'This is only ever seen by us. Nobody you rated will know.'
                  : people.length === 0
                    ? 'You can rate people you matched with, once the event has finished.'
                    : 'Nothing was sent. You can come back to this from Going.'}
              </Text>
              <ScalePress onPress={close} style={styles.primaryButton} accessibilityRole="button">
                <Text variant="button" color={EMBER.onGradient}>
                  Done
                </Text>
              </ScalePress>
            </View>
          </Animated.View>
        ) : onNight ? (
          <Animated.View key="night" style={styles.layer} entering={entering} exiting={fadeOutStage}>
            <ScrollView contentContainerStyle={styles.scroll}>
              <Text variant="label" color={EMBER.textSecondary}>
                THE NIGHT
              </Text>
              <Text variant="display">How was {load.title || 'it'}?</Text>
              <Text variant="body" color={EMBER.textSecondary}>
                One tap. It helps whoever puts on the next one.
              </Text>
              <Scale
                value={eventRating}
                onChoose={(n) => void rateNight(n)}
                low="Not great"
                high="Loved it"
                disabled={submitting}
                subject="The night"
              />
              {/* Skipping is a first-class outcome. No nagging, no guilt copy. */}
              <Pressable style={styles.skipButton} onPress={advance} disabled={submitting} accessibilityRole="button">
                <Text variant="button" color={EMBER.textSecondary}>
                  {people.length > 0 ? 'Skip to the people' : 'Skip'}
                </Text>
              </Pressable>
            </ScrollView>
          </Animated.View>
        ) : person ? (
          /*
            Keyed by person, so Submit and Skip both swap the whole form: the
            old one fades out and the next rises in, and the new ScrollView
            starts at the top rather than wherever the last one was left.
          */
          <Animated.View key={`peer-${index}`} style={styles.layer} entering={entering} exiting={fadeOutStage}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              <View style={styles.who}>
                <Face name={person.name} photo={person.photo} size={FACE} />
                <Text variant="title" numberOfLines={2} style={styles.centreText}>
                  {person.name}
                </Text>
                <Text variant="meta" style={styles.centreText}>
                  Only we see this. They will never know you rated them, or what you said.
                </Text>
              </View>

              <Text variant="heading" style={styles.h2}>
                How was meeting them?
              </Text>
              <Scale
                value={rating}
                onChoose={chooseRating}
                low="Not for me"
                high="Would meet again"
                subject={`Meeting ${person.name}`}
              />

              <Text variant="heading" style={styles.h2}>
                Did anything go wrong?
              </Text>
              {ISSUES.map((opt) => (
                <ScalePress
                  key={opt.value}
                  haptic={false}
                  onPress={() => chooseIssue(opt.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: issue === opt.value }}
                >
                  <Animated.View style={[styles.option, issue === opt.value && styles.optionSelected, FILL_TRANSITION]}>
                    <Animated.Text
                      style={[styles.optionText, issue === opt.value && styles.optionTextSelected, LABEL_TRANSITION]}
                    >
                      {opt.label}
                    </Animated.Text>
                  </Animated.View>
                </ScalePress>
              ))}

              {/* Faded, not popped: it lands mid-form, under the finger's eye line. */}
              {issue === 'harassment' && (
                <Animated.Text style={styles.warning} entering={fadeInFast}>
                  This goes straight to our moderation team, not into any score. Someone will read it.
                </Animated.Text>
              )}

              <Text variant="heading" style={styles.h2}>
                Anything you want to tell us?
              </Text>
              <TextInput
                style={styles.input}
                value={note}
                onChangeText={setNote}
                multiline
                placeholder="Optional. Only we read this"
                placeholderTextColor={EMBER.textPlaceholder}
                maxLength={500}
              />

              <ScalePress
                style={[styles.primaryButton, (rating === null || submitting) && styles.buttonDisabled]}
                onPress={submit}
                disabled={rating === null || submitting}
                accessibilityRole="button"
                accessibilityState={{ disabled: rating === null || submitting }}
              >
                <Text variant="button" color={EMBER.onGradient}>
                  {submitting ? 'Saving…' : 'Submit'}
                </Text>
              </ScalePress>

              {/* Skipping is a first-class outcome. No nagging, no guilt copy. */}
              <Pressable style={styles.skipButton} onPress={advance} disabled={submitting} accessibilityRole="button">
                <Text variant="button" color={EMBER.textSecondary}>
                  Skip this person
                </Text>
              </Pressable>
            </ScrollView>
          </Animated.View>
        ) : null}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  topBar: {
    height: CONTROL.md,
    paddingHorizontal: GUTTER - SPACE.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: { width: CONTROL.md, height: CONTROL.md, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  // Outgoing and incoming layers overlap here during a swap, so both are absolute.
  stage: { flex: 1 },
  layer: { ...StyleSheet.absoluteFill },
  scroll: { paddingHorizontal: GUTTER, paddingTop: SPACE.lg, paddingBottom: SPACE.xxl, gap: SPACE.md },
  centred: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: GUTTER, gap: SPACE.md },
  centreText: { textAlign: 'center' },
  loader: { marginTop: SPACE.xxxl },
  who: { alignItems: 'center', gap: SPACE.sm, paddingBottom: SPACE.lg },
  h2: { marginTop: SPACE.lg },
  scale: { gap: SPACE.sm, marginTop: SPACE.sm },
  scaleRow: { flexDirection: 'row', gap: SPACE.sm },
  scaleCell: { flex: 1 },
  scaleEnds: { flexDirection: 'row', justifyContent: 'space-between' },
  chip: {
    height: CONTROL.md,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: EMBER.textPrimary },
  chipText: { ...TYPE.bodyStrong, color: EMBER.textPrimary },
  chipTextSelected: { color: EMBER.bg },
  option: {
    padding: SPACE.lg,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surface,
    marginTop: SPACE.xs,
  },
  optionSelected: { backgroundColor: EMBER.textPrimary },
  optionText: { ...TYPE.body, color: EMBER.textPrimary },
  optionTextSelected: { color: EMBER.bg },
  warning: { ...TYPE.meta, color: EMBER.destructive, marginTop: SPACE.sm },
  input: {
    ...TYPE.body,
    color: EMBER.textPrimary,
    backgroundColor: EMBER.surface,
    borderRadius: EMBER_RADIUS.md,
    padding: SPACE.lg,
    minHeight: CONTROL.lg * 2,
    textAlignVertical: 'top',
    marginTop: SPACE.sm,
  },
  primaryButton: {
    backgroundColor: EMBER.accent,
    borderRadius: EMBER_RADIUS.pill,
    height: CONTROL.lg,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: SPACE.xl,
    marginTop: SPACE.xl,
  },
  buttonDisabled: { opacity: 0.4 },
  skipButton: { alignItems: 'center', justifyContent: 'center', height: CONTROL.md },
})
