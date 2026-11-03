/**
 * Two galaxies colliding: a restricted N-body model after Toomre & Toomre 1972, "Galactic Bridges and Tails".
 *
 * Two massive cores (softened Plummer potentials) fall together on a near-parabolic orbit. Test stars start on circular
 * orbits in a disk around each core, feel both cores and not each other. Toomre's cores fly apart again; real pairs
 * merge because their dark halos drag on each other (dynamical friction), so the cores carry a drag on their relative
 * velocity, weighted by how much the halos overlap. The work it does is kept in `dissipated`, so energy is still
 * checkable: E(t) + dissipated(t) = E(0).
 *
 * Built to run unchanged in a Reanimated worklet: no DOM, no Math.random (a seeded mulberry32), Float32Array buffers,
 * no allocation in `step`. `step` mutates the state in place on purpose: a copy per frame is 48 KB of garbage at 60 fps.
 * Units: G = 1. Time is sim time; the caller maps it to seconds.
 */

export type DiskParams = {
  /** Innermost and outermost ring radius. */
  inner: number
  outer: number
  /** Exponential scale length: stars per ring follow r·exp(-r/scale). */
  scale: number
  rings: number
  /** Tilt of the disk out of the orbital plane, radians. */
  inclination: number
  /** Where the tilt's axis points in the orbital plane, radians. */
  node: number
  /** +1 turns with the orbit (prograde, long tails), -1 against it. */
  spin: number
}

export type GalaxyParams = {
  stars: number
  /** Share of the stars in disk A (ember). The rest are B (violet). */
  shareA: number
  massA: number
  massB: number
  /** Closest approach of the two cores' orbit if nothing dragged on them. */
  pericentre: number
  /** 1 is parabolic; just under 1 lets the pair come back for a second pass. */
  eccentricity: number
  /** Separation at t = 0, inbound. */
  startSeparation: number
  /** Plummer softening between the cores, and between a star and a core. */
  softening: number
  starSoftening: number
  /** Halo drag on the cores' relative velocity, and the halo radius it fades over. */
  friction: number
  frictionRadius: number
  diskA: DiskParams
  diskB: DiskParams
}

export type GalaxyState = {
  /** Stars; [0, nA) belong to A. */
  n: number
  nA: number
  t: number
  massA: number
  massB: number
  softening: number
  starSoftening: number
  friction: number
  frictionRadius: number
  /** Work done by the halo drag so far (positive). */
  dissipated: number
  /** Cores: xA yA zA vxA vyA vzA xB yB zB vxB vyB vzB. */
  core: Float32Array
  /** Stars, xyz interleaved. */
  pos: Float32Array
  vel: Float32Array
  /** Per star 0..1, for size and alpha variation in the renderer. */
  look: Float32Array
}

/** mulberry32 over a one-word state, so nothing closes over a counter. */
export function rand(seed: Uint32Array): number {
  'worklet'
  seed[0] = (seed[0] + 0x6d2b79f5) >>> 0
  let x = seed[0]
  x = Math.imul(x ^ (x >>> 15), x | 1)
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296
}

function placeDisk(
  s: GalaxyState, seed: Uint32Array, d: DiskParams, mass: number, from: number, count: number, c: number,
): void {
  'worklet'
  const cx = s.core[c], cy = s.core[c + 1], cz = s.core[c + 2]
  const vx0 = s.core[c + 3], vy0 = s.core[c + 4], vz0 = s.core[c + 5]
  // The disk's frame: tilt about the line of nodes (in the orbital plane at angle `node`).
  const cn = Math.cos(d.node), sn = Math.sin(d.node), ci = Math.cos(d.inclination), si = Math.sin(d.inclination)
  // Ring weights: circumference × exponential surface density.
  let total = 0
  for (let k = 0; k < d.rings; k++) {
    const r = d.inner + ((d.outer - d.inner) * k) / Math.max(1, d.rings - 1)
    total += r * Math.exp(-r / d.scale)
  }
  let placed = 0
  for (let k = 0; k < d.rings && placed < count; k++) {
    const r = d.inner + ((d.outer - d.inner) * k) / Math.max(1, d.rings - 1)
    const want = k === d.rings - 1 ? count - placed : Math.round((count * r * Math.exp(-r / d.scale)) / total)
    const m = Math.min(want, count - placed)
    const phase = rand(seed) * Math.PI * 2
    const e2 = s.starSoftening * s.starSoftening
    for (let j = 0; j < m; j++) {
      const i = from + placed + j
      const rr = r * (1 + (rand(seed) - 0.5) * 0.04)
      const a = phase + (j / m) * Math.PI * 2 + (rand(seed) - 0.5) * 0.02
      const v = d.spin * Math.sqrt((mass * rr * rr) / Math.pow(rr * rr + e2, 1.5))
      // In-disk position and velocity.
      const px = rr * Math.cos(a), py = rr * Math.sin(a)
      const ux = -v * Math.sin(a), uy = v * Math.cos(a)
      // Into the line-of-nodes frame, tilt about x, back.
      const qx = px * cn + py * sn, qy = -px * sn + py * cn
      const wx = ux * cn + uy * sn, wy = -ux * sn + uy * cn
      const ty = qy * ci, tz = qy * si, ty2 = wy * ci, tz2 = wy * si
      s.pos[3 * i] = cx + qx * cn - ty * sn
      s.pos[3 * i + 1] = cy + qx * sn + ty * cn
      s.pos[3 * i + 2] = cz + tz
      s.vel[3 * i] = vx0 + wx * cn - ty2 * sn
      s.vel[3 * i + 1] = vy0 + wx * sn + ty2 * cn
      s.vel[3 * i + 2] = vz0 + tz2
      s.look[i] = rand(seed)
    }
    placed += m
  }
}

export function init(seed: number, p: GalaxyParams): GalaxyState {
  'worklet'
  const n = p.stars
  const nA = Math.round(n * p.shareA)
  const s: GalaxyState = {
    n, nA, t: 0, massA: p.massA, massB: p.massB, softening: p.softening, starSoftening: p.starSoftening,
    friction: p.friction, frictionRadius: p.frictionRadius, dissipated: 0,
    core: new Float32Array(12), pos: new Float32Array(3 * n), vel: new Float32Array(3 * n), look: new Float32Array(n),
  }
  const word = new Uint32Array(1)
  word[0] = seed >>> 0
  // Relative orbit B - A: a conic with pericentre q, inbound at separation r0, in the x-y plane.
  const M = p.massA + p.massB, e = p.eccentricity, q = p.pericentre
  const semi = q * (1 + e)
  const cosf = Math.max(-1, Math.min(1, (semi / p.startSeparation - 1) / e))
  const f = -Math.acos(cosf)
  const r = semi / (1 + e * Math.cos(f))
  const h = Math.sqrt(M / semi)
  const rx = r * Math.cos(f), ry = r * Math.sin(f)
  const vr = h * e * Math.sin(f), vt = h * (1 + e * Math.cos(f))
  const vx = vr * Math.cos(f) - vt * Math.sin(f), vy = vr * Math.sin(f) + vt * Math.cos(f)
  const wA = p.massB / M, wB = p.massA / M
  s.core[0] = -wA * rx; s.core[1] = -wA * ry; s.core[2] = 0
  s.core[3] = -wA * vx; s.core[4] = -wA * vy; s.core[5] = 0
  s.core[6] = wB * rx; s.core[7] = wB * ry; s.core[8] = 0
  s.core[9] = wB * vx; s.core[10] = wB * vy; s.core[11] = 0
  placeDisk(s, word, p.diskA, p.massA, 0, nA, 0)
  placeDisk(s, word, p.diskB, p.massB, nA, n - nA, 6)
  return s
}

/**
 * The halo drag on the cores' relative velocity for h. It only touches the relative motion (momentum is conserved), so
 * the energy it takes is exactly μ/2 (|u|² - |u'|²), and that goes into `dissipated`.
 */
function drag(s: GalaxyState, h: number): void {
  'worklet'
  const c = s.core
  const dx = c[6] - c[0], dy = c[7] - c[1], dz = c[8] - c[2]
  const M = s.massA + s.massB
  // Halo overlap: a Plummer profile in the separation, so the drag is strongest when the cores sit inside each other.
  const k = s.friction * Math.pow(1 + (dx * dx + dy * dy + dz * dz) / (s.frictionRadius * s.frictionRadius), -1.5)
  const ux = c[9] - c[3], uy = c[10] - c[4], uz = c[11] - c[5]
  const kh = Math.min(1, k * h)
  s.dissipated += 0.5 * ((s.massA * s.massB) / M) * (ux * ux + uy * uy + uz * uz) * (1 - (1 - kh) * (1 - kh))
  const wA = (s.massB / M) * kh, wB = (s.massA / M) * kh
  c[3] += wA * ux; c[4] += wA * uy; c[5] += wA * uz
  c[9] -= wB * ux; c[10] -= wB * uy; c[11] -= wB * uz
}

/** Half a kick of gravity: the cores on each other, and both cores on every star. */
function kick(s: GalaxyState, h: number): void {
  'worklet'
  const c = s.core
  const dx = c[6] - c[0], dy = c[7] - c[1], dz = c[8] - c[2]
  const inv = 1 / Math.pow(dx * dx + dy * dy + dz * dz + s.softening * s.softening, 1.5)
  c[3] += h * s.massB * dx * inv; c[4] += h * s.massB * dy * inv; c[5] += h * s.massB * dz * inv
  c[9] -= h * s.massA * dx * inv; c[10] -= h * s.massA * dy * inv; c[11] -= h * s.massA * dz * inv
  const e2 = s.starSoftening * s.starSoftening
  const ax = c[0], ay = c[1], az = c[2], bx = c[6], by = c[7], bz = c[8]
  const ma = s.massA * h, mb = s.massB * h
  const pos = s.pos, vel = s.vel
  for (let i = 0, j = 0; i < s.n; i++, j += 3) {
    const x = pos[j], y = pos[j + 1], z = pos[j + 2]
    const ex = ax - x, ey = ay - y, ez = az - z
    const fx = bx - x, fy = by - y, fz = bz - z
    const da = ex * ex + ey * ey + ez * ez + e2
    const db = fx * fx + fy * fy + fz * fz + e2
    const ga = ma / (da * Math.sqrt(da)), gb = mb / (db * Math.sqrt(db))
    vel[j] += ga * ex + gb * fx
    vel[j + 1] += ga * ey + gb * fy
    vel[j + 2] += ga * ez + gb * fz
  }
}

/**
 * One leapfrog step (kick-drift-kick), with the drag split symmetrically around it (Strang: drag, kick, drift, kick,
 * drag) so the whole step stays second order. Fixed dt keeps gravity symplectic and the replay exact per seed.
 */
export function step(s: GalaxyState, dt: number): void {
  'worklet'
  const h = dt * 0.5
  drag(s, h)
  kick(s, h)
  const c = s.core
  for (let k = 0; k < 3; k++) {
    c[k] += dt * c[k + 3]
    c[k + 6] += dt * c[k + 9]
  }
  const pos = s.pos, vel = s.vel, m = 3 * s.n
  for (let j = 0; j < m; j++) pos[j] += dt * vel[j]
  kick(s, h)
  drag(s, h)
  s.t += dt
}

/** The cores' kinetic plus softened potential energy. */
export function coreEnergy(s: GalaxyState): number {
  'worklet'
  const c = s.core
  const dx = c[6] - c[0], dy = c[7] - c[1], dz = c[8] - c[2]
  const kin = 0.5 * s.massA * (c[3] * c[3] + c[4] * c[4] + c[5] * c[5]) + 0.5 * s.massB * (c[9] * c[9] + c[10] * c[10] + c[11] * c[11])
  return kin - (s.massA * s.massB) / Math.sqrt(dx * dx + dy * dy + dz * dz + s.softening * s.softening)
}

export function separation(s: GalaxyState): number {
  'worklet'
  const c = s.core
  return Math.hypot(c[6] - c[0], c[7] - c[1], c[8] - c[2])
}

/*
 * Everything above is the prototype's physics, unchanged (mockups/redesign-2026-11/galaxies/galaxySim.ts). Below: the
 * owner's pick (variant B, "Dramatic", 2026-11-02) and the film's timing, which the landing and the remnant script share.
 */

const deg = (d: number) => (d * Math.PI) / 180
const disk = (o: Partial<DiskParams>): DiskParams => ({
  inner: 0.1, outer: 0.75, scale: 0.32, rings: 28, inclination: 0, node: 0, spin: 1, ...o,
})

/**
 * Variant B: a close pass, both disks prograde (Toomre's Antennae set-up), so two long tails and an ember-violet bridge
 * across the lockup at 4–6 s; merged by about 10 s. `look` is the camera (roll, then tilt, orthographic; sim units to pt
 * on the 390 pt frame) and the stars' size (pt) and alpha ranges.
 */
export const GALAXY_B = {
  seed: 4038,
  physics: {
    stars: 2000, shareA: 0.5, massA: 0.5, massB: 0.5,
    pericentre: 0.6, eccentricity: 0.9, startSeparation: 3,
    softening: 0.15, starSoftening: 0.12, friction: 0.7, frictionRadius: 0.5,
    diskA: disk({ inclination: deg(10), node: deg(0), spin: 1, outer: 0.85 }),
    diskB: disk({ inclination: deg(40), node: deg(60), spin: 1, outer: 0.85 }),
  } satisfies GalaxyParams,
  look: { scale: 125, roll: deg(-30), tilt: deg(22), size: [1.0, 2.8], alpha: [0.32, 0.85], turn: 3 },
} as const

/** Fixed steps per second of film: 2 per frame at 60 fps. Film time is sim time. */
export const STEPS_PER_SECOND = 120
/** The physics runs at full speed until FREEZE_AT - SETTLE, then slows to a stop at FREEZE_AT. */
export const FREEZE_AT = 12
export const SETTLE = 1.5
/** The remnant's turn takes over as the physics slows and eases to still here; nothing is drawn after it. */
export const END_AT = 14

/** Sim speed at film time t: 1, easing to 0 over the last SETTLE seconds before FREEZE_AT. */
export function simSpeed(t: number): number {
  'worklet'
  const a = FREEZE_AT - SETTLE
  if (t <= a) return 1
  if (t >= FREEZE_AT) return 0
  return 0.5 + 0.5 * Math.cos((Math.PI * (t - a)) / SETTLE)
}

/**
 * The remnant's turn, 0 to 1 of `look.turn` (deg/s): it takes over as the physics slows, then eases out on a cosine to
 * still at END_AT. The prototype decayed it exponentially and never quite stopped; this one ends, so the frame callback can.
 */
export function turnSpeed(t: number): number {
  'worklet'
  if (t <= FREEZE_AT - SETTLE || t >= END_AT) return 0
  const out = t <= FREEZE_AT ? 1 : 0.5 + 0.5 * Math.cos((Math.PI * (t - FREEZE_AT)) / (END_AT - FREEZE_AT))
  return (1 - simSpeed(t)) * out
}

/** +1 when the cores orbit anticlockwise in the orbital plane: the remnant turns the way the orbit went. */
export function orbitSense(s: GalaxyState): number {
  'worklet'
  const c = s.core
  return Math.sign((c[6] - c[0]) * (c[10] - c[4]) - (c[7] - c[1]) * (c[9] - c[3])) || 1
}

/** The camera: roll by `ang` in the orbital plane, tilt it away by the angle whose cosine and sine are ct, st. y points down. */
export function viewX(x: number, y: number, ca: number, sa: number): number {
  'worklet'
  return x * ca - y * sa
}

export function viewY(x: number, y: number, z: number, ca: number, sa: number, ct: number, st: number): number {
  'worklet'
  return -((x * sa + y * ca) * ct - z * st)
}

/** Decimals the remnant is stored to: a thousandth of a sim unit is an eighth of a point on screen. */
const REMNANT_DECIMALS = 3

/**
 * The film's last frame, as the landing would draw it at END_AT: each star's, then each core's, (x, y) in sim units from
 * the centre of mass, after the camera and the remnant's turn. `scripts/galaxy-remnant.mjs` writes it to
 * assets/galaxy/remnant.json; the app never runs this.
 */
export function filmRemnant(): number[] {
  const { seed, physics, look } = GALAXY_B
  const s = init(seed, physics)
  const dt = 1 / STEPS_PER_SECOND
  const spin = orbitSense(s)
  // The prototype's clock: 1/480 s slices, so the step count and the turn come out as its film's did.
  const slice = 1 / (60 * 8)
  let tau = 0
  let acc = 0
  let turn = 0
  while (tau < END_AT - 1e-9) {
    const d = Math.min(END_AT - tau, slice)
    acc += simSpeed(tau + d / 2) * d * STEPS_PER_SECOND
    turn += turnSpeed(tau + d / 2) * d * look.turn * spin
    tau += d
    while (acc >= 1) {
      step(s, dt)
      acc -= 1
    }
  }
  const ang = look.roll + deg(turn)
  const ca = Math.cos(ang), sa = Math.sin(ang), ct = Math.cos(look.tilt), st = Math.sin(look.tilt)
  // `|| 0`: JSON writes -0 as 0, so the file and a fresh run compare equal.
  const round = (v: number) => Number(v.toFixed(REMNANT_DECIMALS)) || 0
  const out: number[] = []
  const put = (x: number, y: number, z: number) => out.push(round(viewX(x, y, ca, sa)), round(viewY(x, y, z, ca, sa, ct, st)))
  for (let i = 0; i < s.n; i++) put(s.pos[3 * i], s.pos[3 * i + 1], s.pos[3 * i + 2])
  put(s.core[0], s.core[1], s.core[2])
  put(s.core[6], s.core[7], s.core[8])
  return out
}

/** The landing's playback, held on the UI runtime and mutated in place by `advanceFilm`, one call a frame. */
export type Film = {
  s: GalaxyState
  /** Film time, s. */
  tau: number
  /** Steps owed: fractional, carried frame to frame. */
  acc: number
  /** The remnant's turn so far, degrees, and the camera's roll as cos/sin for the renderer. */
  turn: number
  spin: number
  ca: number
  sa: number
  /** Consecutive slow frames, and whether the film has dropped to one double-length step at a time. */
  slow: number
  coarse: boolean
}

/** A frame later than this is a hitch (a pause, a cold start): the film moves on by this much, not by the whole gap. */
const MAX_FRAME_S = 0.1
/** Six frames in a row slower than 40 fps and the phone is short of time: half the steps, each twice as long. */
const SLOW_FRAME_S = 1 / 40
const SLOW_FRAMES = 6
/** Never more steps than this in one frame; debt beyond it is dropped, so a slow phone runs the film slower, not later. */
const MAX_STEPS_PER_FRAME = 4

// Defined before its callers: the worklets plugin turns a worklet into a const, so it is not hoisted.
function setCamera(f: Film): void {
  'worklet'
  const ang = GALAXY_B.look.roll + (f.turn * Math.PI) / 180
  f.ca = Math.cos(ang)
  f.sa = Math.sin(ang)
}

export function startFilm(stars: number): Film {
  'worklet'
  const s = init(GALAXY_B.seed, { ...GALAXY_B.physics, stars })
  const film: Film = { s, tau: 0, acc: 0, turn: 0, spin: orbitSense(s), ca: 1, sa: 0, slow: 0, coarse: false }
  setCamera(film)
  return film
}

/**
 * One frame of `seconds`: the physics in fixed steps at 120 a second (2 a frame at 60 fps), or at 60 a second once frames
 * run slow (the prototype's checks hold there too), and the remnant's turn. True once the film has reached its end.
 */
export function advanceFilm(f: Film, seconds: number): boolean {
  'worklet'
  const d = Math.min(Math.max(seconds, 0), MAX_FRAME_S)
  f.slow = d > SLOW_FRAME_S ? f.slow + 1 : 0
  if (f.slow >= SLOW_FRAMES) f.coarse = true
  const mid = f.tau + d / 2
  f.acc += simSpeed(mid) * d * STEPS_PER_SECOND
  f.turn += turnSpeed(mid) * d * GALAXY_B.look.turn * f.spin
  f.tau += d
  const per = f.coarse ? 2 : 1
  let steps = 0
  while (f.acc >= per && steps < MAX_STEPS_PER_FRAME) {
    step(f.s, per / STEPS_PER_SECOND)
    f.acc -= per
    steps++
  }
  if (steps === MAX_STEPS_PER_FRAME) f.acc = Math.min(f.acc, per)
  setCamera(f)
  // A hair under END_AT counts: summed frame times drift by an ulp or two.
  return f.tau >= END_AT - 1e-6
}
