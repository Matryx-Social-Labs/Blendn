import { Image } from 'expo-image'
import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import Animated from 'react-native-reanimated'

import { COLOR, RADIUS } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { tint } from '../../lib/theme'

/** A still stays this long before the pager moves on by itself (the Scene's dwell). */
export const HERO_DWELL_MS = 4000
/** Flow 6 `friend`: the pips are 6 pt, the page's own 16 pt long, 6 pt apart. */
const PIP = 6
const PIP_LONG = 16
const PIP_DIM = 0.35

/** The next page, wrapping: the hero is a loop until the person takes it over. */
export const nextPage = (page: number, count: number) => (count ? (page + 1) % count : 0)

/** Flow 6 `friend` pips: the current page long and white, the rest 35%. Decorative: the pager's own labels say where you are. */
export function HeroPips({ count, page, top }: { count: number; page: number; top: number }) {
  if (count < 2) return null
  return (
    <View testID="hero-pips" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.pips, { top }]}>
      {Array.from({ length: count }, (_, i) => (
        <Animated.View
          key={i}
          style={[
            styles.pip,
            i === page ? styles.pipOn : styles.pipOff,
            { transitionProperty: ['width', 'backgroundColor'], transitionDuration: 160 },
          ]}
        />
      ))}
    </View>
  )
}

/**
 * The hero's photos (Flow 6 `friend` and `user`): a horizontal pager of stills, advancing by itself until the first swipe and then
 * never again for the life of the screen (resuming moves the picture you are looking at). Never on its own under Reduce Motion.
 * A tap on a page opens the viewer at that photo.
 */
export function ProfileHeroPager({
  photos,
  width,
  height,
  onPage,
  onPress,
}: {
  photos: string[]
  width: number
  height: number
  onPage?: (page: number) => void
  onPress?: (index: number) => void
}) {
  const reduceMotion = useReducedMotion()
  const scroll = useRef<ScrollView>(null)
  const [page, setPage] = useState(0)
  const [manual, setManual] = useState(false)
  const count = photos.length
  const auto = !manual && !reduceMotion && count > 1

  useEffect(() => {
    if (!auto) return
    const id = setTimeout(() => {
      const next = nextPage(page, count)
      scroll.current?.scrollTo({ x: next * width, animated: true })
      setPage(next)
      onPage?.(next)
    }, HERO_DWELL_MS)
    return () => clearTimeout(id)
  }, [auto, page, count, width, onPage])

  const onSettle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width)
    if (next === page) return
    setPage(next)
    onPage?.(next)
  }

  return (
    <View style={{ width, height }}>
      <ScrollView
        ref={scroll}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        // The gesture is the signal, not the page landing (which an automatic advance also does).
        onScrollBeginDrag={() => setManual(true)}
        onMomentumScrollEnd={onSettle}
        scrollEventThrottle={16}
      >
        {photos.map((uri, i) => (
          <Pressable
            key={`${uri}:${i}`}
            testID={`hero-photo-${i}`}
            onPress={() => onPress?.(i)}
            accessibilityRole="imagebutton"
            accessibilityLabel={count > 1 ? `Photo ${i + 1} of ${count}` : 'Photo'}
            accessibilityHint="Opens the photo"
            style={{ width, height }}
          >
            <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" recyclingKey={uri} transition={0} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  pips: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: PIP },
  pip: { height: PIP, borderRadius: RADIUS.capsule },
  pipOn: { width: PIP_LONG, backgroundColor: COLOR.textPrimary },
  pipOff: { width: PIP, backgroundColor: tint(COLOR.textPrimary, PIP_DIM) },
})

