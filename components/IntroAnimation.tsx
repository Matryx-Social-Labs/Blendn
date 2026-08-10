import { Image } from 'expo-image'
import React, { useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, View } from 'react-native'

import { APP_COLORS } from '../lib/theme'

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

/** 26 frames at 24fps, plus a beat to land on the final frame. */
const DURATION_MS = 1080
const FADE_MS = 260

export function IntroAnimation({ onDone }: { onDone: () => void }) {
  const [visible, setVisible] = useState(true)
  const opacity = useRef(new Animated.Value(1)).current
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
    const timer = setTimeout(finish, DURATION_MS)
    return () => clearTimeout(timer)
  }, [finish])

  if (!visible) return null

  return (
    <Animated.View style={[styles.overlay, { opacity }]} pointerEvents="none">
      <View style={styles.centre}>
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
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: APP_COLORS.backgroundBase,
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
  image: { height: 132, width: 132 * (720 / 346), maxWidth: '88%' },
})
