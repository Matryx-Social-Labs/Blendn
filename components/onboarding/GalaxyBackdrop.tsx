import {
  AlphaType,
  Atlas,
  Blur,
  Canvas,
  ColorType,
  Fill,
  Group,
  LinearGradient,
  Paint,
  RadialGradient,
  Rect,
  Skia,
  useRSXformBuffer,
  vec,
  type SkColor,
  type SkImage,
} from '@shopify/react-native-skia'
import * as Device from 'expo-device'
import { useEffect, useMemo, useState } from 'react'
import { AppState, Platform, StyleSheet, View, useWindowDimensions } from 'react-native'
import { cancelAnimation, Easing, useDerivedValue, useFrameCallback, useSharedValue, withTiming } from 'react-native-reanimated'
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets'

import REMNANT from '../../assets/galaxy/remnant.json'
import { COLOR } from '../../lib/design/tokens'
import { advanceFilm, GALAXY_B, init, orbitSense, startFilm, viewX, viewY, type Film } from '../../lib/galaxySim'
import { useReducedMotion } from '../../lib/motion'
import { tint } from '../../lib/theme'

/*
 * Flow 1b (owner's pick, variant B, 2026-11-02): two galaxies collide once under real gravity behind the landing, and
 * the screens after it show what they left. The physics is lib/galaxySim.ts; this draws it with Skia, every star one
 * sprite of an Atlas, added onto ink so ember over violet mixes to rose.
 * Prototype, films and contrast: mockups/redesign-2026-11/galaxies/ (README).
 */

/** The prototype's frame: the centre of mass at (195, 180) on 390 × 844, just above the lockup at 27%, so it lights it from behind. */
const DESIGN = { width: 390, height: 844, cy: 180 }
/** The sky fades to ink between these fractions of the height: the collision stays in the top half, the Dock on ink. */
const FADE = { from: 0.58, to: 0.7 }
/** The tagline's shelf (README, Contrast): ink at 0.94 under the line, so the worst single pixel behind it clears 4.5:1
 * (0.9 left one star's centre at 4.2:1). Solid to 0.8 of the ellipse and 56 pt past the words: at the prototype's 0.6
 * and 44 the line's ends sat where the ink thins, and an Android drive put a star there at 3.75:1. */
const SHELF = { alpha: 0.94, solid: 0.8, padX: 56, padY: 22 }
/** The bloom: the stars again, blurred and added at 0.55, which gives the dense knots their light. */
const BLOOM = { alpha: 0.55, blur: 6 }

const SPRITE = 64
const HALF = SPRITE / 2
/** Each star's sprite spans three times its nominal size (the prototype's radial sprite). */
const SPRITE_SPAN = 3
/** Alpha from the centre (0) to the edge (1) of a star's sprite and a core's. */
const STAR_STOPS = [[0, 1], [0.3, 0.45], [1, 0]] as const
const CORE_STOPS = [[0, 1], [0.12, 0.55], [1, 0]] as const
// design-exception: the cores' warm white is the prototype's (#FFE9D8), a light, not a surface or text colour
const CORE_WHITE = '#FFE9D8'
/** Each core: a 40 pt halo at 0.45 and a 7 pt light at full. */
const CORE_LIGHTS = [{ size: 40, alpha: 0.45 }, { size: 7, alpha: 1 }] as const
/** Where a star is before the first frame: off the canvas. */
const OFF = -SPRITE
const COS_TILT = Math.cos(GALAXY_B.look.tilt)
const SIN_TILT = Math.sin(GALAXY_B.look.tilt)

/** The form screens' remnant turns this far, slowing to still: the landing's turn carried on, then rest. Never a loop. */
const REMNANT_TURN = { degrees: 8, ms: 12000 }

/** A phone this short of memory runs half the stars and no bloom. Android only; every supported iPhone has the headroom. */
const LOW_END_MEMORY = 3 * 1024 ** 3
const FRAME_MS = 1000 / 60

export type Shelf = { x: number; y: number; width: number; height: number }
type SkyFrame = { width: number; height: number; cx: number; cy: number; k: number }

function useSkyFrame(): SkyFrame {
  const { width, height } = useWindowDimensions()
  return useMemo(
    () => ({ width, height, cx: width / 2, cy: (height * DESIGN.cy) / DESIGN.height, k: (GALAXY_B.look.scale * width) / DESIGN.width }),
    [width, height]
  )
}

function useAppActive(): boolean {
  const [active, setActive] = useState(() => AppState.currentState !== 'background')
  useEffect(() => {
    const sub = AppState.addEventListener('change', (status) => setActive(status === 'active'))
    return () => sub.remove()
  }, [])
  return active
}

function isLowEnd(): boolean {
  return Platform.OS === 'android' && (Device.totalMemory ?? Infinity) < LOW_END_MEMORY
}

type Stops = readonly (readonly [number, number])[]

/** Alpha at `d` of the radius, straight between the stops either side of it. */
function alphaAt(stops: Stops, d: number): number {
  for (let k = 1; k < stops.length; k++) {
    const [at, alpha] = stops[k]
    if (d > at) continue
    const [from, start] = stops[k - 1]
    return start + ((alpha - start) * (d - from)) / (at - from)
  }
  return 0
}

/** A soft round sprite, white and premultiplied, its alpha falling through `stops`; the Atlas tints it per star. */
function spriteImage(stops: Stops): SkImage | null {
  const bytes = new Uint8Array(SPRITE * SPRITE * 4)
  for (let y = 0; y < SPRITE; y++) {
    for (let x = 0; x < SPRITE; x++) {
      const i = 4 * (y * SPRITE + x)
      bytes.fill(Math.round(alphaAt(stops, Math.hypot(x + 0.5 - HALF, y + 0.5 - HALF) / HALF) * 255), i, i + 4)
    }
  }
  const info = { width: SPRITE, height: SPRITE, alphaType: AlphaType.Premul, colorType: ColorType.RGBA_8888 }
  return Skia.Image.MakeImage(info, Skia.Data.fromBytes(bytes), SPRITE * 4)
}

let sprites: { star: SkImage | null; core: SkImage | null } | null = null
const spriteImages = () => (sprites ??= { star: spriteImage(STAR_STOPS), core: spriteImage(CORE_STOPS) })

const colour = (hex: string, alpha: number): SkColor => {
  const c = Skia.Color(hex)
  c[3] = alpha
  return c
}

/** Each star's sprite scale and colour from its `look` (the prototype's size and alpha ranges), and the way the orbit turns. */
function starLooks(stars: number) {
  const s = init(GALAXY_B.seed, { ...GALAXY_B.physics, stars })
  const [s0, s1] = GALAXY_B.look.size
  const [a0, a1] = GALAXY_B.look.alpha
  const scales: number[] = []
  const colors: SkColor[] = []
  for (let i = 0; i < s.n; i++) {
    const l = s.look[i]
    scales.push(((s0 + (s1 - s0) * l * l) * SPRITE_SPAN) / SPRITE)
    colors.push(colour(i < s.nA ? COLOR.brandOrange : COLOR.brandViolet, a0 + (a1 - a0) * (1 - l)))
  }
  return { scales, colors, spin: orbitSense(s) }
}

const CORE_SCALES = CORE_LIGHTS.flatMap(({ size }) => [size / SPRITE, size / SPRITE])

function Sky({ stars, cores, colors, frame, bloom, shelf, testID }: {
  stars: ReturnType<typeof useRSXformBuffer>
  cores: ReturnType<typeof useRSXformBuffer>
  colors: SkColor[]
  frame: SkyFrame
  bloom: boolean
  shelf?: Shelf | null
  testID: string
}) {
  const images = spriteImages()
  const starRects = useMemo(() => colors.map(() => Skia.XYWHRect(0, 0, SPRITE, SPRITE)), [colors])
  const core = useMemo(
    () => ({ rects: CORE_SCALES.map(() => Skia.XYWHRect(0, 0, SPRITE, SPRITE)), colors: CORE_LIGHTS.flatMap(({ alpha }) => [colour(CORE_WHITE, alpha), colour(CORE_WHITE, alpha)]) }),
    []
  )
  const lights = (
    <>
      <Atlas image={images.star} sprites={starRects} transforms={stars} colors={colors} colorBlendMode="modulate" blendMode="plus" />
      <Atlas image={images.core} sprites={core.rects} transforms={cores} colors={core.colors} colorBlendMode="modulate" blendMode="plus" />
    </>
  )
  const fadeTop = frame.height * FADE.from
  return (
    <Canvas testID={testID} style={StyleSheet.absoluteFill}>
      <Fill color={COLOR.ink} />
      {lights}
      {bloom ? <Group layer={<Paint blendMode="plus" opacity={BLOOM.alpha}><Blur blur={BLOOM.blur} /></Paint>}>{lights}</Group> : null}
      {shelf ? <ShelfBand shelf={shelf} /> : null}
      <Rect x={0} y={fadeTop} width={frame.width} height={frame.height - fadeTop}>
        <LinearGradient start={vec(0, fadeTop)} end={vec(0, frame.height * FADE.to)} colors={[tint(COLOR.ink, 0), COLOR.ink]} />
      </Rect>
    </Canvas>
  )
}

/** An ink ellipse under the tagline, part of the sky: a star crossing behind the words is dimmed to AA. */
function ShelfBand({ shelf }: { shelf: Shelf }) {
  const rx = shelf.width / 2 + SHELF.padX
  const ry = shelf.height / 2 + SHELF.padY
  const ink = tint(COLOR.ink, SHELF.alpha)
  return (
    <Group transform={[{ translateX: shelf.x + shelf.width / 2 }, { translateY: shelf.y + shelf.height / 2 }, { scaleX: rx / ry }]}>
      <Rect x={-ry} y={-ry} width={2 * ry} height={2 * ry}>
        <RadialGradient c={vec(0, 0)} r={ry} colors={[ink, ink, tint(COLOR.ink, 0)]} positions={[0, SHELF.solid, 1]} />
      </Rect>
    </Group>
  )
}

/** The landing: the physics runs from a frame callback, two steps a frame, and the callback stops at the film's end. */
function Collision({ paused, shelf }: { paused: boolean; shelf?: Shelf | null }) {
  const frame = useSkyFrame()
  const [lowEnd] = useState(isLowEnd)
  const count = lowEnd ? GALAXY_B.physics.stars / 2 : GALAXY_B.physics.stars
  const looks = useMemo(() => starLooks(count), [count])
  const { scales } = looks
  const film = useSharedValue<Film | null>(null)
  const tick = useSharedValue(0)
  const [ended, setEnded] = useState(false)
  const active = useAppActive()

  const callback = useFrameCallback((info) => {
    'worklet'
    let f = film.get()
    if (!f) {
      f = startFilm(count)
      film.set(f)
    }
    const done = advanceFilm(f, (info.timeSincePreviousFrame ?? FRAME_MS) / 1000)
    tick.set(f.tau)
    if (done) scheduleOnRN(setEnded, true)
  }, false)
  const running = active && !paused && !ended
  useEffect(() => {
    callback.setActive(running)
  }, [callback, running])

  const stars = useRSXformBuffer(count, (xf, i) => {
    'worklet'
    // Read so this re-runs every frame: the film is mutated in place, which no listener sees.
    tick.get()
    const f = film.get()
    if (!f) return xf.set(0, 0, OFF, OFF)
    const p = f.s.pos
    const j = 3 * i
    const sc = scales[i]
    const x = frame.cx + viewX(p[j], p[j + 1], f.ca, f.sa) * frame.k
    const y = frame.cy + viewY(p[j], p[j + 1], p[j + 2], f.ca, f.sa, COS_TILT, SIN_TILT) * frame.k
    xf.set(sc, 0, x - sc * HALF, y - sc * HALF)
  })
  const cores = useRSXformBuffer(CORE_SCALES.length, (xf, i) => {
    'worklet'
    tick.get()
    const f = film.get()
    if (!f) return xf.set(0, 0, OFF, OFF)
    const c = f.s.core
    const o = (i % 2) * 6
    const sc = CORE_SCALES[i]
    const x = frame.cx + viewX(c[o], c[o + 1], f.ca, f.sa) * frame.k
    const y = frame.cy + viewY(c[o], c[o + 1], c[o + 2], f.ca, f.sa, COS_TILT, SIN_TILT) * frame.k
    xf.set(sc, 0, x - sc * HALF, y - sc * HALF)
  })

  return <Sky testID="galaxy-live" stars={stars} cores={cores} colors={looks.colors} frame={frame} bloom={!lowEnd} shelf={shelf} />
}

/**
 * What the collision left (assets/galaxy/remnant.json, its last frame, made by scripts/galaxy-remnant.mjs): never
 * re-simulated. Behind the forms it turns on from where the landing stopped and eases to still; under Reduce Motion it is still.
 */
function Remnant({ turning, paused, shelf }: { turning: boolean; paused: boolean; shelf?: Shelf | null }) {
  const frame = useSkyFrame()
  const looks = useMemo(() => starLooks(REMNANT.n), [])
  const { scales, spin } = looks
  const xy = REMNANT.xy
  const n = REMNANT.n
  const angle = useSharedValue(0)
  const active = useAppActive()
  const moving = turning && !paused && active
  useEffect(() => {
    if (!moving) return
    // What is left of the turn is read on the UI thread, where the running value lives: the JS side's copy of it lags,
    // and a turn held by the keyboard has to go on from exactly where it stopped.
    scheduleOnUI(() => {
      'worklet'
      const left = 1 - angle.get() / REMNANT_TURN.degrees
      angle.set(withTiming(REMNANT_TURN.degrees, { duration: REMNANT_TURN.ms * left, easing: Easing.out(Easing.quad) }))
    })
    return () => cancelAnimation(angle)
  }, [moving, angle])
  // The landing's turn, seen on screen (y down): the orbit's sense, so the remnant carries on the way it was going.
  const rotation = useDerivedValue(() => {
    const a = (-spin * angle.get() * Math.PI) / 180
    return [Math.cos(a), Math.sin(a)]
  })

  const stars = useRSXformBuffer(n, (xf, i) => {
    'worklet'
    const [c, s] = rotation.get()
    const x = xy[2 * i]
    const y = xy[2 * i + 1]
    const sc = scales[i]
    xf.set(sc, 0, frame.cx + (x * c - y * s) * frame.k - sc * HALF, frame.cy + (x * s + y * c) * frame.k - sc * HALF)
  })
  const cores = useRSXformBuffer(CORE_SCALES.length, (xf, i) => {
    'worklet'
    const [c, s] = rotation.get()
    const o = 2 * (n + (i % 2))
    const x = xy[o]
    const y = xy[o + 1]
    const sc = CORE_SCALES[i]
    xf.set(sc, 0, frame.cx + (x * c - y * s) * frame.k - sc * HALF, frame.cy + (x * s + y * c) * frame.k - sc * HALF)
  })

  return <Sky testID="galaxy-remnant" stars={stars} cores={cores} colors={looks.colors} frame={frame} bloom={!isLowEnd()} shelf={shelf} />
}

/**
 * L0 behind the entry screens: `collision` on the landing (the physics, once; the remnant under Reduce Motion), `remnant`
 * behind the forms and the quiet screens. `paused` holds it while the keyboard is up; it holds itself in the background.
 * `shelf` is the tagline's box, for the ink band behind it. Untouchable and hidden from a screen reader.
 */
export function GalaxyBackdrop({ mode, paused = false, shelf, testID }: { mode: 'collision' | 'remnant'; paused?: boolean; shelf?: Shelf | null; testID?: string }) {
  const reduceMotion = useReducedMotion()
  return (
    <View testID={testID} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      {mode === 'collision' && !reduceMotion ? (
        <Collision paused={paused} shelf={shelf} />
      ) : (
        <Remnant turning={mode === 'remnant' && !reduceMotion} paused={paused} shelf={shelf} />
      )}
    </View>
  )
}
