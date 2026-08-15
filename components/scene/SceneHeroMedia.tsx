import { Image } from 'expo-image'
import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native'

import type { FeedMediaItem } from '../../lib/feedMedia'
import { EMBER } from '../../lib/theme'
import { useVideoPlayer, VideoView } from 'expo-video'

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
 * the ceiling `docs/MEDIA.md` sets.
 */
const CLIP_READY_TIMEOUT_MS = 15_000

export function SceneHeroMedia({
  playlist,
  width,
  height,
  onPress,
}: {
  playlist: FeedMediaItem[]
  width: number
  height: number
  /** Opens the lightbox at the item currently shown. */
  onPress?: (index: number) => void
}) {
  const [index, setIndex] = useState(0)
  /*
   * Where the pager has actually *come to rest*, which lags `index`.
   *
   * `index` changes the instant an advance starts, because the dots have to
   * follow the gesture. Tearing the video down on that same tick unmounted it
   * at the *beginning* of a ~300ms slide, so the poster underneath was revealed
   * and slid across — an image appearing from nowhere just as the clip ended.
   * The player stays up until the scroll has settled somewhere else.
   */
  const [settled, setSettled] = useState(0)
  const [manual, setManual] = useState(false)
  const scrollRef = useRef<ScrollView>(null)

  // `index` in a ref as well, so the timer can read the current page without
  // being torn down and rebuilt every time the page changes.
  const indexRef = useRef(0)
  indexRef.current = index

  const goTo = (next: number) => {
    const wrapped = ((next % playlist.length) + playlist.length) % playlist.length
    scrollRef.current?.scrollTo({ x: wrapped * width, animated: true })
    setIndex(wrapped)
    /*
     * `onMomentumScrollEnd` does not fire reliably for a programmatic
     * `scrollTo` on iOS, so a settled state that waited only for it would
     * strand the outgoing video mounted forever. 400ms comfortably outlasts
     * the paging animation.
     */
    setTimeout(() => setSettled(wrapped), 400)
  }
  const goToRef = useRef(goTo)
  goToRef.current = goTo

  const current = playlist[index]

  // Defined once. See the note at its use site for why the identity matters.
  /*
   * Whether the pager is still driving itself.
   *
   * One value, because "does the clip loop" and "does the clip advance" are
   * exact complements and were written as two expressions in two places. The
   * day they disagreed a clip would either freeze on its last frame or loop
   * forever while the timer tried to move past it.
   */
  const autoAdvances = !manual && playlist.length > 1
  const autoAdvancesRef = useRef(autoAdvances)
  autoAdvancesRef.current = autoAdvances

  const onClipEnded = useRef((from: number) => {
    if (!autoAdvancesRef.current) return
    goToRef.current(from + 1)
  }).current

  useEffect(() => {
    if (manual || playlist.length < 2) return
    // Guarded on `image` rather than cancelled inside the video branch: a timer
    // that exists and is cancelled elsewhere is one somebody eventually forgets
    // to cancel. While a clip plays there is simply no interval.
    if (current?.kind !== 'image') return
    const id = setTimeout(() => goToRef.current(indexRef.current + 1), IMAGE_DWELL_MS)
    return () => clearTimeout(id)
  }, [manual, index, current?.kind, playlist.length])

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / width)
    if (page !== index) setIndex(page)
    setSettled(page)
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
              Mounted for the neighbours too, and playing only when active.

              It used to mount on arrival, so opening the source, buffering and
              the first frame *all* began the moment the page landed — and the
              poster sat there for the whole of it. On a clip of any size that
              is a visible wait at exactly the moment someone has just asked to
              see it.

              A window of one page either side means the load has already
              happened by the time you get there. It costs at most one extra
              decoder — bounded, unlike a feed, because a hero has one playlist
              and the window is fixed.
            */}
            {item.kind === 'video' && Math.abs(i - index) <= 1 ? (
              <HeroVideo
                key={`${item.url}-${i}`}
                source={item.url}
                active={i === index || i === settled}
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
        <View style={styles.dots} pointerEvents="none">
          {playlist.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  /*
   * Above the gradient's foot but clear of the title block.
   *
   * The hero's caption sits at 32pt from the bottom and is roughly 150 tall, so
   * the dots go above it rather than beside it — overlapping a 48pt title with
   * page indicators is how you get a carousel that looks like a bug.
   */
  dots: {
    position: 'absolute',
    top: 24,
    right: 24,
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: { backgroundColor: EMBER.accent, width: 18 },
})

/**
 * A clip in the hero.
 *
 * Separate from `FeedVideo`, which encodes the *feed's* policy: mount means
 * play, and looping is inferred from whether a callback was passed. A hero
 * page has to be mounted while it is merely *next* — so that arriving on it is
 * instant — which makes "mounted" and "playing" two different states, and it
 * has to loop or advance depending on whether the viewer has taken over.
 *
 * Muted, like the feed. Sound belongs in the lightbox, where opening it is a
 * deliberate act.
 */
function HeroVideo({
  source,
  active,
  loop,
  onEnded,
  onFailed,
}: {
  source: string
  /** Whether this is the page in view. Mounted-but-inactive pages preload. */
  active: boolean
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
    player.loop = loop
  }, [player, loop])

  useEffect(() => {
    /*
     * Playing follows visibility, not mounting.
     *
     * The neighbour is mounted so its source is open and buffered before
     * anyone swipes to it; playing it there would burn battery on something
     * nobody is looking at, and it would arrive already part-way through.
     */
    if (active) player.play()
    else player.pause()
  }, [active, player])

  const endedRef = useRef(onEnded)
  endedRef.current = onEnded
  const failedRef = useRef(onFailed)
  failedRef.current = onFailed

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
   * plays, so only a clock notices. The timer is armed while this page is
   * active and disarmed the moment the player says it is ready.
   */
  useEffect(() => {
    if (!active) return
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
  }, [active, player])

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
      allowsFullscreen={false}
      allowsPictureInPicture={false}
      accessible={false}
    />
  )
}
