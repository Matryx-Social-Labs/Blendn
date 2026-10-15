import { DURATION, REDUCE_MOTION, type EASING, type SPRING } from '../../lib/design/tokens'
import type { RoomButtonTarget } from '../../lib/roomButton'

/*
 * The centre disc's still frames and the moves between them, as data
 * (DESIGN-BRIEF §11.3–§11.4; the design system's
 * guidelines/centre-button/transitions.js). `Disc.tsx` plays them; keeping them
 * here keeps the choreography testable without a renderer.
 */

/** The design's names: (a) idle, (b) today, (c) check-in, (d) live, (dn) live with unread. */
export type DiscLook = 'a' | 'b' | 'c' | 'd' | 'dn'

export function discLook({ state, badge }: RoomButtonTarget): DiscLook {
  if (state === 'live') return badge > 0 ? 'dn' : 'd'
  if (state === 'checkin') return 'c'
  return state === 'today' ? 'b' : 'a'
}

/**
 * Every value the disc animates, each on its own layer (§11.2 rule 7), 0..1:
 * - `fill` the gradient risen into the disc · `ink` the ink mark over the gradient one
 * - `ring` (b)'s ring · `ringDraw` how much of it is drawn on (1 at rest)
 * - `glow` (c)'s static glow · `pulse` the disc's scale (1 at rest)
 * - `ripple` (c → d)'s ring, expanding and fading as it goes 0 → 1 (1 at rest: gone)
 * - `hollow` (c)'s hollow white ring · `dot` (d)'s green dot
 * - `pill` / `pillScale` the unread pill
 */
export type DiscFrame = Record<
  'fill' | 'ink' | 'ring' | 'ringDraw' | 'glow' | 'pulse' | 'ripple' | 'hollow' | 'dot' | 'pill' | 'pillScale',
  number
>
export type DiscChannel = keyof DiscFrame

/** How one channel gets to its value: a spring, or a duration on an easing. */
export type DiscMove = {
  /** Jump here first, then move. */
  from?: number
  delay?: number
  spring?: keyof typeof SPRING
  duration?: number
  easing?: keyof typeof EASING
}
export type DiscStep = DiscMove & { channel: DiscChannel; to: number }

/** The unread pill pops from, and back to, this scale. */
const PILL_HIDDEN_SCALE = 0.6

const IDLE: DiscFrame = {
  fill: 0,
  ink: 0,
  ring: 0,
  ringDraw: 1,
  glow: 0,
  pulse: 1,
  ripple: 1,
  hollow: 0,
  dot: 0,
  pill: 0,
  pillScale: PILL_HIDDEN_SCALE,
}
const FILLED: DiscFrame = { ...IDLE, fill: 1, ink: 1 }
const CHANNELS = Object.keys(IDLE) as DiscChannel[]

/**
 * The still frames (§11.3, variant A "the disc fills"). Each reads in a
 * screenshot, in greyscale and with Reduce Motion on: motion may announce a
 * state, never be it. (d) is quieter than (c): no glow.
 */
export const DISC_FRAMES: Record<DiscLook, DiscFrame> = {
  a: IDLE,
  b: { ...IDLE, ring: 1 },
  c: { ...FILLED, glow: 1, hollow: 1 },
  d: { ...FILLED, dot: 1 },
  dn: { ...FILLED, pill: 1, pillScale: 1 },
}

const tween = (duration: number, easing: keyof typeof EASING = 'gentle', delay = 0): DiscMove => ({ duration, easing, delay })
const INSTANT = tween(0, 'linear')
const { quick, base } = DURATION

/** a/b → c: the one pulse, scale 1.06 → 1. */
const PULSE: DiscMove = { from: 1.06, spring: 'snap' }
/** a/b → c, the owner's ask: the disc pours full of the gradient. Under 1.5s; then the glow holds still. */
const ENTER_CHECK_IN: Partial<Record<DiscChannel, DiscMove>> = {
  fill: tween(500),
  ring: tween(250),
  ink: tween(quick, 'gentle', 220), // the mark turns at the fill's midpoint
  hollow: tween(base, 'gentle', 450),
  glow: tween(base, 'gentle', 600),
  pulse: { ...PULSE, delay: 600 },
}

/** The spec'd moves, by `from>to` (with (dn) as (d)). A pair it does not draw tweens over `base`. */
const MOVES: Record<string, Partial<Record<DiscChannel, DiscMove>>> = {
  // The ring draws on, ~450ms ease-out.
  'a>b': { ring: INSTANT, ringDraw: { ...tween(450), from: 0 } },
  'a>c': ENTER_CHECK_IN,
  'b>c': ENTER_CHECK_IN,
  // Checked in (plays when the overlay closes): the glow collapses, one ripple, the hollow ring fills green.
  'c>d': {
    glow: tween(350, 'exit'),
    ripple: { ...tween(600), from: 0 },
    hollow: tween(base, 'gentle', 100),
    dot: tween(base, 'gentle', 100),
  },
  // Checked out, or the event is over: the fill drains, the mark turns back at its midpoint, the dot fades.
  'd>a': { fill: tween(400, 'exit'), ink: tween(quick, 'gentle', 160), dot: tween(base, 'exit') },
}

/** Unread 0 → n: the pill pops in on M.pop over the dot, which goes once the pill is opaque (its cut-out ring with it). */
const PILL_FADE_IN = 100
const PILL_IN: Partial<Record<DiscChannel, DiscMove>> = {
  pill: tween(PILL_FADE_IN, 'linear'),
  pillScale: { spring: 'pop' },
  dot: tween(0, 'linear', PILL_FADE_IN),
}
/** Unread n → 0: it pops out on M.snap and the dot is back once it has gone. */
const PILL_OUT: Partial<Record<DiscChannel, DiscMove>> = {
  pill: tween(quick, 'linear'),
  pillScale: { spring: 'snap' },
  dot: tween(0, 'linear', quick),
}
const PILL_INSTANT: Partial<Record<DiscChannel, DiscMove>> = { pill: INSTANT, pillScale: INSTANT, dot: INSTANT }

const CROSSFADE = tween(REDUCE_MOTION.duration.base)
const settled = (look: DiscLook) => (look === 'dn' ? 'd' : look)

/**
 * What changes, and how, going from one state to another. Reduce Motion: a
 * 200ms crossfade to the new still (the fill fades in place rather than
 * rising), no pulse, ripple or draw-on, and the unread pill is instant.
 */
export function discTransition(from: DiscLook, to: DiscLook, reduceMotion: boolean): DiscStep[] {
  const was = DISC_FRAMES[from]
  const next = DISC_FRAMES[to]
  const pill = was.pill === next.pill ? undefined : reduceMotion ? PILL_INSTANT : next.pill ? PILL_IN : PILL_OUT
  const moves = { ...(reduceMotion ? undefined : MOVES[`${settled(from)}>${settled(to)}`]), ...pill }
  const steps: DiscStep[] = CHANNELS.flatMap((channel) => {
    const move = moves[channel]
    if (was[channel] === next[channel] && move?.from === undefined) return []
    return [{ channel, to: next[channel], ...(move ?? (reduceMotion ? CROSSFADE : tween(base))) }]
  })
  // An entry left before its pulse (600ms in) must not pulse later, in the next state.
  const settlePulse: DiscStep = { channel: 'pulse', to: 1, spring: 'snap' }
  return reduceMotion || moves.pulse ? steps : [...steps, settlePulse]
}

/** Back in (c) after a while away: the one pulse again. Nothing under Reduce Motion. */
export function discReentry(reduceMotion: boolean): DiscStep[] {
  return reduceMotion ? [] : [{ channel: 'pulse', to: 1, ...PULSE }]
}
