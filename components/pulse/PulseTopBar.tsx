import { Platform, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { COLOR, RADIUS, SIZE, SPACE as DS_SPACE, TYPE as DS_TYPE } from '../../lib/design/tokens'
import { EMBER, GUTTER, SPACE, TYPE } from '../../lib/theme'
import { Material } from '../ui/Material'

/** Frame `1141:4819`: the bar is 64 tall, below the status bar. */
export const TOP_BAR_HEIGHT = 64

/**
 * The overlay header — frame `1141:4819`.
 *
 * ## An overlay, not a header component
 *
 * It sits at `top: 0` over the feed as an opaque `EMBER.bg` band — no blur —
 * and the feed scrolls **under** it. The bar this replaced
 * reserved its own height and sat above a bordered panel, which is half of why
 * the old Pulse read as a page inside a page. Nothing here occupies layout;
 * the screen clears it with padding on the scroll content.
 *
 * The status bar is added to the 64 rather than absorbed into it: the frame is
 * a 390pt artboard with no notch, and taking its height literally is what put
 * "The Pulse" underneath the clock on a real device.
 *
 * ## One thing in it, and the frame draws three
 *
 * The frame has an 18×12 glyph at the left and a 16×20 glyph at the right. The
 * wordmark is the only one rendered, because it is the only one that goes
 * anywhere.
 *
 * - **The left glyph is a hamburger.** There is no drawer in this app, and
 *   inventing one to justify a glyph is the tail wagging the dog.
 * - **The right glyph is a bell.** It was left out for the same reason — a
 *   notifications centre was designed and not built, and a bell that opens
 *   nothing is a dead control in the most-tapped corner of the screen. That
 *   reason has expired: `GET /notifications` exists (blendn-admin #242), and
 *   The Pulse passes `NotificationBell` in through `actions`.
 *
 * The hamburger is still recorded in `docs/PULSE.md` and goes in the moment it
 * has a destination. An empty `justify-between` row still leaves the wordmark
 * where the frame puts it, at `x=24`.
 */
/**
 * `leading` and `actions` exist so The Scene can use *this* bar.
 *
 * The Scene's header (`1141:4930`) and the Pulse's (`1141:4819`) are the same
 * component in the design, and The Scene had grown its own lookalike — a
 * second bar with different padding and a different fill. Two bars that are
 * supposed to be one drift the first time either is touched.
 *
 * They differ in what they *hold*, not how they look. The Pulse is a tab and
 * needs nothing; The Scene is pushed, so it needs a way back, and the actions
 * that belong to the event it is showing. Both slots default to empty, which
 * is the Pulse exactly as before.
 *
 * `pointerEvents` follows: `none` with no slots, so the feed scrolls under the
 * bar untouched, and `box-none` once there are controls, so the buttons are
 * tappable while the gaps between them still pass scrolls through.
 */
export function PulseTopBar({
  leading,
  actions,
  title = "Blend'n",
  floating = false,
}: {
  /**
   * Home's frame (Flow 3 discovery, guidelines/flow-3/flow3.js): no band at all. The map runs under the status bar and the
   * wordmark floats on it as a glass capsule (44 pt iOS · 48 dp Android, 700 20/24) 16 pt in from each edge, the bell
   * beside it as a glass circle. The opaque band stays for screens whose content scrolls under the bar (the Scene).
   */
  floating?: boolean
  leading?: React.ReactNode
  actions?: React.ReactNode
  /**
   * The word beside the leading control.
   *
   * Per screen, not fixed: the Pulse's frame (`1141:4819`) puts the wordmark
   * here, The Banter's (`1141:5351`) puts "The Banter" — same position, same
   * `TYPE.button` in `textPrimary` (the frames drew it in the accent; the
   * accent now belongs to one thing per screen). Hardcoding the wordmark made
   * every screen that reused this bar claim to be the home screen.
   */
  title?: string
} = {}) {
  const insets = useSafeAreaInsets()
  const interactive = Boolean(leading || actions)

  return (
    <View
      style={[
        styles.bar,
        floating && styles.floatingBar,
        { paddingTop: insets.top, height: insets.top + TOP_BAR_HEIGHT },
      ]}
      pointerEvents={interactive ? 'box-none' : 'none'}
    >
      <View style={[styles.row, floating && styles.floatingRow]} pointerEvents={interactive ? 'box-none' : 'none'}>
        {/*
          Frame: the left group is the glyph and the wordmark together, 16pt
          apart, starting at x=24. With no leading glyph the wordmark simply
          starts there instead, which is where it already was.
        */}
        <View style={styles.leadingGroup} pointerEvents={interactive ? 'box-none' : 'none'}>
          {leading}
          {/*
            The wordmark, in white. The frame sets it in the accent, but the
            accent belongs to at most one thing per screen, and that is the
            screen's own call — not a label the bar prints on every screen.
          */}
          {floating ? (
            <Material role="control" style={styles.capsule}>
              <Text style={styles.capsuleWordmark} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
                {title}
              </Text>
            </Material>
          ) : (
            <Text style={styles.wordmark} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
              {title}
            </Text>
          )}
        </View>
        <View style={styles.actions} pointerEvents={interactive ? 'box-none' : 'none'}>
          {actions}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    // The page colour, opaque. The frame's 80% fill under a 12pt blur is
    // glass (tasks/lessons.md); the feed now passes under a flat band.
    backgroundColor: EMBER.bg,
  },
  row: {
    height: TOP_BAR_HEIGHT,
    paddingHorizontal: GUTTER,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Frame `1141:4931`: the glyph and the wordmark, 16pt apart.
  leadingGroup: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg },
  actions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg },
  wordmark: { ...TYPE.button },
  floatingBar: { backgroundColor: 'transparent' },
  // The capsule and the bell start at the safe-area top (Flow 3 `home`: top 62), not centred in the band under it.
  floatingRow: { paddingHorizontal: DS_SPACE.lg, alignItems: 'flex-start' },
  capsule: {
    height: Platform.OS === 'android' ? SIZE.circleButtonAndroid : SIZE.circleButton,
    paddingHorizontal: DS_SPACE.lg,
    borderRadius: RADIUS.capsule,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  capsuleWordmark: { ...DS_TYPE.heading, color: COLOR.textPrimary },
})
