import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { Easing, FadeIn, ReduceMotion } from 'react-native-reanimated'

import type { FeedMediaItem } from '../../lib/feedMedia'
import { MOTION_DURATION, MOTION_EASING } from '../../lib/motion'
import { useLatest } from '../../lib/useLatest'
import { OptimizedImage } from '../OptimizedImage'
import { FeedVideo } from './FeedVideo'

/**
 * How long a still holds before the card moves on.
 *
 * Four seconds is long enough to take a photograph in and short enough that a
 * three-image event does not feel like a slideshow you are trapped in. It is
 * deliberately *not* matched to the clip length: a video ends when it ends.
 */
const IMAGE_DWELL_MS = 4000

/*
 * Each item dissolves in over the one before it rather than cutting.
 *
 * A cut every four seconds on the largest photo on screen reads as a glitch;
 * a dissolve reads as a slideshow. 320ms on the entrance curve: slow enough to
 * register as a crossfade, a small fraction of the dwell. Kept under Reduce
 * Motion — nothing moves, and a fade is gentler than the cut it replaces.
 */
const FRAME_FADE_MS = MOTION_DURATION.slow
const frameIn = FadeIn.duration(FRAME_FADE_MS)
  .easing(Easing.bezier(...MOTION_EASING.entrance))
  .reduceMotion(ReduceMotion.Never)

/**
 * The media on a feed card — one still, or the whole set on a loop.
 *
 * ## Only the active card moves
 *
 * An inactive card draws `playlist[0]` and nothing else: no timer, no player,
 * no state. That is what makes a feed of twenty cards cost one decoder and one
 * interval rather than twenty of each, and it is why `isActive` gates the whole
 * mechanism rather than just the playback.
 *
 * ## A video is never cut off
 *
 * Stills advance on a timer; **clips advance on their own end event**. Handing
 * a video the same fixed dwell would truncate anything longer than it and leave
 * anything shorter frozen on its last frame — and the length is the
 * organiser's, so there is no dwell that is right for all of them.
 *
 * ## The first item stays mounted underneath
 *
 * Whatever is showing, the opening still is painted below it. A clip that
 * stalls, 404s or is slow to decode therefore reveals a photograph rather than
 * a black rectangle, and the transition between items has nothing to flash
 * through. It costs one image and removes every empty state this component
 * could otherwise have.
 */
export function FeedMedia({
  playlist,
  isActive,
  width,
  height,
}: {
  playlist: FeedMediaItem[]
  /** Whether the viewport has settled on this card. */
  isActive: boolean
  width: number
  height: number
}) {
  const [index, setIndex] = useState(0)
  /**
   * The item being dissolved away from, held underneath the new one until its
   * fade has finished. Never more than this one: two frames, then back to one.
   */
  const [under, setUnder] = useState<number | null>(null)

  /*
   * Back to the top whenever the card stops being the active one.
   *
   * Without this a card resumed halfway through its set — so scrolling past and
   * back showed the third image with no explanation, and the cover the
   * organiser chose was skipped for everybody except a first-time viewer.
   *
   * Reset during render rather than in an effect: nothing past this point draws
   * `index` while inactive, so the result is the same, one commit sooner.
   */
  if (!isActive && index !== 0) setIndex(0)
  if (!isActive && under !== null) setUnder(null)

  const current = playlist[Math.min(index, Math.max(playlist.length - 1, 0))]
  const playlistLength = playlist.length
  // Read, not rendered: a caller may build the array inline, and `advance`
  // changing identity would restart the dwell timer on every parent render.
  const latestPlaylist = useLatest(playlist)
  const advance = useCallback(() => {
    const next = (index + 1) % Math.max(playlistLength, 1)
    /*
     * A clip is not held under a clip: that would be two decoders at once, and
     * the incoming one is transparent until its first frame, so there would be
     * nothing to dissolve anyway.
     */
    const items = latestPlaylist.current
    const bothClips = items[index]?.kind === 'video' && items[next]?.kind === 'video'
    setUnder(bothClips ? null : index)
    setIndex(next)
  }, [index, latestPlaylist, playlistLength])

  // Drops the frame underneath once the one on top is opaque.
  useEffect(() => {
    if (under === null) return
    const id = setTimeout(() => setUnder(null), FRAME_FADE_MS)
    return () => clearTimeout(id)
  }, [under, index])

  /*
   * The still timer, and nothing else.
   *
   * Guarded on `kind === 'image'` rather than cleared inside the video branch,
   * because a timer that exists and is cancelled elsewhere is a timer somebody
   * will eventually forget to cancel. There is simply no interval while a clip
   * is playing.
   */
  useEffect(() => {
    if (!isActive || playlist.length < 2) return
    if (current?.kind !== 'image') return
    const id = setTimeout(advance, IMAGE_DWELL_MS)
    return () => clearTimeout(id)
  }, [isActive, index, current?.kind, playlist.length, advance])

  const opener = playlist[0]

  function renderFrame(i: number, onTop: boolean) {
    const item = playlist[i]
    if (!item) return null
    return (
      <Animated.View key={`frame-${i}`} entering={frameIn} style={StyleSheet.absoluteFill}>
        {item.kind === 'image' ? (
          <OptimizedImage
            source={item.url}
            style={StyleSheet.absoluteFill as never}
            width={Math.round(width)}
            height={Math.round(height)}
            contentFit="cover"
            // Same reason as the opener's key, twice over: as well as cards
            // recycling, this card walks its own playlist.
            recyclingKey={item.url}
          />
        ) : (
          <FeedVideo
            // Keyed by url **and** index, so a playlist that repeats the same clip
            // gets a fresh player rather than one that has already ended and will
            // never fire again.
            key={`${item.url}-${i}`}
            source={item.url}
            // Only the item on top walks the playlist; the one underneath has
            // already ended and is only there to be dissolved over.
            onEnded={onTop && playlist.length > 1 ? advance : undefined}
          />
        )}
      </Animated.View>
    )
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/*
        The opening still, always mounted. See the note above — it is the floor
        every other item sits on, so nothing can ever paint black.
      */}
      {opener ? (
        <OptimizedImage
          source={opener.kind === 'image' ? opener.url : opener.posterUrl}
          style={StyleSheet.absoluteFill as never}
          width={Math.round(width)}
          height={Math.round(height)}
          contentFit="cover"
          priority="high"
          /*
            The feed is a virtualised list, which is the one place native image
            views are actually recycled. Without a key `expo-image` can hand a
            card a view still holding the *previous* card's photograph, paint
            it for a frame or two and dissolve into the right one — a flicker
            that is worst on the fast scroll a feed invites, and that no
            screenshot catches.
          */
          recyclingKey={opener.kind === 'image' ? opener.url : opener.posterUrl}
        />
      ) : null}

      {/*
        The item underneath, then the one on top. Keyed by position, so the
        frame that was on top becomes the one underneath without remounting —
        no second decode, no flash — and only the newcomer runs `frameIn`.
        The opener needs no layer of its own once it is alone: it is the floor.
        Arriving back at it after a loop does get one, so the last item
        dissolves into it instead of vanishing.
      */}
      {isActive && under !== null ? renderFrame(under, false) : null}
      {isActive && current && (index > 0 || under !== null || current.kind === 'video')
        ? renderFrame(index, true)
        : null}
    </View>
  )
}
