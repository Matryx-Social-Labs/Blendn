import { seeded } from './cityArt'
import { EMBER } from './theme'

/**
 * The check-in confetti, as numbers: where each piece starts, how it flies,
 * and where it is at any moment.
 *
 * It fires *up* from the button you held, not down from the top of the screen.
 * The hold is the tension and the pop is the release, so the confetti has to
 * come from under your thumb. Each piece has a launch speed and air drag
 * (paper, not a cannonball), which gives the whole burst its shape: a fast
 * climb, a slow hang near the top third, then a fluttering fall at terminal
 * speed. The motion is solved in closed form, so `pieceAt` is a pure function
 * of time. It runs as a worklet on the UI thread with no per-frame state, so it
 * holds 60fps while the JS thread is busy loading the room underneath.
 *
 * Kept out of the component so it can be tested without rendering anything.
 */

/** Long enough for the slowest piece to fall past the bottom edge. */
export const CONFETTI_MS = 2200
/** Roughly when the burst hangs at its peak: the follow-up tray waits this long. */
export const CONFETTI_PEAK_MS = 700

const COUNT = 72
/** Air drag per second: how fast a piece gives up its launch speed. */
const DRAG = 4
/** px/s². With DRAG: a climb that peaks in ~0.55s, then a ~475px/s paper drift down. */
const GRAVITY = 1900
/** Launch spread, up to 90ms, so it reads as a burst rather than one frame. */
const STAGGER_MS = 90

/**
 * Brand colours only, so it reads as Blend'n and not a stock party. The pink
 * is the warm end the Figma gradient runs to (see `EMBER.accent`).
 */
export const CONFETTI_COLORS = [EMBER.accent, '#FF6D8D', EMBER.violet, EMBER.warning, EMBER.textPrimary] as const

export type ConfettiShape = 'ribbon' | 'square' | 'dot'

export type ConfettiPiece = {
  color: string
  shape: ConfettiShape
  w: number
  h: number
  /** Launch point, in the overlay's own coordinates. */
  x0: number
  y0: number
  /** Launch velocity in px/s. `vy` is negative, i.e. upwards. */
  vx: number
  vy: number
  delay: number
  /** Degrees at launch and degrees per second, in the screen's plane. */
  rot0: number
  spin: number
  /** Radians per second of the paper flip, drawn as `scaleY = cos(phase)`. */
  flip: number
  /** Side-to-side flutter on the way down. */
  swayAmp: number
  swayFreq: number
  phase: number
}

export type ConfettiFrame = { x: number; y: number; rotate: number; flipY: number; opacity: number }

export type ConfettiArea = {
  width: number
  height: number
  /** Distance of the launch point above the overlay's bottom edge. */
  originBottom: number
  /** Width of the button it bursts from: pieces start spread across it. */
  originWidth: number
}

/** How high a piece launched upwards at `speed` climbs before it turns, with drag. */
function apexHeight(speed: number): number {
  return speed / DRAG - (GRAVITY / (DRAG * DRAG)) * Math.log(1 + (speed * DRAG) / GRAVITY)
}

/** The launch speed that climbs `height` px. Bisection: `apexHeight` has no closed inverse. */
function speedForApex(height: number): number {
  let lo = 0
  let hi = 20_000
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (apexHeight(mid) < height) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export function buildConfetti(area: ConfettiArea, seed = 1): ConfettiPiece[] {
  const rand = seeded(seed)
  const between = (a: number, b: number) => a + (b - a) * rand()
  const y0 = area.height - area.originBottom

  return Array.from({ length: COUNT }, (_, i) => {
    const roll = rand()
    const shape: ConfettiShape = roll < 0.6 ? 'ribbon' : roll < 0.9 ? 'square' : 'dot'
    const size = between(6, 10)
    // Peaks land between 12% and 45% from the top: the top third, never offscreen.
    const apexY = area.height * between(0.12, 0.45)
    return {
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      shape,
      w: shape === 'ribbon' ? size * 0.45 : size,
      h: shape === 'ribbon' ? size * 1.7 : size,
      x0: area.width / 2 + between(-0.4, 0.4) * area.originWidth,
      y0,
      // Horizontal travel settles at vx / DRAG: up to 60% of the width either side.
      vx: between(-0.6, 0.6) * area.width * DRAG,
      vy: -speedForApex(Math.max(0, y0 - apexY)),
      delay: between(0, STAGGER_MS),
      rot0: between(0, 360),
      spin: between(-240, 240),
      flip: between(6, 14),
      swayAmp: between(6, 18),
      swayFreq: between(3, 6),
      phase: between(0, Math.PI * 2),
    }
  })
}

/**
 * A piece at `ms` after the burst began. A worklet so the component can call
 * it from `useAnimatedStyle`, and plain enough for Jest to call directly.
 */
export function pieceAt(p: ConfettiPiece, ms: number, height: number): ConfettiFrame {
  'worklet'
  const t = Math.max(0, ms - p.delay) / 1000
  const decay = 1 - Math.exp(-DRAG * t)
  const terminal = GRAVITY / DRAG
  // Sway only once the climb is spent, so the launch stays a clean fan.
  const sway = p.swayAmp * Math.min(1, t / 0.6) * Math.sin(p.swayFreq * t + p.phase)

  const x = p.x0 + (p.vx / DRAG) * decay + sway
  const y = p.y0 + terminal * t + ((p.vy - terminal) / DRAG) * decay

  // Fades through the bottom 15% of the screen, and everything is gone by the end.
  const fadeLow = Math.min(1, Math.max(0, (height * 0.95 - y) / (height * 0.15)))
  const fadeEnd = Math.min(1, Math.max(0, (CONFETTI_MS - ms) / 300))
  const opacity = ms < p.delay ? 0 : Math.min(fadeLow, fadeEnd)

  return {
    x,
    y,
    rotate: p.rot0 + p.spin * t,
    flipY: p.shape === 'dot' ? 1 : Math.cos(p.flip * t + p.phase),
    opacity,
  }
}
