import * as Haptics from 'expo-haptics'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
// The library one: react-native's own left the Submit button under the home
// indicator, where taps are the system's (SCRUM-201).
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useReducedMotion,
  withTiming,
} from 'react-native-reanimated'

import { apiClient, type PeerRatingIssue } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { useToast } from '../../components/Toast'
import ScalePress from '../../components/motion/ScalePress'
import { fadeInFast } from '../../components/motion/presence'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, SPACE, TYPE } from '../../lib/theme'

/**
 * Rate the people you met.
 *
 * ## DESIGN IS A PLACEHOLDER — LOGIC IS NOT
 *
 * Everything about how this looks is provisional and meant to be replaced.
 * Everything about what it does, who it lets you rate, and what it says is
 * deliberate, and the rules below must survive whatever the redesign does.
 *
 * `DESIGN_HANDOFF.md` asks for something that "feels like a private note to us,
 * not a public review". This screen does not achieve that — it is a functional
 * stand-in so the flow can be audited end to end and handed over.
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
 * `getRatablePeers` and is never assembled on the client.
 *
 * **Only after the event.** During the night a rating is leverage; afterwards
 * it is reflection. Also server-enforced.
 *
 * **Harassment is not a low rating with a label.** It routes to moderation and
 * is never averaged into anything. Four glowing ratings and one harassment
 * report is not a 4.2. The UI must never present it as the bottom of a scale.
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
 * - **Between people, and into the done state**, the form fades out (120ms)
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

export default function RatePeers() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>()
  const { showToast } = useToast()

  const [peerIds, setPeerIds] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

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

  useEffect(() => {
    let cancelled = false
    if (!eventId) return
    apiClient
      .getRatablePeers(String(eventId))
      .then((res) => {
        if (cancelled) return
        // An empty list is the ordinary case, not an error: you may have
        // connected with nobody, or already rated everyone.
        setPeerIds(res.success && res.data ? res.data.userIds : [])
      })
      .catch((e) => {
        Logger.error('match', 'Failed to load ratable peers', { error: e })
        if (!cancelled) setPeerIds([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [eventId])

  const advance = useCallback(() => {
    setRating(null)
    setIssue('none')
    setNote('')
    setIndex((i) => i + 1)
  }, [])

  const submit = useCallback(async () => {
    const userId = peerIds[index]
    if (!userId || rating === null || submitting) return
    setSubmitting(true)
    try {
      const res = await apiClient.ratePeer(String(eventId), {
        userId,
        rating,
        issue,
        note: note.trim() || undefined,
      })
      if (!res.success) {
        showToast('Could not save that. Try again.', 'error')
        return
      }
      advance()
    } catch (e) {
      Logger.error('match', 'Failed to submit peer rating', { error: e })
      showToast('Could not save that. Try again.', 'error')
    } finally {
      setSubmitting(false)
    }
  }, [advance, eventId, index, issue, note, peerIds, rating, showToast, submitting])

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={EMBER.textPrimary} style={styles.loader} />
      </SafeAreaView>
    )
  }

  const done = index >= peerIds.length

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.stage}>
        {done ? (
          <Animated.View key="done" style={styles.layer} entering={entering}>
            <View style={styles.centred}>
              <Text style={styles.h1}>{peerIds.length === 0 ? 'Nothing to rate' : 'Thanks'}</Text>
              <Text style={styles.body}>
                {peerIds.length === 0
                  ? 'You can rate people you connected with, once the event has finished.'
                  : 'This is only ever seen by us. Nobody you rated will know.'}
              </Text>
              <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
                <Text style={styles.primaryButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        ) : (
          /*
            Keyed by person, so Submit and Skip both swap the whole form: the
            old one fades out and the next rises in, and the new ScrollView
            starts at the top rather than wherever the last one was left.
          */
          <Animated.View key={`peer-${index}`} style={styles.layer} entering={entering} exiting={fadeOutStage}>
            <ScrollView contentContainerStyle={styles.scroll}>
              {__DEV__ ? (
                <Text style={styles.placeholderBanner}>
                  PLACEHOLDER DESIGN — logic is final, layout is not
                </Text>
              ) : null}

              <Text style={styles.h1}>How was meeting them?</Text>
              <Text style={styles.body}>
                {index + 1} of {peerIds.length}. Only we see this. They will never know you rated
                them, or what you said.
              </Text>

              {/*
                * Deliberately not stars. A five-star row reads as a public review and
                * that is the tone this must not have. Numbers are a placeholder for
                * whatever the designer chooses -- the constraint is that it must not
                * look like something the other person will read.
                */}
              <View style={styles.row}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <ScalePress
                    key={n}
                    haptic={false}
                    onPress={() => chooseRating(n)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: rating === n }}
                    accessibilityLabel={`Rate ${n} out of 5`}
                  >
                    <Animated.View style={[styles.chip, rating === n && styles.chipSelected, FILL_TRANSITION]}>
                      <Animated.Text style={[styles.chipText, rating === n && styles.chipTextSelected, LABEL_TRANSITION]}>
                        {n}
                      </Animated.Text>
                    </Animated.View>
                  </ScalePress>
                ))}
              </View>

              <Text style={styles.h2}>Did anything go wrong?</Text>
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
                  This goes straight to our moderation team, not into any score. Someone will read
                  it.
                </Animated.Text>
              )}

              <Text style={styles.h2}>Anything you want to tell us? (optional)</Text>
              <TextInput
                style={styles.input}
                value={note}
                onChangeText={setNote}
                multiline
                placeholder="Only we read this"
                placeholderTextColor={EMBER.textPlaceholder}
                maxLength={500}
              />

              <TouchableOpacity
                style={[styles.primaryButton, (rating === null || submitting) && styles.buttonDisabled]}
                onPress={submit}
                disabled={rating === null || submitting}
              >
                <Text style={styles.primaryButtonText}>{submitting ? 'Saving…' : 'Submit'}</Text>
              </TouchableOpacity>

              {/* Skipping is a first-class outcome. No nagging, no guilt copy. */}
              <TouchableOpacity style={styles.skipButton} onPress={advance} disabled={submitting}>
                <Text style={styles.skipButtonText}>Skip this person</Text>
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  )
}

/** Placeholder styling. Replace wholesale; nothing here is a decision. */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  // Outgoing and incoming layers overlap here during a swap, so both are absolute.
  stage: { flex: 1 },
  layer: { ...StyleSheet.absoluteFill },
  scroll: { padding: GUTTER, gap: SPACE.md },
  centred: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: GUTTER, gap: SPACE.md },
  loader: { marginTop: SPACE.xxxl },
  placeholderBanner: { ...TYPE.label, color: EMBER.destructive, marginBottom: SPACE.sm },
  h1: { ...TYPE.display },
  h2: { ...TYPE.heading, marginTop: SPACE.lg },
  body: { ...TYPE.body, color: EMBER.textSecondary },
  row: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.md },
  chip: {
    width: CONTROL.md,
    height: CONTROL.md,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: EMBER.textPrimary },
  chipText: { ...TYPE.bodyStrong },
  chipTextSelected: { color: EMBER.bg },
  option: {
    padding: SPACE.lg,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surface,
    marginTop: SPACE.xs,
  },
  optionSelected: { backgroundColor: EMBER.textPrimary },
  optionText: { ...TYPE.body },
  optionTextSelected: { color: EMBER.bg },
  warning: { ...TYPE.meta, color: EMBER.destructive, marginTop: SPACE.sm },
  input: {
    ...TYPE.body,
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
  primaryButtonText: { ...TYPE.button, color: EMBER.onGradient },
  buttonDisabled: { opacity: 0.4 },
  skipButton: { alignItems: 'center', justifyContent: 'center', height: CONTROL.md },
  skipButtonText: { ...TYPE.button, color: EMBER.textSecondary },
})
