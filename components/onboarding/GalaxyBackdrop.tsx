import {
  AlphaType,
  Atlas,
  BlendMode,
  Blur,
  Canvas,
  ColorType,
  Fill,
  Group,
  Image,
  LinearGradient,
  Paint,
  RadialGradient,
  Rect,
  Skia,
  TileMode,
  useRSXformBuffer,
  vec,
  type SkColor,
  type SkImage,
  type SkRect,
  type SkRSXform,
} from '@shopify/react-native-skia'
import * as Device from 'expo-device'
import { useEffect, useMemo, useState } from 'react'
import { AppState, PixelRatio, Platform, StyleSheet, View, useWindowDimensions } from 'react-native'
import { cancelAnimation, Easing, makeMutable, useDerivedValue, useFrameCallback, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated'
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets'

import REMNANT from '../../assets/galaxy/remnant.json'
import { COLOR } from '../../lib/design/tokens'
import { advanceFilm, frozen, GALAXY_B, idleTurn, init, orbitSense, startFilm, viewX, viewY, type Film } from '../../lib/galaxySim'
import { useReducedMotion } from '../../lib/motion'
import { tint } from '../../lib/theme'

/*
 * Flow 1b (owner's pick, variant B, 2026-11-02): two galaxies collide once under real gravity behind the landing, then
 * what they left turns on, with no end, until the person leaves the landing (owner, 2026-11-03); the screens after it
 * show it from where it was left. The physics is lib/galaxySim.ts; this draws it with Skia, every star one
 * sprite of an Atlas, added onto ink so ember over violet mixes to rose. Once the physics stops (FREEZE_AT) the stars are
 * drawn once into one image and that image is turned, for the battery (owner, 2026-11-06, SCRUM-1015).
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
/**
 * How far the landing has turned past the remnant file's frame, degrees (lib/galaxySim `idleTurn`): written by the
 * landing on the UI thread, read by every remnant after it, so leaving the landing a minute in does not snap the sky back.
 * ponytail: the forms turn the projected frame in the screen's plane where the landing rolls the disk in its own, tilted
 * 22°: off by up to 7% of a star's radius, seen only in a push's 350 ms. Store z in remnant.json if that ever shows.
 */
let landingTurnValue: SharedValue<number> | null = null
/** Made on first use, on the JS thread, so it is one value for the app's life and a test's Reanimated is the one it gets. */
const landingTurn = () => (landingTurnValue ??= makeMutable(0))

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
let cores: { rects: SkRect[]; colors: SkColor[] } | null = null
/** The two cores' sprites, each a halo and a light: made once, on first use, like the sprite images. */
const coreLights = () =>
  (cores ??= {
    rects: CORE_SCALES.map(() => Skia.XYWHRect(0, 0, SPRITE, SPRITE)),
    colors: CORE_LIGHTS.flatMap(({ alpha }) => [colour(CORE_WHITE, alpha), colour(CORE_WHITE, alpha)]),
  })

/** How far past the farthest point the sky shows the baked image must reach: the widest light's half (a core's halo)
 * and the bloom's (3σ), so a star just outside still lights its edge. */
const BAKE_MARGIN = Math.max(...CORE_LIGHTS.map(({ size }) => size)) / 2 + 3 * BLOOM.blur
type BakeBox = { x: number; y: number; size: number; px: number; density: number }

/**
 * The square the landing's remnant is baked into: about the sky's centre, reaching every point it shows at any turn (the
 * farthest corner above the fade, below which the sky is solid ink), on whole device pixels so it lands 1:1 before it turns.
 * ponytail: full device density, about 35 MB of texture on a 390 pt phone at 3x while the landing is up; bake at 2x if
 * memory ever shows (the stars are soft sprites).
 */
function bakeBox(frame: SkyFrame, density: number): BakeBox {
  const bottom = frame.height * FADE.to
  const reach = Math.hypot(Math.max(frame.cx, frame.width - frame.cx), Math.max(frame.cy, bottom - frame.cy)) + BAKE_MARGIN
  const px = Math.ceil(2 * reach * density) + 1
  return { x: Math.floor((frame.cx - reach) * density) / density, y: Math.floor((frame.cy - reach) * density) / density, size: px / density, px, density }
}

type Lights = { star: SkImage; core: SkImage; scales: number[]; colors: SkColor[]; coreRects: SkRect[]; coreColors: SkColor[] }

/**
 * The landing past the freeze, drawn once: every star and core where the film left them, and the bloom, the same draws as
 * `Sky`'s lights (an Atlas's `blendMode` is its paint's, its `colorBlendMode` the call's), onto a transparent `box` that the
 * sky adds onto ink and turns. Null with no GPU surface: the sky then stays live, as it was before.
 */
function bakeLights(f: Film, lights: Lights, frame: SkyFrame, box: BakeBox, bloom: boolean): SkImage | null {
  'worklet'
  const surface = Skia.Surface.MakeOffscreen(box.px, box.px)
  if (!surface) return null
  const canvas = surface.getCanvas()
  canvas.scale(box.density, box.density)
  canvas.translate(-box.x, -box.y)
  const sprite = Skia.XYWHRect(0, 0, SPRITE, SPRITE)
  const at = (sc: number, x: number, y: number) => Skia.RSXform(sc, 0, frame.cx + x * frame.k - sc * HALF, frame.cy + y * frame.k - sc * HALF)
  const p = f.s.pos
  const c = f.s.core
  const starRects: SkRect[] = []
  const starXf: SkRSXform[] = []
  for (let i = 0; i < f.s.n; i++) {
    const j = 3 * i
    starRects.push(sprite)
    starXf.push(at(lights.scales[i], viewX(p[j], p[j + 1], f.ca, f.sa), viewY(p[j], p[j + 1], p[j + 2], f.ca, f.sa, COS_TILT, SIN_TILT)))
  }
  const coreXf: SkRSXform[] = []
  for (let i = 0; i < CORE_SCALES.length; i++) {
    const o = (i % 2) * 6
    coreXf.push(at(CORE_SCALES[i], viewX(c[o], c[o + 1], f.ca, f.sa), viewY(c[o], c[o + 1], c[o + 2], f.ca, f.sa, COS_TILT, SIN_TILT)))
  }
  const plus = Skia.Paint()
  plus.setBlendMode(BlendMode.Plus)
  const draw = () => {
    canvas.drawAtlas(lights.star, starRects, starXf, plus, BlendMode.Modulate, lights.colors)
    canvas.drawAtlas(lights.core, lights.coreRects, coreXf, plus, BlendMode.Modulate, lights.coreColors)
  }
  draw()
  if (bloom) {
    const layer = Skia.Paint()
    layer.setBlendMode(BlendMode.Plus)
    layer.setAlphaf(BLOOM.alpha)
    layer.setImageFilter(Skia.ImageFilter.MakeBlur(BLOOM.blur, BLOOM.blur, TileMode.Decal, null))
    canvas.saveLayer(layer)
    draw()
    canvas.restore()
  }
  surface.flush()
  return surface.makeImageSnapshot()
}

/** The baked remnant and its turn, radians about the sky's centre. */
type Baked = { image: SharedValue<SkImage | null>; box: BakeBox; spin: SharedValue<{ rotate: number }[]> }

function Sky({ stars, cores: coreXf, colors, frame, bloom, baked, shelf, shelfFade, testID }: {
  stars: ReturnType<typeof useRSXformBuffer>
  cores: ReturnType<typeof useRSXformBuffer>
  colors: SkColor[]
  frame: SkyFrame
  bloom: boolean
  /** Past the freeze: the one image, drawn instead of the stars and their bloom (both are in it). */
  baked?: Baked
  shelf?: Shelf | null
  shelfFade?: SharedValue<number>
  testID: string
}) {
  const images = spriteImages()
  const starRects = useMemo(() => colors.map(() => Skia.XYWHRect(0, 0, SPRITE, SPRITE)), [colors])
  const core = coreLights()
  const lights = (
    <>
      <Atlas image={images.star} sprites={starRects} transforms={stars} colors={colors} colorBlendMode="modulate" blendMode="plus" />
      <Atlas image={images.core} sprites={core.rects} transforms={coreXf} colors={core.colors} colorBlendMode="modulate" blendMode="plus" />
    </>
  )
  const fadeTop = frame.height * FADE.from
  return (
    <Canvas testID={testID} style={StyleSheet.absoluteFill}>
      <Fill color={COLOR.ink} />
      {baked ? (
        <Group transform={baked.spin} origin={vec(frame.cx, frame.cy)}>
          <Image image={baked.image} x={baked.box.x} y={baked.box.y} width={baked.box.size} height={baked.box.size} blendMode="plus" />
        </Group>
      ) : (
        <>
          {lights}
          {bloom ? <Group layer={<Paint blendMode="plus" opacity={BLOOM.alpha}><Blur blur={BLOOM.blur} /></Paint>}>{lights}</Group> : null}
        </>
      )}
      {shelf ? <ShelfBand shelf={shelf} fade={shelfFade} /> : null}
      <Rect x={0} y={fadeTop} width={frame.width} height={frame.height - fadeTop}>
        <LinearGradient start={vec(0, fadeTop)} end={vec(0, frame.height * FADE.to)} colors={[tint(COLOR.ink, 0), COLOR.ink]} />
      </Rect>
    </Canvas>
  )
}

/** An ink ellipse under the tagline, part of the sky: a star crossing behind the words is dimmed to AA. */
function ShelfBand({ shelf, fade }: { shelf: Shelf; fade?: SharedValue<number> }) {
  const rx = shelf.width / 2 + SHELF.padX
  const ry = shelf.height / 2 + SHELF.padY
  const ink = tint(COLOR.ink, SHELF.alpha)
  return (
    <Group opacity={fade ?? 1} transform={[{ translateX: shelf.x + shelf.width / 2 }, { translateY: shelf.y + shelf.height / 2 }, { scaleX: rx / ry }]}>
      <Rect x={-ry} y={-ry} width={2 * ry} height={2 * ry}>
        <RadialGradient c={vec(0, 0)} r={ry} colors={[ink, ink, tint(COLOR.ink, 0)]} positions={[0, SHELF.solid, 1]} />
      </Rect>
    </Group>
  )
}

/**
 * The landing: the physics runs from a frame callback, two steps a frame; after it only the turn is left, redrawn every
 * second frame, until the landing is left. Held in the background and while `paused` (the keyboard, another screen on top).
 * At the freeze the stars are baked into one image (`bakeLights`) and from then on only its angle changes: no per-star work.
 */
function Collision({ paused, shelf, shelfFade }: { paused: boolean; shelf?: Shelf | null; shelfFade?: SharedValue<number> }) {
  const frame = useSkyFrame()
  const [lowEnd] = useState(isLowEnd)
  const count = lowEnd ? GALAXY_B.physics.stars / 2 : GALAXY_B.physics.stars
  const looks = useMemo(() => starLooks(count), [count])
  const { scales } = looks
  const film = useSharedValue<Film | null>(null)
  const tick = useSharedValue(0)
  const turned = landingTurn()
  const active = useAppActive()
  const bloom = !lowEnd
  const density = PixelRatio.get()
  const box = useMemo(() => bakeBox(frame, density), [frame, density])
  const sprites = useMemo(() => {
    const { star, core } = spriteImages()
    return star && core ? { star, core, scales, colors: looks.colors, coreRects: coreLights().rects, coreColors: coreLights().colors } : null
  }, [scales, looks.colors])
  // Copied to the UI runtime once: the frame callback is registered again on every render, and would carry 2,000 colours each time.
  const lights = useSharedValue<Lights | null>(sprites)
  const image = useSharedValue<SkImage | null>(null)
  const bakeTried = useSharedValue(false)
  const bakedTurn = useSharedValue(0)
  const angle = useSharedValue(0)
  const spin = useDerivedValue(() => [{ rotate: angle.get() }])
  const [baked, setBaked] = useState(false)

  const callback = useFrameCallback((info) => {
    'worklet'
    let f = film.get()
    if (!f) {
      f = startFilm(count)
      film.set(f)
    }
    if (!advanceFilm(f, (info.timeSincePreviousFrame ?? FRAME_MS) / 1000)) return
    turned.set(idleTurn(f))
    if (image.get()) {
      // The turn on screen (y down), the orbit's way: the same sense as the forms' remnant.
      angle.set((-(f.turn - bakedTurn.get()) * Math.PI) / 180)
      return
    }
    const sky = lights.get()
    if (frozen(f) && !bakeTried.get() && sky) {
      bakeTried.set(true)
      const made = bakeLights(f, sky, frame, box, bloom)
      if (made) {
        bakedTurn.set(f.turn)
        image.set(made)
        scheduleOnRN(setBaked, true)
        return
      }
    }
    tick.set(f.tau)
  }, false)
  const running = active && !paused
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

  return (
    <Sky
      testID="galaxy-live"
      stars={stars}
      cores={cores}
      colors={looks.colors}
      frame={frame}
      bloom={bloom}
      baked={baked ? { image, box, spin } : undefined}
      shelf={shelf}
      shelfFade={shelfFade}
    />
  )
}

/**
 * What the collision left (assets/galaxy/remnant.json, its frame at END_AT, made by scripts/galaxy-remnant.mjs): never
 * re-simulated. Behind the forms it turns on from where the landing was left and eases to still; under Reduce Motion it is still.
 */
function Remnant({ turning, paused, shelf, shelfFade }: { turning: boolean; paused: boolean; shelf?: Shelf | null; shelfFade?: SharedValue<number> }) {
  const frame = useSkyFrame()
  const looks = useMemo(() => starLooks(REMNANT.n), [])
  const { scales, spin } = looks
  const xy = REMNANT.xy
  const n = REMNANT.n
  const angle = useSharedValue(0)
  const turned = landingTurn()
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
    const a = (-spin * (angle.get() + turned.get()) * Math.PI) / 180
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

  return <Sky testID="galaxy-remnant" stars={stars} cores={cores} colors={looks.colors} frame={frame} bloom={!isLowEnd()} shelf={shelf} shelfFade={shelfFade} />
}

/**
 * L0 behind the entry screens: `collision` on the landing (the physics once, then the turn until it is left; the remnant
 * under Reduce Motion), `remnant` behind the forms and the quiet screens. `paused` holds it while the keyboard is up or
 * another screen is over it; it holds itself in the background.
 * `shelf` is the tagline's box, for the ink band behind it. Untouchable and hidden from a screen reader.
 */
export function GalaxyBackdrop({ mode, paused = false, shelf, shelfFade, testID }: {
  mode: 'collision' | 'remnant'
  paused?: boolean
  shelf?: Shelf | null
  /** The shelf's opacity (the email sheet's handover); whole when not given. */
  shelfFade?: SharedValue<number>
  testID?: string
}) {
  const reduceMotion = useReducedMotion()
  return (
    <View testID={testID} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      {mode === 'collision' && !reduceMotion ? (
        <Collision paused={paused} shelf={shelf} shelfFade={shelfFade} />
      ) : (
        <Remnant turning={mode === 'remnant' && !reduceMotion} paused={paused} shelf={shelf} shelfFade={shelfFade} />
      )}
    </View>
  )
}
