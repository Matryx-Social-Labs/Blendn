import { Ionicons, MaterialIcons } from '@expo/vector-icons'
import React, { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { reasonLine } from '../../lib/roomMoments'
import type { RoomPerson } from '../../lib/useRoom'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE } from '../../lib/theme'
import ScalePress from '../motion/ScalePress'
import { RisingSheet, SheetModal } from '../motion/RisingSheet'
import { Grabber } from '../ui/Grabber'
import { Text } from '../ui/Text'
import { Face } from './Face'
import { HeartPop } from './HeartPop'

const FACE = 112

/**
 * Everything worth knowing before you walk over — as a sheet that rises from
 * the face you tapped and drags back down.
 *
 * The old Grid put all of this on every card in a long list, so the roster was
 * a column of forms. Now the room is faces, and one face opens into this: the
 * reasons you two have (all of them, not the one that fit on a card), what you
 * share, and the three things you can do about it.
 *
 * **Three verbs, three weights.**
 *
 * - **Like** is private until mutual, and is the one accent on the sheet.
 *   Double-tapping the face does the same, with a heart that pops over it.
 * - **Wave** is lighter: they find out at once that somebody waved, and who
 *   (as they see you in this room). For "I'm by the bar", not "I'm into you".
 * - **Message** is a connection request (`ConnectSheet`), which reveals you —
 *   the sheet says so before you type.
 *
 * Report and block stay one tap away, low contrast, never optional.
 */
export function PersonCard({
  person,
  onClose,
  onLike,
  onWave,
  onMessage,
  onSayHi,
  onSafety,
  onOpenProfile,
  waveState,
  crewLike,
}: {
  person: RoomPerson | null
  onClose: () => void
  onLike: (p: RoomPerson) => void
  /** Resolves when the wave has settled; the button ignores taps until then. */
  onWave: (p: RoomPerson) => Promise<unknown> | void
  onMessage: (p: RoomPerson) => void
  onSayHi: (p: RoomPerson) => void
  onSafety: (p: RoomPerson) => void
  onOpenProfile: (p: RoomPerson) => void
  /** 'sent' once waved this session, 'too-soon' when the server refused a repeat. */
  waveState?: 'sent' | 'too-soon' | null
  /**
   * Like them on your crew's behalf — only while a crew of yours is here
   * (step 9). Quiet, under the three verbs: it is the crew's like, not yours.
   */
  crewLike?: { label: string; onPress: (p: RoomPerson) => void } | null
}) {
  const insets = useSafeAreaInsets()
  const [pop, setPop] = useState(0)
  // One wave at a time: a second tap while the first is in flight would send two.
  const [waving, setWaving] = useState(false)

  // Keep the last person while the sheet sinks, so it does not empty mid-exit.
  const [shown, setShown] = useState<RoomPerson | null>(person)
  if (person && person !== shown) setShown(person)
  const p = person ?? shown

  const like = () => {
    if (!p || p.liked || p.matched) return
    setPop((n) => n + 1)
    onLike(p)
  }

  const wave = async () => {
    if (!p || waving || waveState) return
    setWaving(true)
    try {
      await onWave(p)
    } finally {
      setWaving(false)
    }
  }

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .runOnJS(true)
    .onEnd(() => like())

  if (!p) return null
  const title = p.age ? `${p.name}, ${p.age}` : p.name
  const reasons = allReasons(p)

  return (
    <SheetModal visible={person !== null} onRequestClose={onClose} accessibilityViewIsModal>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <RisingSheet style={[styles.sheet, { paddingBottom: insets.bottom + SPACE.xl }]}>
        <Grabber style={styles.grabber} />

        <Pressable
          onPress={() => onSafety(p)}
          hitSlop={12}
          style={styles.safety}
          accessibilityRole="button"
          accessibilityLabel={`Report or block ${p.name}`}
        >
          <MaterialIcons name="more-horiz" size={ICON.md} color={EMBER.textTertiary} />
        </Pressable>

        <View style={styles.head}>
          <GestureDetector gesture={doubleTap}>
            {/* The name only: the Like button below is how VoiceOver likes. */}
            <View accessible accessibilityLabel={p.name}>
              <Face name={p.name} photo={p.photo} size={FACE} />
              <HeartPop trigger={pop} size={ICON.lg * 2} />
              {p.insideNow ? <View style={styles.hereDot} /> : null}
            </View>
          </GestureDetector>
          <Text variant="title" style={styles.centre} maxFontSizeMultiplier={1.4}>
            {title}
          </Text>
          <Text variant="meta" style={styles.centre}>
            {p.matched ? 'You matched' : reasonLine(p)}
          </Text>
        </View>

        {reasons.length ? (
          <View style={styles.reasons}>
            {reasons.map((r) => (
              <View key={r.text} style={styles.reason}>
                <Ionicons name={r.icon} size={ICON.sm} color={EMBER.textSecondary} />
                <Text variant="body">{r.text}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {p.interests.length ? (
          <View style={styles.chips}>
            {p.interests.slice(0, 8).map((i) => (
              <View key={i} style={styles.chip}>
                <Text variant="meta" color={EMBER.textPrimary}>
                  {i}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.actions}>
          {p.matched ? (
            <ScalePress
              onPress={() => onSayHi(p)}
              style={[styles.action, styles.primary]}
              accessibilityRole="button"
              accessibilityLabel={`Say hi to ${p.name}`}
            >
              <Ionicons name="chatbubble" size={ICON.md} color={EMBER.onGradient} />
              <Text variant="button" color={EMBER.onGradient}>
                Say hi
              </Text>
            </ScalePress>
          ) : (
            <ScalePress
              onPress={like}
              disabled={p.liked}
              style={[styles.action, p.liked ? styles.neutral : styles.primary]}
              accessibilityRole="button"
              accessibilityLabel={p.liked ? `You liked ${p.name}` : `Like ${p.name}`}
              // The two "I want to talk" buttons differ in cost, and only this says so.
              accessibilityHint="They are only told if they like you back"
              accessibilityState={{ disabled: p.liked }}
            >
              <Ionicons
                name={p.liked ? 'heart' : 'heart-outline'}
                size={ICON.md}
                color={p.liked ? EMBER.textPrimary : EMBER.onGradient}
              />
              <Text variant="button" color={p.liked ? EMBER.textPrimary : EMBER.onGradient}>
                {p.liked ? 'Liked' : 'Like'}
              </Text>
            </ScalePress>
          )}
          <ScalePress
            onPress={() => void wave()}
            disabled={waving || waveState === 'sent' || waveState === 'too-soon'}
            style={[styles.action, styles.neutral, styles.square]}
            accessibilityRole="button"
            accessibilityLabel={waveState ? `You waved at ${p.name}` : `Wave at ${p.name}`}
            accessibilityState={{ disabled: waving || !!waveState, busy: waving }}
          >
            <Text variant="button" maxFontSizeMultiplier={1}>
              👋
            </Text>
          </ScalePress>
          {p.matched ? null : (
            <ScalePress
              onPress={() => onMessage(p)}
              disabled={p.requested}
              style={[styles.action, styles.neutral, styles.square]}
              accessibilityRole="button"
              accessibilityLabel={p.requested ? `Request sent to ${p.name}` : `Message ${p.name}`}
              accessibilityHint="Sends a request, which shows them your name and photo"
            >
              <Ionicons
                name={p.requested ? 'checkmark' : 'paper-plane-outline'}
                size={ICON.md}
                color={EMBER.textPrimary}
              />
            </ScalePress>
          )}
        </View>
        {waveState ? (
          <Text variant="meta" style={styles.centre}>
            {waveState === 'sent' ? `${p.name} knows you waved` : 'You waved a moment ago'}
          </Text>
        ) : null}

        {crewLike && !p.matched ? (
          <Pressable
            onPress={() => crewLike.onPress(p)}
            style={styles.link}
            accessibilityRole="button"
            accessibilityLabel={`${crewLike.label}: ${p.name}`}
            accessibilityHint="Your crew matches with them if they like your crew back"
          >
            <Text variant="button">{crewLike.label}</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => onOpenProfile(p)}
          style={styles.link}
          accessibilityRole="button"
          accessibilityLabel={`View ${p.name}'s full profile`}
        >
          <Text variant="button" color={EMBER.textSecondary}>
            View profile
          </Text>
        </Pressable>
      </RisingSheet>
    </SheetModal>
  )
}

type Reason = { icon: keyof typeof Ionicons.glyphMap; text: string }

/** Every reason, in the order `reasonLine` ranks them — the card shows the top one. */
export function allReasons(p: RoomPerson): Reason[] {
  const out: Reason[] = []
  if (p.sharedIntents.includes('dating')) out.push({ icon: 'heart-outline', text: 'Both open to dating' })
  if (p.sharedIntents.includes('networking')) out.push({ icon: 'briefcase-outline', text: 'Both here to network' })
  if (p.sharedIntents.includes('friends')) out.push({ icon: 'people-outline', text: 'Both here to make friends' })
  if (p.sharedPlans > 0)
    out.push({ icon: 'calendar-outline', text: `Going to ${p.sharedPlans} more ${p.sharedPlans === 1 ? 'event' : 'events'} together` })
  if (p.sharedEvents > 0)
    out.push({ icon: 'time-outline', text: `Both at ${p.sharedEvents} ${p.sharedEvents === 1 ? 'night' : 'nights'} before` })
  if (p.sharedWorkField && p.workField) out.push({ icon: 'construct-outline', text: `You both work in ${p.workField}` })
  return out
}

const styles = StyleSheet.create({
  scrim: { flex: 1 },
  sheet: {
    backgroundColor: EMBER.bg,
    borderTopLeftRadius: EMBER_RADIUS.lg,
    borderTopRightRadius: EMBER_RADIUS.lg,
    paddingHorizontal: GUTTER,
    paddingTop: SPACE.md,
    gap: SPACE.lg,
  },
  grabber: { marginBottom: SPACE.xs },
  safety: { position: 'absolute', top: SPACE.lg, right: GUTTER, zIndex: 1 },
  head: { alignItems: 'center', gap: SPACE.xs },
  centre: { textAlign: 'center' },
  hereDot: {
    position: 'absolute',
    right: SPACE.xs,
    bottom: SPACE.xs,
    width: SPACE.lg,
    height: SPACE.lg,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.success,
    borderWidth: 3,
    borderColor: EMBER.bg,
  },
  reasons: {
    gap: SPACE.sm,
    padding: SPACE.lg,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surfaceSunken,
  },
  reason: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  chip: {
    height: CONTROL.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: SPACE.sm },
  action: {
    height: CONTROL.lg,
    borderRadius: EMBER_RADIUS.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
  },
  primary: { flex: 1, backgroundColor: EMBER.accent },
  neutral: { flex: 1, backgroundColor: EMBER.surface },
  square: { flex: 0, width: CONTROL.lg },
  // A text action at a control's height, so the target is a full 48.
  link: { alignSelf: 'center', height: CONTROL.md, paddingHorizontal: SPACE.lg, justifyContent: 'center' },
})
