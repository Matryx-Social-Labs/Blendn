import { memo, useCallback, useEffect, useId, useMemo, useState } from 'react'
import { View } from 'react-native'
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated'
import Svg, { ClipPath, Defs, G, Path, RadialGradient, Stop, SvgXml, Text as SvgText } from 'react-native-svg'
import { scheduleOnRN } from 'react-native-worklets'

import { FONT_FAMILY } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { useLatest } from '../../lib/useLatest'
import { elementsOf, faceMarkup, type CreatureMood } from './Creature'
import {
  ARM_LENGTH,
  ARM_X,
  ARM_Y,
  CLINK_MARKUP,
  SCENES,
  SPARKS,
  SQ24,
  Z_FONT,
  buntingMarkup,
  edgeMarkup,
  floorMarkup,
  frontGoesFirst,
  huddleKey,
  huddleMarkup,
  HUDDLE_HUES,
  kitMarkup,
  mittMarkup,
  mugMarkup,
  sparkMarkup,
  sparkScale,
  spotsOf,
  tierOf,
  zRise,
  type CrewScene,
  type HuddleHue,
  type Pose,
  type Spot,
} from './crewHuddle'

export { CREW_SCENES, huddleKey, tierOf, type CrewScene } from './crewHuddle'

/*
 * The crew emblem: B · Huddle (refined), owner-approved 2026-11-12 (SCRUM-1053). The look and its markup are
 * `crewHuddle.ts`, a string-for-string port of the design's huddle.js; this is how it is put on screen.
 *
 * Still: one memoised `SvgXml` of the design's markup, so a list of 214 crews costs what it did. Scene: the same parts as
 * react-native-svg elements, posed per frame on the UI thread (the design's pose functions, as worklets).
 */

/** The squircle (continuous corners) every emblem is cut to, in a 100 × 100 box: a cut-out behind an overlapping pair. */
export const EMBLEM_SQUIRCLE = 'M50 0C86 0 100 14 100 50C100 86 86 100 50 100C14 100 0 86 0 50C0 14 14 0 50 0Z'

const Z_FAMILY = FONT_FAMILY.brand[900]

// ── at most one moving emblem on screen; the Mix's two clink together ─────────────────────────────────────────────
const moving = new Map<string, CrewScene>()
function claimMotion(id: string, scene: CrewScene): boolean {
  const others = [...moving.entries()].filter(([k]) => k !== id).map(([, s]) => s)
  const allowed = others.length === 0 || (scene === 'clink' && others.length === 1 && others[0] === 'clink')
  if (allowed) moving.set(id, scene)
  return allowed
}
const releaseMotion = (id: string) => moving.delete(id)
/** Tests only: what is moving now. */
export const movingEmblems = () => [...moving.values()]

// ── matrices (a, b, c, d, e, f), on the UI thread ─────────────────────────────────────────────────────────────────
/** `translate(cx - 12s + dx, cy - 12s + dy) scale(s) rotate(rot 12 26)`: the design's `place`. */
const placeMatrix = (cx: number, cy: number, s: number, p: Pose) => {
  'worklet'
  const r = ((p.rot || 0) * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const tx = cx - 12 * s + (p.dx || 0)
  const ty = cy - 12 * s + (p.dy || 0)
  return [s * cos, s * sin, -s * sin, s * cos, tx + s * (12 - 12 * cos + 26 * sin), ty + s * (26 - 12 * sin - 26 * cos)]
}
/** `rotate(deg px py)`. */
const rotateAbout = (deg: number, px: number, py: number) => {
  'worklet'
  const r = (deg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return [cos, sin, -sin, cos, px - px * cos + py * sin, py - px * sin - py * cos]
}

const AnimatedG = Animated.createAnimatedComponent(G)

type Frame = { matrix: number[]; opacity: number }
/**
 * A scene's first frame, as props G's JS side reads. Reanimated hands `matrix` over as an initial prop, which
 * react-native-svg's G drops (it reads `transform`), so on device the first frame drew every part at identity, one
 * full-size head filling the plate, until the UI thread's first update landed. Every animated group gets both.
 */
const firstFrame = ({ matrix, opacity }: Frame) => ({ transform: matrix as [number, number, number, number, number, number], opacity })

type PoseFn = (t: number, i: number) => Pose

/** One arm, hung straight down from its shoulder and turned to its angle; the design draws none at 0°. */
function Arm({ t, pose, slot, side, c }: { t: SharedValue<number>; pose: PoseFn; slot: number; side: 0 | 1; c: HuddleHue }) {
  const x = ARM_X[side]
  const dir = side === 0 ? -1 : 1
  const handY = ARM_Y + ARM_LENGTH
  const armAt = (v: number): Frame => {
    'worklet'
    const deg = (pose(v, slot).arm || [0, 0])[side]
    return { matrix: rotateAbout(-deg * dir, x, ARM_Y), opacity: deg ? 1 : 0 }
  }
  // The cup stays upright in the mitt.
  const cupAt = (v: number): Frame => {
    'worklet'
    const p = pose(v, slot)
    const deg = (p.arm || [0, 0])[side]
    return { matrix: rotateAbout(deg * dir, x, handY), opacity: p.cup ? 1 : 0 }
  }
  const arm = useAnimatedProps(() => armAt(t.get()))
  const cup = useAnimatedProps(() => cupAt(t.get()))
  return (
    <AnimatedG animatedProps={arm} {...firstFrame(armAt(0))}>
      <Path d={`M${x} ${ARM_Y}L${x} ${handY}`} stroke={c.e} strokeWidth={2.6} strokeLinecap="round" />
      <AnimatedG animatedProps={cup} {...firstFrame(cupAt(0))}>
        {elementsOf(mugMarkup(x, handY, c))}
      </AnimatedG>
      {elementsOf(mittMarkup(x, handY))}
    </AnimatedG>
  )
}

/** One face of a character's, shown while its pose wears that mood. */
function Mood({ t, pose, slot, mood, rest, markup }: { t: SharedValue<number>; pose: PoseFn; slot: number; mood: CreatureMood; rest: CreatureMood; markup: string }) {
  const shown = useAnimatedProps(() => ({ opacity: (pose(t.get(), slot).mood || rest) === mood ? 1 : 0 }))
  return <AnimatedG animatedProps={shown}>{elementsOf(markup)}</AnimatedG>
}

type CharacterProps = {
  t: SharedValue<number>
  pose: PoseFn
  spot: Spot
  species: string
  rest: CreatureMood
  moods: readonly CreatureMood[]
  c: HuddleHue
  hue: number
  /** The high five's two copies of the front character: drawn behind the back pair (`true`) or in front. */
  behind?: boolean
}

function Character({ t, pose, spot, species, rest, moods, c, hue, behind }: CharacterProps) {
  const [slot, cx, cy, s] = spot
  const placedAt = (v: number): Frame => {
    'worklet'
    const visible = behind === undefined || frontGoesFirst(v) === behind
    return { matrix: placeMatrix(cx, cy, s, pose(v, slot)), opacity: visible ? 1 : 0 }
  }
  const placed = useAnimatedProps(() => placedAt(t.get()))
  const faces = [...new Set([rest, ...moods])]
  return (
    <AnimatedG animatedProps={placed} {...firstFrame(placedAt(0))}>
      {elementsOf(kitMarkup(c))}
      {faces.map((m) => (
        <Mood key={m} t={t} pose={pose} slot={slot} mood={m} rest={rest} markup={faceMarkup(species, m, hue)} />
      ))}
      <Arm t={t} pose={pose} slot={slot} side={0} c={c} />
      <Arm t={t} pose={pose} slot={slot} side={1} c={c} />
    </AnimatedG>
  )
}

function Spark({ t, at: [x, y], fx }: { t: SharedValue<number>; at: readonly [number, number]; fx: (t: number) => string }) {
  const litAt = (v: number): Frame => {
    'worklet'
    const s = sparkScale(v)
    return { matrix: [s, 0, 0, s, x - s * x, y - s * y], opacity: fx(v) === 'spark' ? 1 : 0 }
  }
  const lit = useAnimatedProps(() => litAt(t.get()))
  return (
    <AnimatedG animatedProps={lit} {...firstFrame(litAt(0))}>
      {elementsOf(sparkMarkup(x, y, 1))}
    </AnimatedG>
  )
}

function Zee({ t, x, y, rise, size, fade, c }: { t: SharedValue<number>; x: number; y: number; rise: number; size: number; fade: number; c: HuddleHue }) {
  const upAt = (v: number): Frame => {
    'worklet'
    const u = v > 0.45 ? zRise(v) : 0
    return { matrix: [1, 0, 0, 1, u, -rise * u], opacity: u * fade }
  }
  const up = useAnimatedProps(() => upAt(t.get()))
  return (
    <AnimatedG animatedProps={up} {...firstFrame(upAt(0))}>
      <SvgText x={x} y={y} fontFamily={Z_FAMILY} fontSize={size} fill={c.g}>
        z
      </SvgText>
    </AnimatedG>
  )
}

function Effects({ t, scene, c }: { t: SharedValue<number>; scene: CrewScene; c: HuddleHue }) {
  const fx = SCENES[scene].fx
  const clink = useAnimatedProps(() => ({ opacity: fx && fx(t.get()) === 'clink' ? 1 : 0 }))
  if (!fx) return null
  if (scene === 'sleepy') {
    return (
      <>
        <Zee t={t} x={17} y={6} rise={2} size={3.4} fade={1} c={c} />
        <Zee t={t} x={19.6} y={3.6} rise={1.6} size={2.4} fade={0.8} c={c} />
      </>
    )
  }
  if (scene === 'clink') return <AnimatedG animatedProps={clink}>{elementsOf(CLINK_MARKUP)}</AnimatedG>
  return (
    <>
      {SPARKS.map((at) => (
        <Spark key={at.join()} t={t} at={at} fx={fx} />
      ))}
    </>
  )
}

/** The scene, played once from t = 0 to 1; `onFinish` on its last frame. */
function Playing({ id, seed, size, scene, onFinish }: { id: string; seed: string; size: number; scene: CrewScene; onFinish: () => void }) {
  const t = useSharedValue(0)
  const def = SCENES[scene]
  const pose = def.pose
  useEffect(() => {
    // Claimed here, held until unmount: another emblem already moving means this one rests.
    if (!claimMotion(id, scene)) {
      onFinish()
      return
    }
    t.set(
      withTiming(1, { duration: def.ms, easing: Easing.linear }, (finished) => {
        if (finished) scheduleOnRN(onFinish)
      })
    )
    return () => {
      releaseMotion(id)
    }
  }, [t, id, scene, def.ms, onFinish])
  const k = huddleKey(seed)
  const c = HUDDLE_HUES[k.hue]
  const tier = tierOf(size)
  const spots = spotsOf(tier)
  const species = [k.front, k.left, k.right]
  const one = (spot: Spot, behind?: boolean) => (
    <Character key={`${spot[0]}${behind ?? ''}`} t={t} pose={pose} spot={spot} species={species[spot[0]]} rest={k.moods[spot[0]]} moods={def.moods} c={c} hue={k.hue} behind={behind} />
  )
  return (
    <Svg testID="crew-emblem-scene" width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <ClipPath id={`${id}c`}>
          <Path d={SQ24} />
        </ClipPath>
        <RadialGradient id={`${id}g`} cx={12} cy={9} r={16} gradientUnits="userSpaceOnUse">
          <Stop offset={0} stopColor={c.e} stopOpacity={0.55} />
          <Stop offset={1} stopColor={c.f} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Path d={SQ24} fill={c.f} />
      <Path d={SQ24} fill={`url(#${id}g)`} />
      <G clipPath={`url(#${id}c)`}>
        {tier === 'lead' ? (
          spots.map((s) => one(s))
        ) : (
          <>
            {tier === 'scene' ? elementsOf(floorMarkup(c) + buntingMarkup(c)) : null}
            {def.frontFirst ? one(spots[2], true) : null}
            {one(spots[0])}
            {one(spots[1])}
            {one(spots[2], def.frontFirst ? false : undefined)}
            <Effects t={t} scene={scene} c={c} />
          </>
        )}
      </G>
      {elementsOf(edgeMarkup(c))}
    </Svg>
  )
}

/**
 * A crew's emblem: three of its own characters in the crew's kit on a squircle, drawn from the server's `emblemSeed` and
 * nothing else. The size picks the tier (≤ 28 two faces, ≤ 80 three, larger the full scene with bunting).
 *
 * `scene` plays one of the six scenes once, on its moment (crew page: dance; invite: wave; the Mix: clink; Wave for /
 * Wave back: highfive; check-in and "With {crew}": cheer; end of night: sleepy), then rests; it replays when the scene or
 * the seed changes (Shuffle). Never in a list: `__tests__/crewEmblemSceneHosts.test.ts` holds the hosts to that. At most
 * one emblem moves on screen (the Mix's two clink together); another asked to move shows its still. Reduce Motion draws
 * the still. `onDone` fires when it has played, or at once when it will not.
 *
 * Decorative: the crew's name beside it is what is read. Memoised, so a list re-parses only the emblems that changed.
 */
export const CrewEmblem = memo(function CrewEmblem({
  seed,
  size,
  scene,
  onDone,
  testID,
}: {
  /** The server's `emblemSeed`. Never a crew id, a name or a member's pseudonym. */
  seed: string
  size: number
  scene?: CrewScene
  onDone?: () => void
  testID?: string
}) {
  // SVG ids: letters only (useId's colons are not safe inside url(#…)).
  const id = `ce${useId().replace(/[^A-Za-z0-9]/g, '')}`
  const reduce = useReducedMotion()
  const done = useLatest(onDone)
  // Each scene on each seed plays once (a new seed is a Shuffle: it plays again). Reduce Motion: the still, done at once.
  const run = scene && !reduce ? `${scene}|${seed}` : null
  const [finished, setFinished] = useState<string | null>(null)
  const playing = run !== null && finished !== run ? scene : undefined
  useEffect(() => {
    if (scene && reduce) done.current?.()
  }, [scene, seed, reduce, done])
  const finish = useCallback(() => {
    setFinished(run)
    done.current?.()
  }, [run, done])

  // The sleepy lean ends held: its still is its last frame.
  const held = scene && SCENES[scene].hold ? scene : undefined
  const still = useMemo(() => huddleMarkup(seed, size, id, held ? { scene: held, t: 1 } : {}).replaceAll(Z_FONT, Z_FAMILY), [seed, size, id, held])

  return (
    <View testID={testID} style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {playing ? <Playing key={run} id={id} seed={seed} size={size} scene={playing} onFinish={finish} /> : <SvgXml testID={testID && `${testID}-xml`} xml={still} width={size} height={size} />}
    </View>
  )
})
