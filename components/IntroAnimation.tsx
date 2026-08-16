import { Image } from 'expo-image'
import React, { useEffect, useRef, useState } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'

import { EMBER } from '../lib/theme'

const intro = require('../assets/logo/intro.webp')

/**
 * The launch animation: the monogram slides left and the wordmark writes on.
 *
 * ## It is an overlay, not a gate
 *
 * Auth, asset loading and routing all continue underneath. Nothing waits for
 * this, and it never delays a user who is already signed in — the app is being
 * decided while it plays, and whatever is underneath is simply revealed when it
 * finishes. An animation that blocks startup is a tax paid on every launch.
 *
 * ## The black beat, and why the asset is no longer cut
 *
 * The native splash shows the completed monogram; the master opens by drawing
 * that monogram from nothing. Those two facts used to be resolved by cutting
 * the asset's head off, so playback began on exactly what the splash was
 * already showing and the handoff was seamless.
 *
 * Seamless, and empty: what shipped was a launch whose first ~800ms was a
 * static logo. The monogram's own draw-on — the best part of the artwork —
 * never played on any launch.
 *
 * So the full asset plays, and the erase-and-redraw it would otherwise cause
 * is broken by holding black for a beat first. A cut to black reads as a cut.
 * A logo dissolving back to nothing and redrawing reads as a bug. One beat is
 * the whole price of the draw-on, and it is cheap.
 *
 * The hold is here rather than as blank frames in the asset so it can be tuned
 * without a rebuild, and so it is visible to anyone reading the timing.
 *
 * ## Timing is a timeout, not a callback
 *
 * `expo-image` gives no reliable "animation finished" event, so this must not be
 * architected around one. The asset's duration is known at build time, so the
 * component waits that long and then fades. If the image never loads — decoder
 * missing, file corrupt, anything — `onError` dismisses it immediately rather
 * than leaving a black rectangle over the app.
 *
 * ## Android caveat
 *
 * `expo-image` documents animated WebP on both platforms, but on Android that
 * support comes from a bundled decoder rather than the OS. If it renders a
 * static first frame on a real device, the swap is `intro.webp` -> an APNG
 * built by the same script; same component, same call. Measured alternatives
 * are in `scripts/build-intro-animation.sh`.
 */

/**
 * 44 frames encoded at 42ms (1848ms), plus a beat to land on the final frame.
 *
 * Must track `scripts/build-intro-animation.sh`. Note it is the *encoded* frame
 * delay that matters, not the nominal 24fps the filter graph asks for —
 * `img2webp -d 42` makes the real duration 44x42, not 44/24. Cutting away too
 * early is not hypothetical: the first build ended at 4.65s of the master and
 * stopped with a coloured wipe still sitting on the final "n", so the wordmark
 * read as unfinished. If the asset is rebuilt with different bounds, change
 * this too.
 */
const DURATION_MS = 1890
const FADE_MS = 260

/**
 * The black held between the native splash and the first drawn frame.
 *
 * Short enough to read as a cut rather than a stall, long enough that the
 * completed splash monogram and the monogram drawing from nothing are not seen
 * as the same object changing. The splash's own 200ms fade-out precedes this,
 * so the gap on screen is longer than the number.
 */
const BLACK_MS = 180

/*
 * Where the intro has to *arrive*, so the mark does not jump on handover.
 *
 * The container travels while the asset's own slide-and-write plays on top of
 * it, so the lockup the animation ends on is already sitting where sign-in
 * draws its own.
 *
 * ## These were wrong, and the way they were wrong is worth keeping
 *
 * The previous values were `304 / 203` and `-123`, and **304 was the width of
 * sign-in's tagline, not its lockup**. The original pass measured a horizontal
 * band that included "Same place. Same vibe. Instant connections." — which is
 * half again as wide as the mark above it — and took that for the logo.
 *
 * So the intro spent its whole travel inflating the mark to the width of a line
 * of body text, and the fade then revealed the real lockup at two thirds the
 * size. That is the "zoom out at the end" that got reported twice, and it
 * survived a verification pass that re-measured the same contaminated band and
 * agreed with itself.
 *
 * Measured per row rather than per band, on a 440pt screen, threshold 60:
 *
 *   intro, travel disabled   200.0 x 57.3   centre y 478.5
 *   sign-in lockup           196.3 x 56.0   centre y 333.2   <- the target
 *   sign-in tagline          304.3 x 14.0   centre y 398.5   <- not the target
 *
 * The mark therefore barely resizes at all: both ends render the same artwork
 * at nearly the same height (this image's 105 against sign-in's
 * `LOCKUP_HEIGHT` of 60, which land 2% apart). Almost all of the movement is
 * vertical, and always should have been.
 *
 * If sign-in's lockup moves or resizes, these two numbers follow — and the way
 * to check is to sample a launch and isolate the logo's own row band, not to
 * measure a rectangle that happens to contain it.
 */
const TRAVEL_SCALE = 196.3 / 200.0
const TRAVEL_Y = 333.2 - 478.5

export function IntroAnimation({ onDone }: { onDone: () => void }) {
  const [visible, setVisible] = useState(true)
  // The image is not mounted during the black hold. Rendering it invisible
  // instead would let `expo-image` start playing behind an opacity of 0, and
  // the beat would silently buy nothing.
  const [drawing, setDrawing] = useState(false)
  const opacity = useRef(new Animated.Value(1)).current
  const travel = useRef(new Animated.Value(0)).current
  const finished = useRef(false)

  // One shot. `onDone` is called exactly once however this ends — timer, error,
  // or unmount — so a caller can treat it as "the intro is over, for good".
  const finish = useRef(() => {
    if (finished.current) return
    finished.current = true
    Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_MS,
      useNativeDriver: true,
    }).start(() => {
      setVisible(false)
      onDone()
    })
  }).current

  useEffect(() => {
    /*
     * Eased so it stays put and then moves, rather than drifting throughout.
     *
     * The monogram is static for the first second while fonts and images
     * decode; a linear travel would slide it during that hold, which reads as
     * the screen sagging. `Easing.in(Easing.cubic)` keeps it near zero early
     * and does almost all the movement in the last third — arriving as the
     * wordmark lands, which is the moment the composition changes anyway.
     *
     * Transform only, so `useNativeDriver` holds. This runs while auth, asset
     * loading and routing are all still going underneath, which is exactly when
     * the JS thread must not be carrying an animation.
     */
    const travelling = Animated.timing(travel, {
      toValue: 1,
      duration: DURATION_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    })

    // Both start together, after the hold. The travel must not run during the
    // black — it would spend part of its curve while nothing is on screen and
    // the mark would appear already in motion.
    const start = setTimeout(() => {
      setDrawing(true)
      travelling.start()
    }, BLACK_MS)
    const timer = setTimeout(finish, BLACK_MS + DURATION_MS)

    return () => {
      clearTimeout(start)
      travelling.stop()
      clearTimeout(timer)
    }
  }, [finish, travel])

  if (!visible) return null

  return (
    /*
      Invisible to VoiceOver, and deliberately not labelled "loading".

      This is the brand mark drawing itself over a black screen for under two
      seconds. It carries no information: there is nothing to act on, nothing
      to read, and the screen it hands off to announces itself. Left visible to
      the accessibility tree it becomes a focus stop that says nothing, on the
      very first thing anybody meets.

      `accessibilityElementsHidden` is the iOS half and
      `importantForAccessibility="no-hide-descendants"` the Android half —
      both are needed, and neither implies the other.
    */
    <Animated.View
      style={[styles.overlay, { opacity }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        style={[
          styles.centre,
          {
            transform: [
              { translateY: travel.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL_Y] }) },
              { scale: travel.interpolate({ inputRange: [0, 1], outputRange: [1, TRAVEL_SCALE] }) },
            ],
          },
        ]}
      >
        {drawing ? (
          <Image
            source={intro}
            style={styles.image}
            contentFit="contain"
            // Play once and hold the last frame, matching the asset's own loop
            // count — restarting under a fade would read as a stutter.
            autoplay
            cachePolicy="memory-disk"
            onError={finish}
            // No cross-fade. The asset opens on a transparent frame, so there
            // is nothing to fade in from, and a transition here would only
            // blur the edge of the cut the black hold exists to make sharp.
            transition={0}
          />
        ) : null}
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    /*
     * `EMBER.bg`, not `APP_COLORS.backgroundBase`.
     *
     * This overlay covers the whole screen and then fades. It was painting
     * `#000000` while the root layout and every Stack screen underneath use
     * `EMBER.bg` (`#0F0E0E`) — so the fade revealed a background that was
     * *lighter and warmer* than the one it replaced. A colour shift at exactly
     * the handoff, on top of the geometry jump the travel now fixes.
     *
     * Pure black beside a warm near-black is subtle in a screenshot and obvious
     * in motion, which is why it survived: nobody diffs two blacks.
     */
    backgroundColor: EMBER.bg,
    zIndex: 10,
  },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  /*
   * Height-driven, not `width: '<pct>%'` plus `aspectRatio`. That combination
   * rendered the sign-in lockup several times too large on device, overflowing
   * the screen — a percentage resolving against a percentage-width parent
   * inside a flex column did not match the arithmetic. With `contentFit`
   * contain and a capped width, a wrong number can only letterbox.
   */
  /*
   * 105, and it is no longer coupled to `app.json`'s `imageWidth`.
   *
   * It used to be. The two were held equal so the splash's monogram and this
   * animation's first frame were the same size and the handoff was invisible —
   * "neither number may be changed alone", the comment here said.
   *
   * The black hold retired that constraint. The splash's mark and the first
   * drawn frame are now separated by a deliberate cut, so they no longer have
   * to agree about anything and the splash is free to be sized on its own
   * merits. That is what let it come down from 146 to 118.
   *
   * What this number *is* coupled to is the other end: at 105 the asset's final
   * lockup renders 200.0 x 57.3pt, which is within 2% of the 196.3 x 56.0pt
   * sign-in draws, and `TRAVEL_SCALE` closes the remainder. Changing it means
   * re-measuring that pair.
   */
  image: { height: 105, width: 105 * (720 / 346), maxWidth: '88%' },
})
