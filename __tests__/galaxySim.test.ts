/*
 * The landing's two galaxies (lib/galaxySim.ts, Toomre & Toomre 1972 with a halo drag): the physics the owner picked as
 * variant B, ported from the prototype (mockups/redesign-2026-11/galaxies/galaxySim.check.ts) unchanged in behaviour.
 * 1. Energy: drag off, the cores' energy drifts < 1% over the run; drag on, E(t) + dissipated(t) = E(0) to < 1%.
 * 2. Replay: one seed, one frame, byte for byte; another seed differs.
 * 3. Budget: a step of 2,000 stars stays inside a phone's frame with room (here with a JIT, so the bound is loose).
 * 4. The committed remnant (assets/galaxy/remnant.json) is the film's frame at END_AT, so Reduce Motion and the form
 *    screens show what the landing reached.
 * 5. After the physics stops the remnant keeps turning, with no end (owner, 2026-11-03: "keep it going until they sign up
 *    or sign in"): no more steps, only the camera's roll, redrawn every second frame.
 */
import REMNANT from '../assets/galaxy/remnant.json'
import {
  END_AT,
  FREEZE_AT,
  GALAXY_B,
  IDLE_REDRAW_S,
  SETTLE,
  STEPS_PER_SECOND,
  advanceFilm,
  coreEnergy,
  filmRemnant,
  idleTurn,
  init,
  separation,
  simSpeed,
  startFilm,
  step,
  turnSpeed,
  type GalaxyState,
} from '../lib/galaxySim'

const STEPS = FREEZE_AT * STEPS_PER_SECOND
const TOLERANCE = 0.01
const dt = 1 / STEPS_PER_SECOND
const { seed, physics } = GALAXY_B

function run(s: GalaxyState, each?: (s: GalaxyState) => void): void {
  for (let i = 0; i < STEPS; i++) {
    step(s, dt)
    each?.(s)
  }
}

const bytes = (a: Float32Array) => Buffer.from(a.buffer)

describe('energy', () => {
  it('drag off: the cores’ energy drifts under 1% over the 12 s run', () => {
    const free = init(seed, { ...physics, friction: 0 })
    const e0 = coreEnergy(free)
    let drift = 0
    run(free, (s) => (drift = Math.max(drift, Math.abs(coreEnergy(s) - e0) / Math.abs(e0))))
    expect(drift).toBeLessThan(TOLERANCE)
  })

  it('drag on: what the halos took plus what is left is what there was, to 1% of the energy in play', () => {
    const s = init(seed, physics)
    const e0 = coreEnergy(s)
    let worst = 0
    run(s, (x) => (worst = Math.max(worst, Math.abs(coreEnergy(x) + x.dissipated - e0))))
    expect(s.dissipated).toBeGreaterThan(0)
    expect(worst / Math.max(Math.abs(e0), s.dissipated)).toBeLessThan(TOLERANCE)
  })

  it('the drag is what merges them: the cores end inside each other', () => {
    const s = init(seed, physics)
    run(s)
    expect(separation(s)).toBeLessThan(0.1)
  })
})

describe('replay', () => {
  it('the same seed is the same frame, byte for byte; another seed is not', () => {
    const a = init(seed, physics)
    const b = init(seed, physics)
    const other = init(seed + 1, physics)
    run(a)
    run(b)
    run(other)
    expect(bytes(b.pos).equals(bytes(a.pos))).toBe(true)
    expect(bytes(other.pos).equals(bytes(a.pos))).toBe(false)
  })
})

describe('budget', () => {
  // The prototype measured 0.023 ms a step with a JIT and 1.29 ms interpreted (M1 Pro); a phone's UI runtime is the
  // interpreter, and the drive is what measures it there. Under jest the worklets plugin's transform runs it about 0.8 ms
  // a step alone, more on a loaded runner, so this only catches an order-of-magnitude regression: an allocation in
  // `step`, or stars feeling each other (O(n²), seconds a step).
  const CEILING_MS = 5

  it('a step of 2,000 stars stays far inside a frame', () => {
    const s = init(1, physics)
    for (let i = 0; i < 300; i++) step(s, dt)
    const n = 500
    const t0 = performance.now()
    for (let i = 0; i < n; i++) step(s, dt)
    expect(s.n).toBe(2000)
    expect((performance.now() - t0) / n).toBeLessThan(CEILING_MS)
  })
})

describe('the film', () => {
  it('runs at full speed and slows to a stop by 12 s; the turn takes over and holds at full, with no end', () => {
    expect(simSpeed(FREEZE_AT - SETTLE)).toBe(1)
    expect(simSpeed(FREEZE_AT - SETTLE / 2)).toBeCloseTo(0.5, 5)
    expect(simSpeed(FREEZE_AT)).toBe(0)
    expect(turnSpeed(FREEZE_AT - SETTLE)).toBe(0)
    expect(turnSpeed(FREEZE_AT - SETTLE / 2)).toBeCloseTo(0.5, 5)
    expect(turnSpeed(FREEZE_AT)).toBe(1)
    expect(turnSpeed(END_AT)).toBe(1)
    expect(turnSpeed(END_AT + 3600)).toBe(1)
  })

  it('the committed remnant is the film’s frame at END_AT, 2,000 stars and the two cores', () => {
    const fresh = filmRemnant()
    expect(REMNANT.n).toBe(physics.stars)
    expect(REMNANT.xy).toHaveLength(2 * (physics.stars + 2))
    expect(REMNANT.xy).toEqual(fresh)
  })
})

describe('playback (advanceFilm, one call a frame)', () => {
  const FRAME = 1 / 60

  it('at 60 fps: two steps a frame until the slow-down, every frame a new one while the physics runs', () => {
    const f = startFilm(physics.stars)
    for (let frames = 1; frames <= END_AT * 60; frames++) {
      if (f.tau < FREEZE_AT) expect(advanceFilm(f, FRAME)).toBe(true)
      else advanceFilm(f, FRAME)
      if (frames === 60) expect(f.s.t).toBeCloseTo(1, 5)
    }
    expect(f.tau).toBeCloseTo(END_AT, 5)
    // 10.5 s at full speed, then half of the 1.5 s cosine: 1,350 steps, as the prototype's film (to a step: it sampled
    // the slow-down 8 times a frame, this once).
    expect(Math.abs(Math.round(f.s.t * STEPS_PER_SECOND) - 1350)).toBeLessThanOrEqual(1)
    expect(f.coarse).toBe(false)
  })

  it('after the physics stops: no more steps, the turn goes on at 3°/s for as long as it runs, redrawn every second frame', () => {
    const f = startFilm(physics.stars)
    for (let i = 0; i < END_AT * 60; i++) advanceFilm(f, FRAME)
    const steps = f.s.t
    const pos = bytes(f.s.pos)
    const turn = f.turn
    let redraws = 0
    // A minute, then ten more.
    for (let i = 0; i < 660 * 60; i++) if (advanceFilm(f, FRAME)) redraws++
    expect(f.s.t).toBe(steps)
    expect(bytes(f.s.pos).equals(pos)).toBe(true)
    expect(Math.abs(f.turn - turn)).toBeCloseTo(660 * GALAXY_B.look.turn, 3)
    expect(Math.sign(f.turn - turn)).toBe(f.spin)
    expect(redraws).toBe(330 * 60)
    expect(IDLE_REDRAW_S).toBeGreaterThan(FRAME)
    expect(IDLE_REDRAW_S).toBeLessThanOrEqual(2 * FRAME)
  })

  it('a frame that falls just short of the redraw (jitter) still redraws on the next, never a third', () => {
    const f = startFilm(physics.stars)
    for (let i = 0; i < END_AT * 60; i++) advanceFilm(f, FRAME)
    expect(advanceFilm(f, FRAME * 0.9)).toBe(false)
    expect(advanceFilm(f, FRAME * 0.9)).toBe(true)
  })

  it('idleTurn: the degrees the landing has turned past the remnant file’s frame, 0 before it, within one turn', () => {
    const f = startFilm(physics.stars)
    for (let i = 0; i < END_AT * 60; i++) advanceFilm(f, FRAME)
    expect(idleTurn(f)).toBeCloseTo(0, 3)
    for (let i = 0; i < 10 * 60; i++) advanceFilm(f, FRAME)
    expect(idleTurn(f)).toBeCloseTo(10 * GALAXY_B.look.turn, 3)
    for (let i = 0; i < 120 * 60; i++) advanceFilm(f, FRAME)
    expect(idleTurn(f)).toBeCloseTo((130 * GALAXY_B.look.turn) % 360, 3)
    const early = startFilm(physics.stars)
    advanceFilm(early, FRAME)
    expect(idleTurn(early)).toBe(0)
  })

  it('a hitch moves the film on by a tenth of a second, not by the gap', () => {
    const f = startFilm(physics.stars)
    advanceFilm(f, 5)
    expect(f.tau).toBeCloseTo(0.1, 5)
  })

  it('frames that run slow drop it to one double-length step: the same sim time for half the work', () => {
    const f = startFilm(physics.stars)
    for (let i = 0; i < 6; i++) advanceFilm(f, 1 / 30)
    expect(f.coarse).toBe(true)
    const before = f.s.t
    advanceFilm(f, 1 / 30)
    expect(f.s.t - before).toBeCloseTo(4 / STEPS_PER_SECOND, 5)
  })

  it('the low-end phone runs half the stars on the same orbit', () => {
    const full = startFilm(2000)
    const half = startFilm(1000)
    for (let i = 0; i < 300; i++) {
      advanceFilm(full, FRAME)
      advanceFilm(half, FRAME)
    }
    expect(half.s.n).toBe(1000)
    expect(Array.from(half.s.core)).toEqual(Array.from(full.s.core))
  })
})
