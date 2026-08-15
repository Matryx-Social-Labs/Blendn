import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { StatusBar } from 'expo-status-bar'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native'

import type { FeedMediaItem } from '../../lib/feedMedia'
import { EMBER, EMBER_FONTS } from '../../lib/theme'

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')

/**
 * Full-screen viewer for an event's media — the place a photograph is actually
 * looked at.
 *
 * ## Why this exists beside `PhotoLightbox`
 *
 * `PhotoLightbox` takes `string[]` and renders images. Handing it a clip's URL
 * would draw a still frame at best and a broken image at worst, and widening
 * it would change a component three other screens depend on. This takes the
 * same `FeedMediaItem[]` the hero and the feed already use, so a clip that
 * plays on a card plays here too.
 *
 * ## The hero is a teaser; this is the viewer
 *
 * The hero carries a title, a pill, a meta row and a gradient covering its
 * bottom third — necessary there, and all of it in the way of the photograph.
 * Here there is nothing but the media, which is why both the hero and the
 * gallery rail open *this* rather than trying to make the hero do both jobs.
 *
 * ## One player, always the visible one
 *
 * A clip is mounted only for the page in view. The same single-active-player
 * policy as the feed, for the same reason: a paused player still holds a
 * decoder, and a five-clip event would otherwise allocate five.
 *
 * Sound is **on** and the native controls are shown — the opposite of
 * `FeedVideo`. Opening this is a deliberate act, so playing audio is expected
 * rather than ambush, and someone looking at a clip full screen wants a
 * scrubber.
 */
export function SceneLightbox({
  items,
  initialIndex = 0,
  visible,
  onClose,
}: {
  items: FeedMediaItem[]
  initialIndex?: number
  visible: boolean
  onClose: () => void
}) {
  const [index, setIndex] = useState(initialIndex)
  const listRef = useRef<FlatList<FeedMediaItem>>(null)

  const onShow = useCallback(() => {
    setIndex(initialIndex)
    // After the list has laid out. `initialScrollIndex` alone is unreliable
    // when the modal mounts and measures in the same frame.
    setTimeout(() => {
      listRef.current?.scrollToIndex({ index: initialIndex, animated: false })
    }, 50)
  }, [initialIndex])

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]?.index != null) setIndex(viewableItems[0].index)
  }, [])

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current

  const renderItem = useCallback(
    ({ item, index: i }: { item: FeedMediaItem; index: number }) => (
      <View style={styles.page}>
        {item.kind === 'video' ? (
          <LightboxVideo source={item.url} poster={item.posterUrl} active={i === index} />
        ) : (
          <Image
            source={{ uri: item.url }}
            style={styles.media}
            // `contain`, not `cover`. This is the one place the whole frame
            // must be visible — every other slot in the app crops.
            contentFit="contain"
            cachePolicy="memory-disk"
          />
        )}
      </View>
    ),
    [index],
  )

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onShow={onShow}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar style="light" />
      <View style={styles.backdrop}>
        <FlatList
          ref={listRef}
          data={items}
          renderItem={renderItem}
          keyExtractor={(item, i) => `${item.url}-${i}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
        />

        {items.length > 1 ? (
          <View style={styles.counter} pointerEvents="none">
            <Text style={styles.counterText}>
              {index + 1} / {items.length}
            </Text>
          </View>
        ) : null}

        <Pressable style={styles.close} onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <View style={styles.closeInner}>
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </View>
        </Pressable>
      </View>
    </Modal>
  )
}

/**
 * One clip, mounted only while its page is the visible one.
 *
 * The poster is painted underneath rather than behind a spinner, so a clip
 * that is still buffering shows the organiser's own frame instead of black —
 * the same rule `FeedVideo` follows, and the reason `feedPlaylist` refuses to
 * emit a clip it cannot poster.
 */
function LightboxVideo({
  source,
  poster,
  active,
}: {
  source: string
  poster: string
  active: boolean
}) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = true
    p.muted = false
  })

  /*
   * The poster is removed once the player has a frame to show.
   *
   * Both it and the video use `contentFit="contain"`, and they rarely share an
   * aspect: a 16:9 clip letterboxes into a band while a 2:3 poster fills nearly
   * the whole screen, so the poster stayed visible *around* the playing video
   * and read as a background it could not shake off. It is a loading state, and
   * a loading state that outlives the load is just clutter.
   */
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status }) => {
      setReady(status === 'readyToPlay')
    })
    return () => sub.remove()
  }, [player])

  /*
   * Play and pause follow visibility rather than mount, so swiping away stops
   * the audio immediately instead of when the row is finally recycled.
   *
   * In an effect, not in the render body: calling `play()` while rendering is a
   * side effect during render, and with audio it is one you *hear* — React may
   * render a component more than once for a single commit, and each of those
   * would poke the player.
   */
  useEffect(() => {
    if (active) player.play()
    else player.pause()
  }, [active, player])

  return (
    <View style={styles.media}>
      {!ready || !active ? (
        <Image
          source={{ uri: poster }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          cachePolicy="memory-disk"
        />
      ) : null}
      {active ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          nativeControls
          allowsFullscreen={false}
          allowsPictureInPicture={false}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000' },
  page: { width: SCREEN_W, height: SCREEN_H, alignItems: 'center', justifyContent: 'center' },
  media: { width: SCREEN_W, height: SCREEN_H },
  close: { position: 'absolute', top: 56, right: 20, zIndex: 10 },
  closeInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  counterText: {
    fontFamily: EMBER_FONTS.bodyBold,
    color: EMBER.textPrimary,
    fontSize: 14,
  },
})
