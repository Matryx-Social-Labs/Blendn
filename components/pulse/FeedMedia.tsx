import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import type { FeedMediaItem } from '../../lib/feedMedia'
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

  /*
   * Back to the top whenever the card stops being the active one.
   *
   * Without this a card resumed halfway through its set — so scrolling past and
   * back showed the third image with no explanation, and the cover the
   * organiser chose was skipped for everybody except a first-time viewer.
   */
  useEffect(() => {
    if (!isActive) setIndex(0)
  }, [isActive])

  const current = playlist[Math.min(index, Math.max(playlist.length - 1, 0))]
  const advance = useRef(() => {})
  advance.current = () => setIndex((i) => (i + 1) % Math.max(playlist.length, 1))

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
    const id = setTimeout(() => advance.current(), IMAGE_DWELL_MS)
    return () => clearTimeout(id)
  }, [isActive, index, current?.kind, playlist.length])

  const opener = playlist[0]

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

      {isActive && current && index > 0 && current.kind === 'image' ? (
        <OptimizedImage
          source={current.url}
          style={StyleSheet.absoluteFill as never}
          width={Math.round(width)}
          height={Math.round(height)}
          contentFit="cover"
          // Same reason, and it matters twice over here: this view is reused
          // as the card walks its own playlist, not only as cards recycle.
          recyclingKey={current.url}
        />
      ) : null}

      {isActive && current?.kind === 'video' ? (
        <FeedVideo
          // Keyed by url **and** index, so a playlist that repeats the same clip
          // gets a fresh player rather than one that has already ended and will
          // never fire again.
          key={`${current.url}-${index}`}
          source={current.url}
          onEnded={playlist.length > 1 ? () => advance.current() : undefined}
        />
      ) : null}
    </View>
  )
}
