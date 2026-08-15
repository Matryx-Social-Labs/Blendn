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
 * ## Why it starts mid-motion
 *
 * The native splash already shows the completed monogram. The master opens by
 * drawing that monogram from nothing, so playing it from the start would erase
 * the logo the user is looking at and redraw it — a visible reset. The asset is
 * cut to begin exactly where the native splash ends, so the handoff is
 * invisible and only the part that adds something plays.
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
 * 31 frames at 24fps (1.29s), plus a beat to land on the final frame.
 *
 * Must track `scripts/build-intro-animation.sh`. Cutting away too early is not
 * hypothetical: the first build ended at 4.65s of the master and stopped with a
 * coloured wipe still sitting on the final "n", so the wordmark read as
 * unfinished. If the asset is rebuilt with different bounds, change this too.
 */
const DURATION_MS = 1340
const FADE_MS = 260

/*
 * Where the intro has to *arrive*, so the mark does not teleport on handover.
 *
 * Measured on device at 0.2s intervals through a cold launch, in points on a
 * 440pt screen:
 *
 *   0.2 - 1.2s   119 x 141   centre y 478    monogram, static
 *   1.4s          76 x  91   centre y 478    shrinking
 *   1.6s         190 x  59   centre y 479    wordmark writing on
 *   1.8s         203 x  58   centre y 479    lockup complete
 *   2.0s+        304 x 100   centre y 355    SIGN-IN
 *
 * The last two rows are consecutive frames. The mark jumped **1.5x in scale and
 * 123pt upward at once**, which is the whole of what read as a jolt — the
 * splash-to-intro handoff was already seamless, and this was the other end.
 *
 * So the container travels: it starts where the native splash left the mark and
 * ends exactly where sign-in draws its lockup, and the asset's own slide-and-
 * write plays on top of that.
 *
 * If sign-in's lockup moves or resizes, these two numbers are what has to
 * follow — and the way to check is to sample a launch, not to look at one.
 */
const TRAVEL_SCALE = 304 / 203
const TRAVEL_Y = -123

export function IntroAnimation({ onDone }: { onDone: () => void }) {
  const [visible, setVisible] = useState(true)
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
    travelling.start()
    const timer = setTimeout(finish, DURATION_MS)
    return () => {
      travelling.stop()
      clearTimeout(timer)
    }
  }, [finish, travel])

  if (!visible) return null

  return (
    <Animated.View style={[styles.overlay, { opacity }]} pointerEvents="none">
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
        <Image
          source={intro}
          style={styles.image}
          contentFit="contain"
          // Play once and hold the last frame, matching the asset's own loop
          // count — restarting under a fade would read as a stutter.
          autoplay
          cachePolicy="memory-disk"
          onError={finish}
          transition={0}
        />
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
   * 105, not 132 — and it has to move with `app.json`'s `imageWidth`.
   *
   * Measured on a 440pt device: the native splash rendered 144pt of logo and
   * this rendered 147pt, which is why the handoff reads as one continuous mark
   * rather than a jump. That agreement is the thing worth protecting, so
   * neither number may be changed alone.
   *
   * They were both about a third of the screen's width, which is the top of the
   * range a launch mark usually occupies. 105 here and 146 there put both at
   * roughly 27%.
   */
  image: { height: 105, width: 105 * (720 / 346), maxWidth: '88%' },
})
