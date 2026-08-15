import { Image } from 'expo-image'
import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native'

import type { FeedMediaItem } from '../../lib/feedMedia'
import { EMBER } from '../../lib/theme'
import { FeedVideo } from '../pulse/FeedVideo'

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
  }
  const goToRef = useRef(goTo)
  goToRef.current = goTo

  const current = playlist[index]

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
              The poster is painted for every page, and the player mounts only
              over the visible one. So a clip that is buffering shows the
              organiser's own frame rather than black, and four off-screen pages
              cost four images instead of four decoders.
            */}
            <Image
              source={{ uri: item.kind === 'image' ? item.url : item.posterUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
            />
            {item.kind === 'video' && i === index ? (
              <FeedVideo
                // Keyed by index too, so a playlist repeating the same clip gets
                // a fresh player rather than one that has already ended.
                key={`${item.url}-${i}-active`}
                source={item.url}
                onEnded={!manual && playlist.length > 1 ? () => goToRef.current(i + 1) : undefined}
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
