import { MaterialIcons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, useReducedMotion, withDelay, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { pseudonymAvatar } from '../../lib/pseudonymAvatar'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE } from '../../lib/theme'
import { RisingSheet, SheetModal } from '../motion/RisingSheet'

/**
 * "A new spark." — frame `1141:5389`, *Connection Success*.
 *
 * ## A sheet, not the full screen the frame draws
 *
 * The frame is a 390×884 takeover. This is a sheet over The Grid, because the
 * whole like mechanic is tuned on liking feeling free — `MatchScreen`'s handler
 * is optimistic for exactly that reason — and a full-screen eviction after every
 * mutual makes browsing feel expensive. Dismissing puts you back mid-browse with
 * your scroll position instead of re-mounting the screen.
 *
 * ## Two discs, not two photographs
 *
 * The frame draws two 128pt faces and the line "You and Vivek are connected."
 * Neither is available at the instant of a match: both people are pseudonymous
 * until someone reveals, and `rankMatches` sends **no photo at all** for an
 * unrevealed person — `profile_photos` is empty, enforced server-side.
 *
 * There is nothing to blur, either. `lib/pseudonymAvatar.ts` records why blur
 * was rejected: in-app blur leaves the original in the payload and the device
 * cache, and server-side blur still carries skin tone, hair colour and build.
 *
 * So the composition is the frame's — 128pt, 4pt `#141313` ring, overlapped by
 * 24, the right one dropped 16 — and the faces are
 * `pseudonymAvatar` marks. Same colour, same creature as the grid card they came
 * from and the Banter row they are about to become.
 *
 * Building it with faces would have made a like a one-way identity disclosure:
 * someone could be identified by liking back and never speaking, which is the
 * harvest the pseudonyms exist to stop.
 */

/** Frame `1141:5408`: 128pt, `p-[4px]`, 4pt `#141313` border. */
const AVATAR = 128
const AVATAR_RING = 4
/** Frame `1141:5412`: `left-[-24px]`. Frame `1141:5410`: `pt-[16px]`. */
const AVATAR_OVERLAP = 24
const AVATAR_DROP = 16

/*
 * The moment, in three beats — and nothing that glows.
 *
 * The Modal fades, so the scrim darkens in place instead of riding up with the
 * sheet (`animationType="slide"` moved the whole transparent layer, scrim
 * included). The sheet rises on the iOS sheet curve (`RisingSheet`). The two discs slide 24pt
 * toward each other as it settles — the meeting is the content — and the spark
 * lands last. The gradient aura behind the discs is gone: a glow under the
 * moment read as decoration, and the discs carry their own colour.
 *
 * Timed, not sprung: a match arrives from a tap, with no momentum to carry.
 * A mutual is rare, which is the only reason this gets choreography at all.
 *
 * Reduce Motion: the sheet fades in and the discs and spark simply appear.
 */
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)
const DISC_SHIFT = 24

const discIn = (from: number) => () => {
  'worklet'
  const t = { duration: 280, easing: EASE_OUT }
  return {
    initialValues: { opacity: 0, transform: [{ translateX: from }] },
    animations: {
      opacity: withDelay(120, withTiming(1, t)),
      transform: [{ translateX: withDelay(120, withTiming(0, t)) }],
    },
  }
}
const leftDiscIn = discIn(-DISC_SHIFT)
const rightDiscIn = discIn(DISC_SHIFT)

const sparkIn = () => {
  'worklet'
  const t = { duration: 200, easing: EASE_OUT }
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.6 }] },
    animations: {
      opacity: withDelay(320, withTiming(1, t)),
      transform: [{ scale: withDelay(320, withTiming(1, t)) }],
    },
  }
}

export function ConnectionSheet({
  visible,
  pseudonym,
  youPseudonym,
  onSendMessage,
  onDismiss,
}: {
  visible: boolean
  /** Theirs. Already the pseudonym — the server sends nothing else pre-reveal. */
  pseudonym: string
  /** Yours, for the left disc. Both marks are seeded the same way. */
  youPseudonym: string
  onSendMessage: () => void
  onDismiss: () => void
}) {
  const insets = useSafeAreaInsets()
  const you = pseudonymAvatar(youPseudonym)
  const them = pseudonymAvatar(pseudonym)
  const reduceMotion = useReducedMotion()

  return (
    <SheetModal
      visible={visible}
      onRequestClose={onDismiss}
      accessibilityViewIsModal
    >
      <Pressable style={styles.scrim} onPress={onDismiss} accessibilityLabel="Dismiss" />

      <RisingSheet style={[styles.sheet, { paddingBottom: insets.bottom + SPACE.xl }]}>
        <View style={styles.grabber} />

        <View style={styles.composition}>
          <Animated.View entering={reduceMotion ? undefined : leftDiscIn}>
            <Disc colors={you.colors} character={you.character} label="You" />
          </Animated.View>
          <Animated.View entering={reduceMotion ? undefined : rightDiscIn} style={styles.discSecond}>
            <Disc colors={them.colors} character={them.character} label={pseudonym} />
          </Animated.View>

          {/*
            Frame `1141:5414` is a 46pt exported sparkle. `react-native-svg` is
            not a dependency and one icon does not justify adding it — this is
            the same glyph from the icon set already installed, on a `surface`
            well: the sheet's one accent is its primary button.
          */}
          <Animated.View
            entering={reduceMotion ? undefined : sparkIn}
            style={styles.spark}
            pointerEvents="none"
          >
            <MaterialIcons name="auto-awesome" size={ICON.lg} color={EMBER.textPrimary} />
          </Animated.View>
        </View>

        <Text style={styles.title} maxFontSizeMultiplier={1.4} accessibilityRole="header">
          A new spark.
        </Text>

        {/*
          The name in primary white: the send button is this sheet's one
          accent.
        */}
        <Text style={styles.body} maxFontSizeMultiplier={1.4}>
          You and <Text style={styles.bodyName}>{pseudonym}</Text> are connected.
        </Text>

        <View style={styles.actions}>
          <Pressable
            onPress={onSendMessage}
            accessibilityRole="button"
            accessibilityLabel={`Send a message to ${pseudonym}`}
            style={({ pressed }) => [styles.button, styles.primary, pressed && styles.pressed]}
          >
            <Text style={styles.primaryLabel} maxFontSizeMultiplier={1.3}>
              Send a Message
            </Text>
          </Pressable>

          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Continue exploring"
            style={({ pressed }) => [styles.button, styles.secondary, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryLabel} maxFontSizeMultiplier={1.3}>
              Continue Exploring
            </Text>
          </Pressable>
        </View>
      </RisingSheet>
    </SheetModal>
  )
}

/** One 128pt mark, ringed in the page colour so the overlap reads as depth. */
function Disc({
  colors,
  character,
  label,
  style,
}: {
  colors: readonly [string, string]
  character: string
  label: string
  style?: object
}) {
  return (
    <View style={[styles.disc, style]} accessibilityLabel={label}>
      <LinearGradient colors={colors} style={styles.discFill}>
        <Text style={styles.discGlyph} maxFontSizeMultiplier={1}>
          {character}
        </Text>
      </LinearGradient>
    </View>
  )
}

const styles = StyleSheet.create({
  // Transparent: `SheetModal` draws the dim and fades it on its own.
  scrim: { flex: 1 },
  sheet: {
    backgroundColor: EMBER.bg,
    borderTopLeftRadius: EMBER_RADIUS.lg,
    borderTopRightRadius: EMBER_RADIUS.lg,
    paddingHorizontal: GUTTER,
    paddingTop: SPACE.md,
    alignItems: 'center',
    gap: SPACE.lg,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.textTertiary,
    marginBottom: SPACE.lg,
  },

  composition: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginBottom: SPACE.lg,
  },
  disc: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: EMBER_RADIUS.pill,
    borderWidth: AVATAR_RING,
    // The page colour, so the two discs read as overlapping rather than merging.
    borderColor: EMBER.surfaceMedia,
    overflow: 'hidden',
  },
  discSecond: { marginLeft: -AVATAR_OVERLAP, marginTop: AVATAR_DROP },
  discFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  /*
   * Fixed against Dynamic Type. The disc is a fixed 128pt and RN clips a glyph
   * to its `lineHeight`, so a scaled emoji is a cropped emoji. The words below
   * scale, which is where the accessibility actually lives.
   */
  // design-exception: emoji glyph sized to the 128pt disc
  discGlyph: { fontSize: 56, lineHeight: 68 },
  spark: {
    position: 'absolute',
    right: -4,
    top: -16,
    width: CONTROL.md,
    height: CONTROL.md,
    borderRadius: EMBER_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: EMBER.surface,
  },

  title: { ...TYPE.title, textAlign: 'center' },
  body: { ...TYPE.body, color: EMBER.textSecondary, textAlign: 'center', maxWidth: 320 },
  bodyName: { color: EMBER.textPrimary },

  actions: { width: '100%', gap: SPACE.md, marginTop: SPACE.lg },
  /*
   * `minHeight`, not a fixed height: pinned, it clips the label at large
   * Dynamic Type and in any language whose translation runs two lines.
   * The frame drew 68; the scale's primary action is CONTROL.lg.
   */
  button: {
    minHeight: CONTROL.lg,
    borderRadius: EMBER_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACE.lg,
    paddingHorizontal: SPACE.xl,
    overflow: 'hidden',
  },
  primary: { backgroundColor: EMBER.accent },
  secondary: { backgroundColor: EMBER.surface },
  pressed: { opacity: 0.75 },
  primaryLabel: { ...TYPE.button, color: EMBER.onGradient, textAlign: 'center' },
  secondaryLabel: { ...TYPE.button, textAlign: 'center' },
})
