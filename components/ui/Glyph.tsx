/*
 * The glyph with a verb (foundations, direction C, "Lit from behind"): `Icon` that acts once when it is chosen. A wine glass
 * tilts, a record spins up, a tree hops, a note draws itself. It never plays on mount and never on deselect, never loops,
 * and runs on the UI thread. Under Reduce Motion no verb runs: the glyph is drawn final, in its colour and stroke.
 *
 * Without `play` it is exactly `Icon`, at no cost. With it, the verb runs when `play` goes false → true after mount.
 */
import { useEffect, useRef } from 'react'
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle, Path } from 'react-native-svg'

import { COLOR, DURATION, EASING, GLYPH, ICON, SPRING, STAGGER } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { DRAW_NODES, Icon, type IconName } from './Icon'

export type GlyphVerb = 'pop' | 'draw' | 'hop' | 'spin' | 'tilt' | 'flicker'

/** What each glyph does when chosen; any glyph not listed pops. */
export const GLYPH_VERB: Partial<Record<IconName, GlyphVerb>> = {
  sparkles: 'pop',
  heart: 'pop',
  bookmark: 'pop',
  'music-2': 'draw',
  beer: 'draw',
  coffee: 'draw',
  check: 'draw',
  'circle-check': 'draw',
  'tree-palm': 'hop',
  'map-pin': 'hop',
  'disc-3': 'spin',
  wine: 'tilt',
  utensils: 'tilt',
  moon: 'tilt',
  radio: 'flicker',
  handshake: 'draw',
  mountain: 'draw',
  palette: 'pop',
  trophy: 'hop',
  cpu: 'pop',
  'mic-vocal': 'tilt',
}

const verbOf = (name: IconName): GlyphVerb => GLYPH_VERB[name] ?? 'pop'

/**
 * Each `draw` glyph's stroke lengths, in the 24-unit box, in `DRAW_NODES` order. react-native-svg has no native `pathLength`.
 * Measured in the mockup (`getTotalLength`); a circle is rounded up from 2πr so its seam never shows. A Lucide upgrade that
 * changes the geometry fails `__tests__/glyph.test.tsx` instead of under-drawing.
 */
export const GLYPH_LENGTHS = {
  beer: [11.43, 6, 6, 38.94, 38.28],
  'music-2': [25.14, 24.06],
  coffee: [2, 2, 65.28, 2],
  check: [22.63],
  'circle-check': [62.84, 11.31],
  handshake: [9.5, 43.74, 13.05, 26.9, 8],
  mountain: [70.8],
} as const

type DrawName = keyof typeof GLYPH_LENGTHS
const isDrawn = (name: IconName): name is DrawName => name in GLYPH_LENGTHS

/** Added to each measured stroke length for the dash and its offset (see `Stroke`). */
const DASH_SLACK = 1
const SNAP_OUT = Easing.bezier(...EASING.snapOut)
const ENTRANCE = Easing.bezier(...EASING.entrance)
const LINEAR = Easing.linear
/** The flicker: the opacity each step ends on (1 → .35 → 1 → .6 → 1), the steps being fractions of `DURATION.medium`. */
const FLICKER_LEVELS = [GLYPH.flickerDips[0], 1, GLYPH.flickerDips[1], 1] as const

/** A value this near its rest has settled: a new verb starts from its start value. Short of it, the verb is mid-flight. */
const SETTLED = 0.001
const isSettled = (value: number, rest: number) => Math.abs(value - rest) < SETTLED

/** Runs `run` when `play` goes false → true after mount; a glyph that mounts playing is already there. */
function useOnRise(play: boolean, run: () => void) {
  const was = useRef(play)
  useEffect(() => {
    const rising = play && !was.current
    was.current = play
    if (rising) run()
    // `run` only sets shared values and is rebuilt each render: the edge is `play`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play])
}

/** The verbs that move the whole glyph: one animated style for scale, lift, turn and opacity. */
export function useGlyphPlay(play: boolean, verb: Exclude<GlyphVerb, 'draw'>) {
  const scale = useSharedValue(1)
  const lift = useSharedValue(0)
  const turn = useSharedValue(0)
  const alpha = useSharedValue(1)
  useOnRise(play, () => {
    // A re-tap mid-flight retargets from where the glyph is (the spring carries its velocity); only a settled glyph restarts.
    if (verb === 'pop') {
      if (isSettled(scale.get(), 1)) scale.set(GLYPH.popFrom)
      scale.set(withSpring(1, SPRING.pop))
    } else if (verb === 'hop') {
      lift.set(withSequence(withTiming(-GLYPH.hop, { duration: DURATION.press, easing: SNAP_OUT }), withSpring(0, SPRING.pop)))
    } else if (verb === 'spin') {
      if (isSettled(turn.get(), 0)) turn.set(-GLYPH.spin)
      turn.set(withSpring(0, SPRING.snap))
    } else if (verb === 'tilt') {
      if (isSettled(turn.get(), 0)) turn.set(-GLYPH.tilt)
      turn.set(withSpring(0, SPRING.pop))
    } else {
      const [first, ...rest] = GLYPH.flickerSteps.map((step, i) =>
        withTiming(FLICKER_LEVELS[i], { duration: step * DURATION.medium, easing: LINEAR })
      )
      alpha.set(withSequence(first, ...rest))
    }
  })
  return useAnimatedStyle(() => ({
    opacity: alpha.get(),
    transform: [{ translateY: lift.get() }, { rotate: `${turn.get()}deg` }, { scale: scale.get() }],
  }))
}

const AnimatedPath = Animated.createAnimatedComponent(Path)
const AnimatedCircle = Animated.createAnimatedComponent(Circle)

type Attrs = Record<string, string>
type StrokeProps = { tag: string; attrs: Attrs; length: number; index: number; play: boolean }

/** One stroke of a drawn glyph: its dash offset runs `length → 0`, each stroke `STAGGER.tight` after the last. */
function Stroke({ tag, attrs, length, index, play }: StrokeProps) {
  const drawn = useSharedValue(1)
  useOnRise(play, () => {
    const draw = withTiming(1, { duration: DURATION.base, easing: ENTRANCE })
    if (isSettled(drawn.get(), 1)) {
      drawn.set(0)
      drawn.set(withDelay(index * STAGGER.tight, draw))
    } else {
      // Mid-draw: carry on from where the stroke is, with no new delay.
      drawn.set(draw)
    }
  })
  // One unit longer than the measured length, so a measurement a hair short never leaves a tail undrawn.
  const dash = length + DASH_SLACK
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: dash * (1 - drawn.get()) }))
  const common = { strokeDasharray: dash, animatedProps }
  return tag === 'circle' ? (
    <AnimatedCircle cx={attrs.cx} cy={attrs.cy} r={attrs.r} {...common} />
  ) : (
    <AnimatedPath d={attrs.d} {...common} />
  )
}

/** A glyph that strokes itself in: the same Lucide geometry as `Icon`, one animated node per stroke. */
export function DrawnGlyph({
  name,
  size = ICON.nav,
  color = COLOR.textPrimary,
  active = false,
  play,
  testID,
}: {
  name: DrawName
  size?: number
  color?: string
  active?: boolean
  play: boolean
  testID?: string
}) {
  const lengths = GLYPH_LENGTHS[name]
  return (
    <Svg
      testID={testID}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={active ? ICON.strokeActive : ICON.stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {DRAW_NODES[name].map(([tag, attrs], i) => (
        <Stroke key={i} tag={tag} attrs={attrs as Attrs} length={lengths[i]} index={i} play={play} />
      ))}
    </Svg>
  )
}

function MovingGlyph({ verb, name, size = ICON.nav, color, active, play }: GlyphProps & { verb: Exclude<GlyphVerb, 'draw'>; play: boolean }) {
  const style = useGlyphPlay(play, verb)
  // A tilt turns about its foot, as a glass is clinked.
  return (
    <Animated.View style={[{ width: size, height: size }, verb === 'tilt' && { transformOrigin: 'bottom' }, style]}>
      <Icon name={name} size={size} color={color} active={active} />
    </Animated.View>
  )
}

export type GlyphProps = {
  name: IconName
  size?: number
  color?: string
  /** The thicker stroke (`ICON.strokeActive`): a chosen glyph. */
  active?: boolean
  /** Goes false → true: the glyph's verb runs once. Leave it out for a plain `Icon`. */
  play?: boolean
  testID?: string
}

export function Glyph({ play, testID, ...icon }: GlyphProps) {
  const reduceMotion = useReducedMotion()
  if (play === undefined) return <Icon {...icon} />
  // Reduce Motion: nothing runs, so the glyph only ever stands drawn.
  const live = play && !reduceMotion
  const verb = verbOf(icon.name)
  if (verb === 'draw' && isDrawn(icon.name)) return <DrawnGlyph {...icon} name={icon.name} play={live} testID={testID} />
  return <MovingGlyph {...icon} verb={verb === 'draw' ? 'pop' : verb} play={live} />
}
