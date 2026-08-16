import { BlurView } from 'expo-blur'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { EMBER, EMBER_FONTS } from '../../lib/theme'

/** Frame `1141:4819`: the bar is 64 tall, below the status bar. */
export const TOP_BAR_HEIGHT = 64

/**
 * The overlay header — frame `1141:4819`.
 *
 * ## An overlay, not a header component
 *
 * It sits at `top: 0` over the feed with an 80%-opacity fill and a 12pt
 * backdrop blur, and the feed scrolls **under** it. The bar this replaced
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
 * second bar with different padding, a different fill and no blur. Two bars
 * that are supposed to be one drift the first time either is touched.
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
  topInset,
}: {
  leading?: React.ReactNode
  actions?: React.ReactNode
  /**
   * The word in the accent slot.
   *
   * Per screen, not fixed: the Pulse's frame (`1141:4819`) puts the wordmark
   * here, The Banter's (`1141:5351`) puts "The Banter" — same position, same
   * `#FF906D` Plus Jakarta Bold 16/24. Hardcoding the wordmark made every
   * screen that reused this bar claim to be the home screen.
   */
  title?: string
  /**
   * Override the safe-area top the bar pads itself by.
   *
   * `useSafeAreaInsets()` reads the nearest provider, and the app's lives at the
   * root — so inside a `presentation: 'modal'` screen it reports the *device's*
   * inset even though iOS has already dropped the sheet below the notch. The
   * bar then pads by a notch that is not there, and any content offsetting
   * itself by `insets.top + TOP_BAR_HEIGHT` double-counts the same 62pt.
   *
   * That is what put a black band above the Grid's header. A sheet passes 0.
   */
  topInset?: number
} = {}) {
  const insets = useSafeAreaInsets()
  const interactive = Boolean(leading || actions)

  return (
    <View
      style={[
        styles.bar,
        { paddingTop: topInset ?? insets.top, height: (topInset ?? insets.top) + TOP_BAR_HEIGHT },
      ]}
      pointerEvents={interactive ? 'box-none' : 'none'}
    >
      <BlurView intensity={12} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.row} pointerEvents={interactive ? 'box-none' : 'none'}>
        {/*
          Frame: the left group is the glyph and the wordmark together, 16pt
          apart, starting at x=24. With no leading glyph the wordmark simply
          starts there instead, which is where it already was.
        */}
        <View style={styles.leadingGroup} pointerEvents={interactive ? 'box-none' : 'none'}>
          {leading}
          {/*
            The wordmark, in the accent rather than white.

            Frame: Plus Jakarta Bold 16/24, `#FF906D`, `letterSpacing: -0.8`. It
            is the only warm text in the bar, which is what makes it read as a
            mark rather than as a heading — the screen's own title is "The Pulse"
            in 48pt, in the feed below.
          */}
          <Text style={styles.wordmark} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
            {title}
          </Text>
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
    // Frame: `rgba(15,14,14,0.8)` — `EMBER.bg` at 80%, so the feed shows
    // through as a darkened blur rather than disappearing behind a solid band.
    backgroundColor: 'rgba(15,14,14,0.8)',
  },
  row: {
    height: TOP_BAR_HEIGHT,
    // Frame: the left group starts at x=24.
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Frame `1141:4931`: the glyph and the wordmark, 16pt apart.
  leadingGroup: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  wordmark: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.8,
    color: EMBER.accent,
  },
})
