import { MaterialIcons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { pseudonymAvatar } from '../../lib/pseudonymAvatar'
import { EMBER, EMBER_FONTS, EMBER_GRADIENT, EMBER_TYPE } from '../../lib/theme'

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
 * 24, the right one dropped 16, the gradient aura behind — and the faces are
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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onDismiss}
      accessibilityViewIsModal
    >
      <Pressable style={styles.scrim} onPress={onDismiss} accessibilityLabel="Dismiss" />

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.grabber} />

        <View style={styles.composition}>
          {/*
            Frame `1141:5406`: 192pt, the gradient at 20% under a 30pt blur. RN
            has no backdrop blur on a plain View, so this is the gradient at low
            opacity — the aura reads as a glow either way, and a `BlurView` here
            would be a native layer rendering behind two opaque discs.
          */}
          <LinearGradient
            colors={[...EMBER_GRADIENT.colors]}
            start={EMBER_GRADIENT.start}
            end={EMBER_GRADIENT.end}
            style={styles.aura}
            pointerEvents="none"
          />

          <Disc colors={you.colors} character={you.character} label="You" />
          <Disc
            colors={them.colors}
            character={them.character}
            label={pseudonym}
            style={styles.discSecond}
          />

          {/*
            Frame `1141:5414` is a 46pt exported sparkle. `react-native-svg` is
            not a dependency and one icon does not justify adding it — this is
            the same glyph from the icon set already installed.
          */}
          <View style={styles.spark} pointerEvents="none">
            <MaterialIcons name="auto-awesome" size={22} color={EMBER.onGradient} />
          </View>
        </View>

        <Text style={styles.title} maxFontSizeMultiplier={1.4} accessibilityRole="header">
          A new spark.
        </Text>

        {/*
          The frame accents the name. It is the pseudonym, so the accent is
          pointing at the thing you actually know about them.
        */}
        <Text style={styles.body} maxFontSizeMultiplier={1.4}>
          You and <Text style={styles.bodyName}>{pseudonym}</Text> are connected.
        </Text>

        <View style={styles.actions}>
          <Pressable
            onPress={onSendMessage}
            accessibilityRole="button"
            accessibilityLabel={`Send a message to ${pseudonym}`}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <LinearGradient
              colors={[...EMBER_GRADIENT.colors]}
              start={EMBER_GRADIENT.start}
              end={EMBER_GRADIENT.end}
              style={StyleSheet.absoluteFill}
            />
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
      </View>
    </Modal>
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
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: EMBER.bg,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 16,
    paddingTop: 12,
    alignItems: 'center',
    gap: 16,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: EMBER.surface,
    marginBottom: 20,
  },

  composition: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginBottom: 16,
  },
  aura: {
    position: 'absolute',
    width: 192,
    height: 192,
    borderRadius: 96,
    top: -32,
    opacity: 0.2,
  },
  disc: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
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
  discGlyph: { fontSize: 56, lineHeight: 68 },
  spark: {
    position: 'absolute',
    right: -4,
    top: -16,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: EMBER.gradientFrom,
  },

  // Frame `1141:5396`: Plus Jakarta ExtraBold 16/24, tracking -0.8.
  title: {
    fontFamily: EMBER_FONTS.displayExtraBold,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.8,
    color: EMBER.textPrimary,
    textAlign: 'center',
  },
  // Frame `1141:5398`: Manrope Regular 16/24, `#AEAAAA`, name in the accent.
  body: {
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 16,
    lineHeight: 24,
    color: EMBER.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
  },
  bodyName: { color: EMBER.accent },

  actions: { width: '100%', gap: 16, marginTop: 16 },
  /*
   * `minHeight`, not the frame's fixed 68.
   *
   * 68 is `py-[20px]` around an 18/28 line. Pinned, it clips the label at large
   * Dynamic Type and in any language whose translation runs two lines.
   */
  button: {
    minHeight: 68,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 24,
    overflow: 'hidden',
  },
  secondary: { backgroundColor: EMBER.surface },
  pressed: { opacity: 0.75 },
  primaryLabel: { ...EMBER_TYPE.actionPrimary, textAlign: 'center' },
  secondaryLabel: { ...EMBER_TYPE.actionSecondary, textAlign: 'center' },
})
