/**
 * A city skyline that lives: clouds drift, a metro crosses, the lights come on.
 *
 * ## How a scene is built
 *
 * A scene is a stack of layers in a 400 × 260 drawing (`SCENE_W` × `SCENE_H`).
 * A **still** layer is an `Svg` the size of the whole drawing. A **moving**
 * layer is a small `Svg` cut to the bounds of the one thing that moves (`box`),
 * inside an `Animated.View` whose transform Reanimated drives on the UI thread.
 *
 * Why not animate inside one `Svg`: the reliable fast path in react-native-svg
 * is a view transform. Animating props on SVG nodes re-renders the native
 * drawing every frame; moving a view that already holds its drawing is what the
 * compositor is for. It is also why a moving layer is cut to its own box — an
 * `Svg` clips at its viewport, so an auto-rickshaw drawn on a full-width canvas
 * would vanish the moment its view slid left.
 *
 * ## Motion
 *
 * Every loop is one shared value running 0 → 1 forever, offset by `phase`. The
 * phase is what makes the scene complete when nothing moves: with Reduce Motion
 * on, the loops never start and each piece sits where its phase puts it — the
 * metro mid-crossing, the auto in front of the park — rather than every piece
 * parked at its start, off-canvas.
 *
 * `linear` interpolates through keyframes (crossings, drifts, petals).
 * `wave` swings between two values and back on a cosine (sway, flap, twinkle).
 */
import React, { useEffect, useMemo, useState, type ReactNode } from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import Svg from 'react-native-svg'
import {
  SCENE_PALETTES,
  cityArtInfo,
  timeOfDay,
  type CityArtKey,
  type ScenePalette,
  type TimeOfDay,
} from '../../lib/cityArt'
import { buildScene } from './scenes'

export const SCENE_W = 400
export const SCENE_H = 260

type Track = readonly number[]

export type Motion =
  | {
      kind: 'linear'
      duration: number
      phase?: number
      times: Track
      x?: Track
      y?: Track
      rotate?: Track
      opacity?: Track
    }
  | {
      kind: 'wave'
      duration: number
      phase?: number
      x?: readonly [number, number]
      y?: readonly [number, number]
      rotate?: readonly [number, number]
      scaleY?: readonly [number, number]
      opacity?: readonly [number, number]
    }

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export type Layer =
  | { key: string; draw: ReactNode }
  | {
      key: string
      box: Box
      motion: Motion
      /** Pivot for rotation and scale. Trees and boats swing from their base. */
      origin?: 'center' | 'bottom'
      /** A second loop inside the first: a bird flaps while it glides. */
      inner?: Motion
      draw: ReactNode
    }

/** The light for a city, rechecked each minute so a scene left open changes with the evening. */
export function useSceneTime(timeZone: string, override?: TimeOfDay): TimeOfDay {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (override) return
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [override])
  return override ?? timeOfDay(new Date(now), timeZone)
}

function MotionView({
  motion,
  scale,
  origin,
  still,
  style,
  children,
}: {
  motion: Motion
  scale: number
  origin: 'center' | 'bottom'
  still: boolean
  style?: ViewStyle
  children: ReactNode
}) {
  const progress = useSharedValue(0)

  useEffect(() => {
    if (still) {
      progress.value = 0
      return
    }
    progress.value = withRepeat(
      withTiming(1, { duration: motion.duration, easing: Easing.linear }),
      -1,
      false,
    )
    return () => cancelAnimation(progress)
  }, [still, motion.duration, progress])

  const animated = useAnimatedStyle(() => {
    const q = (progress.value + (motion.phase ?? 0)) % 1
    const at = (track: readonly number[]) => {
      if (motion.kind === 'linear') return interpolate(q, motion.times as number[], track as number[])
      return track[0] + (track[1] - track[0]) * (0.5 - 0.5 * Math.cos(2 * Math.PI * q))
    }
    const transform: ({ translateX: number } | { translateY: number } | { rotate: string } | { scaleY: number })[] = []
    if (motion.x) transform.push({ translateX: at(motion.x) * scale })
    if (motion.y) transform.push({ translateY: at(motion.y) * scale })
    if (motion.rotate) transform.push({ rotate: `${at(motion.rotate)}deg` })
    if (motion.kind === 'wave' && motion.scaleY) transform.push({ scaleY: at(motion.scaleY) })
    return {
      transform,
      opacity: motion.opacity ? at(motion.opacity) : 1,
    }
  })

  return (
    <Animated.View style={[style, { transformOrigin: origin }, animated]}>
      {children}
    </Animated.View>
  )
}

interface Props {
  city: CityArtKey
  width: number
  height: number
  /**
   * `meet` shows the whole drawing. `slice` fills the frame and crops, keeping
   * the ground: a short banner loses sky, never the street.
   */
  fit?: 'meet' | 'slice'
  /** Pin the light, for previews and tests. Omitted, it follows the city's clock. */
  tod?: TimeOfDay
}

export function CityScene({ city, width, height, fit = 'meet', tod: override }: Props) {
  const tod = useSceneTime(cityArtInfo(city).timeZone, override)
  const reduceMotion = useReducedMotion()
  const layers = useMemo(() => buildScene(city, SCENE_PALETTES[tod]), [city, tod])

  if (width <= 0 || height <= 0) return <View style={{ width, height }} />

  const scale = fit === 'meet'
    ? Math.min(width / SCENE_W, height / SCENE_H)
    : Math.max(width / SCENE_W, height / SCENE_H)
  const offsetX = (width - SCENE_W * scale) / 2
  const offsetY = fit === 'meet' ? (height - SCENE_H * scale) / 2 : height - SCENE_H * scale

  return (
    <View
      style={[styles.frame, { width, height }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <View
        style={[
          styles.canvas,
          { left: offsetX, top: offsetY, width: SCENE_W * scale, height: SCENE_H * scale },
        ]}
      >
        {layers.map((layer) => {
          if (!('box' in layer)) {
            return (
              <Svg
                key={layer.key}
                style={StyleSheet.absoluteFill}
                width={SCENE_W * scale}
                height={SCENE_H * scale}
                viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}
              >
                {layer.draw}
              </Svg>
            )
          }
          const { box } = layer
          const place: ViewStyle = {
            position: 'absolute',
            left: box.x * scale,
            top: box.y * scale,
            width: box.w * scale,
            height: box.h * scale,
          }
          const svg = (
            <Svg width={box.w * scale} height={box.h * scale} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}>
              {layer.draw}
            </Svg>
          )
          return (
            <MotionView
              key={layer.key}
              motion={layer.motion}
              scale={scale}
              origin={layer.origin ?? 'center'}
              still={reduceMotion}
              style={place}
            >
              {layer.inner ? (
                <MotionView motion={layer.inner} scale={scale} origin="center" still={reduceMotion}>
                  {svg}
                </MotionView>
              ) : (
                svg
              )}
            </MotionView>
          )
        })}
      </View>
    </View>
  )
}

export type { ScenePalette }

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
  canvas: { position: 'absolute', overflow: 'hidden' },
})
