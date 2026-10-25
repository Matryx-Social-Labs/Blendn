import { Image } from 'expo-image'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native'

import type { FeedMediaItem } from '../../lib/feedMedia'
import { COLOR, MATERIAL, RADIUS, SPACE } from '../../lib/design/tokens'
import { useReduceTransparency } from '../ds/shared'
import { tint } from '../../lib/theme'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useReducedMotion } from '../../lib/motion'

/**
 * The hero's media: a swipeable pager that also advances on its own.
 *
 * ## Why not `FeedMedia`
 *
 * `FeedMedia` is the right component for a *card* — it cycles, it mounts one
 * decoder, and it is deliberately not interactive because a feed card's job is
 * to be scrolled past. The hero is the screen you chose to open, so it has to
 * take a swipe, and a component that both auto-advances and accepts gestures is
 * a different thing with a different rule.
 *
 * ## Auto-advance stops the moment you take over
 *
 * It advances by itself until the first manual swipe, and then never again for
 * the life of the screen. The alternative — resuming after a pause — is the
 * single most complained-about carousel behaviour there is: it moves the thing
 * you are looking at out from under you, and it always seems to do it just as
 * you start reading. One flag, no timer to reset, no setting to explain.
 *
 * Stills advance on a timer; **clips advance when they end**, so a video is
 * never cut off mid-shot and a fixed dwell never freezes on its last frame.
 * Same rule as the feed, for the same reason: the length is the organiser's.
 */
const IMAGE_DWELL_MS = 4000

/**
 * How long to wait for a clip to say *anything* before giving up on it.
 *
 * A clip advances the pager when it reaches its end. A clip that never loads
 * never reaches its end, so without this the carousel stops on that page for
 * good — and because the poster is painted underneath, it does not look broken.
 * It looks like a still the organiser chose, and the rest of their media is
 * simply never seen.
 *
 * Not hypothetical: three separate clip URLs failed exactly this way in one
 * afternoon — a 403, a redirect to an HTML page, and two files with their `moov`
 * atom at the end. Every one of them was silent until the frames were diffed.
 *
 * 15s to reach `readyToPlay` covers a slow connection on a 12 MB clip, which is
 * the ceiling `blendn-admin/docs/MEDIA.md` sets.
 */
const CLIP_READY_TIMEOUT_MS = 15_000

export function SceneHeroMedia({
  playlist,
  width,
  height,
  onPress,
  paused = false,
  started = false,
  onClipInView,
}: {
  playlist: FeedMediaItem[]
  width: number
  height: number
  /** Opens the lightbox at the item currently shown. */
  onPress?: (index: number) => void
  /**
   * The hero's pause (WCAG 2.2.2, audit H2; `SceneHero` draws the control over the scrims): a clip holds its frame and
   * nothing advances. Under Reduce Motion it starts paused.
   */
  paused?: boolean
  /** Somebody pressed Play or Pause: a clip that never autoplayed (Reduce Motion) may now mount. */
  started?: boolean
  /** Whether the page in view is a clip, for the control (shown only over one). */
  onClipInView?: (clip: boolean) => void
}) {
  const [index, setIndex] = useState(0)
  const [manual, setManual] = useState(false)
  const reduceMotion = useReducedMotion()
  const reduceTransparency = useReduceTransparency()
  const scrollRef = useRef<ScrollView>(null)

  // `index` in a ref as well, so the timer can read the current page without
  // being torn down and rebuilt every time the page changes.
  const indexRef = useRef(0)

  const goTo = (next: number) => {
    const wrapped = ((next % playlist.length) + playlist.length) % playlist.length
    scrollRef.current?.scrollTo({ x: wrapped * width, animated: !reduceMotion })
    setIndex(wrapped)
  }
  const goToRef = useRef(goTo)

  const current = playlist[index]

  /*
   * Whether the pager is still driving itself.
   *
   * One value, because "does the clip loop" and "does the clip advance" are
   * exact complements and were written as two expressions in two places. The
   * day they disagreed a clip would either freeze on its last frame or loop
   * forever while the timer tried to move past it.
   *
   * Never under Reduce Motion: a page sliding away on its own is exactly the
   * motion that setting asks us not to start. The viewer swipes; a clip is its
   * poster until they press Play, then loops. Never while paused (WCAG 2.2.2).
   */
  const autoAdvances = !manual && !reduceMotion && !paused && playlist.length > 1
  const autoAdvancesRef = useRef(autoAdvances)

  // The three refs above, refreshed on every commit rather than during render.
  // A layout effect runs before any timer or player event can read them.
  useLayoutEffect(() => {
    indexRef.current = index
    goToRef.current = goTo
    autoAdvancesRef.current = autoAdvances
  })

  // Defined once. See the note at its use site for why the identity matters.
  const onClipEnded = useCallback((from: number) => {
    if (!autoAdvancesRef.current) return
    goToRef.current(from + 1)
  }, [])

  useEffect(() => {
    if (!autoAdvances) return
    // Guarded on `image` rather than cancelled inside the video branch: a timer
    // that exists and is cancelled elsewhere is one somebody eventually forgets
    // to cancel. While a clip plays there is simply no interval.
    if (current?.kind !== 'image') return
    const id = setTimeout(() => goToRef.current(indexRef.current + 1), IMAGE_DWELL_MS)
    return () => clearTimeout(id)
  }, [autoAdvances, index, current?.kind])

  const clipInView = current?.kind === 'video'
  useEffect(() => onClipInView?.(clipInView), [clipInView, onClipInView])
  /*
   * A clip mounts (and so plays) unless it is paused before anybody chose to play it: under Reduce Motion the hero is
   * the poster, and the tap still opens the lightbox, whose player has its own controls (FeedMedia's rule).
   */
  const mountClip = !paused || started

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / width)
    if (page !== index) setIndex(page)
  }

  return (
    <View style={{ width, height }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        // The gesture *is* the signal — not the page landing, which also fires
        // for an automatic advance.
        onScrollBeginDrag={() => setManual(true)}
        onMomentumScrollEnd={onMomentumEnd}
        scrollEventThrottle={16}
      >
        {playlist.map((item, i) => (
          <Pressable
            key={`${item.url}-${i}`}
            style={{ width, height }}
            onPress={() => onPress?.(i)}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Open media ${i + 1} of ${playlist.length}`}
          >
            {/*
              The poster is painted for every page, and the player mounts over
              the visible one. So a clip that is buffering shows the organiser's
              own frame rather than black, and off-screen pages cost an image
              each instead of a decoder each.

              `transition={0}`, deliberately. A cross-fade here fought the
              pager: the slide *is* the transition, and fading a new image in on
              top of it showed two pictures at once for 200ms. With
              `recyclingKey` as well, so `expo-image` cannot hand this page a
              recycled view still holding the previous page's picture and then
              dissolve out of it — which is the other half of the same flash.
            */}
            <Image
              source={{ uri: item.kind === 'image' ? item.url : item.posterUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={item.kind === 'image' ? item.url : item.posterUrl}
              transition={0}
            />
            {/*
              Mounted only while it is the page in view — the Pulse's rule.

              This kept the clip mounted for the neighbours too, so its source
              was open and buffered before anyone swiped. That preload cost a
              correctness bug it took three attempts to kill: a mounted player
              that has played to its end sits on its final frame, and every
              signal available for resetting it was unreliable. `active` was
              `i === index || i === settled`, which on a TWO-item playlist never
              went false — moving to page 1 left `settled` lagging at 0, so
              `i === settled` held. Keying on `isCurrent` instead fixed some
              returns and not others.

              `FeedVideo` never had any of this, and the reason is structural
              rather than clever: **mount means play**. An inactive card
              unmounts, and the next mount is a new `useVideoPlayer` at zero.
              There is no state to reset because there is no surviving player.

              So the hero adopts the same rule. The cost is that a clip starts
              buffering on arrival rather than one page early; the gain is that
              "it plays" stops depending on a prop transition that a two-item
              playlist never performs.
            */}
            {item.kind === 'video' && i === index && mountClip ? (
              <HeroVideo
                key={`${item.url}-${i}`}
                source={item.url}
                paused={paused}
                /*
                 * Loops exactly when nothing is going to advance past it.
                 *
                 * `FeedVideo` derives this as `!onEnded`, and once `onEnded`
                 * became a stable always-defined function that derivation was
                 * permanently false — so after a manual swipe the clip played
                 * once and froze on its last frame, advancing nowhere and
                 * looping never.
                 */
                loop={!autoAdvances}
                /*
                 * A stable function, always — never `undefined`.
                 *
                 * This used to flip to `undefined` the moment `manual` became
                 * true, which is the first frame of a drag: the prop changed,
                 * `FeedVideo` re-rendered, the player remounted, and the
                 * ScrollView's content changed underneath a gesture that was
                 * still in progress. The swipe was being cancelled by the swipe
                 * itself. Reading `manual` from a ref inside keeps the
                 * identity constant across that re-render.
                 */
                onEnded={() => onClipEnded(i)}
                /*
                 * A failed clip advances like a finished one — the *only*
                 * difference is that `autoAdvances` is ignored. Someone who has
                 * taken manual control still should not be parked on a page
                 * that will never render anything.
                 */
                onFailed={() => goToRef.current(i + 1)}
              />
            ) : null}
          </Pressable>
        ))}
      </ScrollView>

      {playlist.length > 1 ? (
        <View
          testID="scene-hero-dots"
          style={[styles.dots, { backgroundColor: reduceTransparency ? MATERIAL.scrimPillReduceTransparency : MATERIAL.scrimPill }]}
          pointerEvents="none"
        >
          {playlist.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  )
}

/** The empty band under the hero's caption: the pager dots live in it, so no title length can reach them. */
export const HERO_CAPTION_FOOT = SPACE.xxl + SPACE.sm

const styles = StyleSheet.create({
  /*
   * The image's bottom-right corner, in the band under the caption (`HERO_CAPTION_FOOT`): a fixed height above the
   * bottom landed on the words whenever the title took two lines or the pills wrapped.
   */
  /*
   * On the scrim pill (`MATERIAL.scrimPill`, as the image viewer's foot): the dots were faint over a bright photo (RC drive 2,
   * LOW). Offset by its padding, so the dots themselves sit where they did, in the band under the caption.
   */
  dots: {
    position: 'absolute',
    bottom: SPACE.lg - SPACE.xs,
    right: SPACE.gutter - SPACE.sm,
    flexDirection: 'row',
    gap: SPACE.sm,
    paddingVertical: SPACE.xs,
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS.capsule,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: RADIUS.capsule,
    backgroundColor: tint(COLOR.textPrimary, 0.4),
  },
  dotActive: { backgroundColor: COLOR.textPrimary, width: 18 },
})

/**
 * A clip in the hero.
 *
 * Separate from `FeedVideo`, which infers looping from whether a callback was
 * passed. A hero clip has to loop or advance depending on whether the viewer
 * has taken over. Mount means play, as in the feed.
 *
 * Muted, like the feed. Sound belongs in the lightbox, where opening it is a
 * deliberate act.
 */
function HeroVideo({
  source,
  paused,
  loop,
  onEnded,
  onFailed,
}: {
  source: string
  /** Holds the frame it is on; Play carries on from there. */
  paused: boolean
  loop: boolean
  onEnded: () => void
  /**
   * The clip will not play. Treated exactly like reaching the end, so the pager
   * moves on and the rest of the organiser's media is still seen.
   */
  onFailed: () => void
}) {
  const player = useVideoPlayer(source, (p) => {
    p.muted = true
  })

  // `loop` can change after construction — a manual swipe flips it — so it is
  // assigned on every change rather than only in the setup callback.
  useEffect(() => {
    // `player` is expo-video's native object,
    // not React state, and a property write is its only API for `loop`.
    // Recreating the player would restart the clip.
    // eslint-disable-next-line react-hooks/immutability
    player.loop = loop
  }, [player, loop])

  useEffect(() => {
    /*
     * Mounted only while it is the page in view, so arriving on it constructs
     * a new player at zero -- there is nothing to reset and no `replay()` call.
     */
    if (paused) player.pause()
    else player.play()
  }, [player, paused])

  const endedRef = useRef(onEnded)
  const failedRef = useRef(onFailed)
  useLayoutEffect(() => {
    endedRef.current = onEnded
    failedRef.current = onFailed
  })

  useEffect(() => {
    // `playToEnd` rather than polling: the player already knows, and a poll has
    // to pick an interval that is wrong either way.
    const sub = player.addListener('playToEnd', () => endedRef.current())
    return () => sub.remove()
  }, [player])

  /*
   * Two ways a clip fails, and they need different detection.
   *
   * The player *reports* one of them: a 404, a codec it cannot open, a host that
   * refuses. `statusChange` carries that as `error`.
   *
   * The other is silence — a socket that opens and never delivers, or a
   * redirect to something that is not a video. Nothing errors and nothing
   * plays, so only a clock notices. The timer is armed on mount and disarmed
   * the moment the player says it is ready.
   */
  useEffect(() => {
    let settled = false

    const give_up = () => {
      if (settled) return
      settled = true
      failedRef.current()
    }

    const timer = setTimeout(give_up, CLIP_READY_TIMEOUT_MS)
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') give_up()
      // Ready means it will either play to its end or loop; either way the
      // watchdog has done its job and must not fire mid-playback.
      if (status === 'readyToPlay') {
        settled = true
        clearTimeout(timer)
      }
    })

    return () => {
      clearTimeout(timer)
      sub.remove()
    }
  }, [player])

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
      allowsPictureInPicture={false}
      accessible={false}
    />
  )
}
