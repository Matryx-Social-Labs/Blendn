import { CREATURE_ART, CREATURE_HUES } from '../../lib/design/tokens'
import { fnv1a } from '../../lib/pseudonymAvatar'
import { CREATURE_SPECIES, faceMarkup, type CreatureMood, type CreatureSpecies } from './Creature'

/*
 * The crew huddle ("B · Huddle refined", owner-approved 2026-11-12, SCRUM-1053): three of the crew's own characters, seeded
 * from `emblemSeed` and nothing else, dressed as a crew (a jersey in the crew's edge tone, a cream scarf, cream mitts, heads
 * in the crew's hue). A person is a bare head on a disc; a crew is a team in kit, on a squircle.
 *
 * Ported from the design's renderer, ~/blendn-design-export/mockups/redesign-2026-11/crew-emblems/B-refined/huddle.js,
 * string for string: `huddleMarkup` is its `huddle2`, and `__tests__/dsCrewEmblem.test.tsx` holds it to the renderer's own
 * output byte for byte (1,800 stills and scene frames). An edit here is a design change, made there first.
 *
 * The scene poses are worklets: `CrewEmblem` runs them on the UI thread, one frame at a time.
 */

type Hue = { k: string; f: string; e: string; g: string }
const HUES: readonly Hue[] = CREATURE_HUES.map((h) => ({ k: h.name, f: h.fill, e: h.edge, g: h.glyph }))
const C = CREATURE_ART.cream
const W = CREATURE_ART.white
const n2 = (v: number) => +(+v).toFixed(2)
const seedN = (s: string) => Math.abs(fnv1a(String(s)))
const mix = (a: string, b: string, t: number) =>
  '#' +
  [1, 3, 5]
    .map((i) =>
      Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')

/** The squircle every emblem is cut to, in its 24 box. */
export const SQ24 = 'M12 0C20.64 0 24 3.36 24 12C24 20.64 20.64 24 12 24C3.36 24 0 20.64 0 12C0 3.36 3.36 0 12 0Z'

/** Left out: panda, eagle and swan keep natural colours and cannot wear the crew's hue; crane, heron and griffin have necks that fight the scarf. */
export const HUDDLE_EXCLUDED: readonly CreatureSpecies[] = ['panda', 'eagle', 'swan', 'crane', 'heron', 'griffin']
export const HUDDLE_CAST: readonly CreatureSpecies[] = CREATURE_SPECIES.filter((s) => !HUDDLE_EXCLUDED.includes(s))
/** A crew is never angry: no fierce face. */
export const HUDDLE_MOODS: readonly CreatureMood[] = (['happy', 'sleepy', 'fierce', 'sly', 'curious'] as const).filter((m) => m !== 'fierce')

export type HuddleTier = 'lead' | 'trio' | 'scene'
/** The size picks the tier: ≤ 28 a two-face stack, ≤ 80 three faces, larger the full scene with bunting and a floor. */
export const LEAD_MAX = 28
export const TRIO_MAX = 80
export const tierOf = (size: number): HuddleTier => (size <= LEAD_MAX ? 'lead' : size <= TRIO_MAX ? 'trio' : 'scene')

// fnv1a of salted strings is correlated in its low bits; the murmur3 finaliser fixes it (the design's note).
const fmix = (h: number) => {
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}
const pickN = (salt: string, seed: string) => fmix(seedN(salt + seed))

export type HuddleKey = { hue: number; front: CreatureSpecies; left: CreatureSpecies; right: CreatureSpecies; moods: [CreatureMood, CreatureMood, CreatureMood] }

/** A crew's look, from its seed alone: never from a name or a member, so it holds as people come and go. */
export function huddleKey(seed: string): HuddleKey {
  const k = fmix(seedN(seed))
  const picks: CreatureSpecies[] = []
  for (let i = 0; picks.length < 3 && i < 12; i++) {
    const sp = HUDDLE_CAST[pickN('sp' + i, seed) % HUDDLE_CAST.length]
    if (!picks.includes(sp)) picks.push(sp)
  }
  const mood = (salt: string) => HUDDLE_MOODS[pickN('md' + salt, seed) % HUDDLE_MOODS.length]
  return { hue: k % 8, front: picks[0], left: picks[1], right: picks[2], moods: [mood('f'), mood('l'), mood('r')] }
}

// ── motion: per character { dx, dy, rot, arm: [left, right] in degrees (0 = down, 150 = up), mood, cup } ─────────
export type Pose = { dx?: number; dy?: number; rot?: number; arm?: number[]; mood?: CreatureMood; cup?: boolean }
export type FxKind = '' | 'spark' | 'clink' | 'z'

const bump = (t: number, a: number, b: number) => {
  'worklet'
  return t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI)
}
const ease = (t: number) => {
  'worklet'
  return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t)
}

export type CrewScene = 'cheer' | 'dance' | 'clink' | 'highfive' | 'wave' | 'sleepy'
type SceneDef = {
  ms: number
  pose: (t: number, i: number) => Pose
  fx?: (t: number) => FxKind
  /** The back pair's high five: the front ducks and is drawn first, so the hands meet above it. */
  frontFirst?: boolean
  /** Ends on its last frame, drawn still (the sleepy lean). */
  hold?: boolean
  /** The faces a character may wear during the scene, besides its own. */
  moods: readonly CreatureMood[]
}

/** The six scenes, each played once on its moment (NOTES §7, Problem 3). `t` runs 0 → 1 over `ms`. */
export const SCENES: Record<CrewScene, SceneDef> = {
  cheer: {
    ms: 1100,
    moods: ['happy'],
    pose: (t, i) => {
      'worklet'
      const h = bump(t, 0.05 + i * 0.08, 0.55 + i * 0.08)
      return { dy: -2.6 * h, arm: [150 * ease(t * 3 - i * 0.3), 150 * ease(t * 3 - i * 0.3)].map((a) => a * (1 - ease((t - 0.8) * 5))), mood: 'happy' }
    },
    fx: (t) => {
      'worklet'
      return t > 0.35 && t < 0.85 ? 'spark' : ''
    },
  },
  dance: {
    ms: 1400,
    moods: ['happy'],
    pose: (t, i) => {
      'worklet'
      const s = Math.sin(t * Math.PI * 4 + (i === 0 ? 0 : i === 1 ? 0.6 : -0.6)) * (1 - ease((t - 0.8) * 5))
      return {
        rot: 9 * s,
        dx: 0.8 * s,
        dy: -1.1 * Math.abs(Math.sin(t * Math.PI * 4)) * (1 - ease((t - 0.8) * 5)),
        arm: [70 + 50 * s, 70 - 50 * s].map((a) => a * (1 - ease((t - 0.85) * 6))),
        mood: i === 0 ? 'happy' : undefined,
      }
    },
  },
  clink: {
    ms: 1300,
    moods: ['happy'],
    pose: (t, i) => {
      'worklet'
      const up = ease(t * 2.2) * (1 - ease((t - 0.82) * 5))
      const lean = i === 1 ? 9 : i === 2 ? -9 : 0
      return { rot: lean * up, arm: i === 1 ? [0, 120 * up] : i === 2 ? [120 * up, 0] : [0, 150 * up], cup: up > 0.05, mood: t > 0.45 ? 'happy' : undefined }
    },
    fx: (t) => {
      'worklet'
      return t > 0.45 && t < 0.8 ? 'clink' : ''
    },
  },
  highfive: {
    ms: 1100,
    moods: ['happy', 'curious'],
    frontFirst: true,
    pose: (t, i) => {
      'worklet'
      const r = ease(t * 2.5) * (1 - ease((t - 0.7) * 4))
      return i === 1
        ? { rot: 10 * r, dy: -2.4 * r, arm: [0, 150 * r] }
        : i === 2
          ? { rot: -10 * r, dy: -2.4 * r, arm: [150 * r, 0] }
          : { dy: 1.6 * r - 1.8 * bump(t, 0.6, 0.95), mood: t > 0.42 ? 'happy' : 'curious' }
    },
    fx: (t) => {
      'worklet'
      return t > 0.4 && t < 0.72 ? 'spark' : ''
    },
  },
  wave: {
    ms: 1300,
    moods: ['happy'],
    pose: (t, i) => {
      'worklet'
      const on = ease((t - i * 0.1) * 4) * (1 - ease((t - 0.8) * 5))
      return { arm: [0, (140 + 25 * Math.sin((t - i * 0.1) * Math.PI * 6)) * on], rot: 3 * on * Math.sin(t * Math.PI * 3), mood: on > 0.3 ? 'happy' : undefined }
    },
  },
  sleepy: {
    ms: 1600,
    moods: ['sleepy'],
    hold: true,
    pose: (t, i) => {
      'worklet'
      const l = ease(t * 1.6)
      return { rot: i === 1 ? 13 * l : i === 2 ? -13 * l : 0, dx: i === 1 ? 1.2 * l : i === 2 ? -1.2 * l : 0, dy: (i === 0 ? 1 : 0.6) * l, mood: t > 0.35 ? 'sleepy' : undefined }
    },
    fx: (t) => {
      'worklet'
      return t > 0.45 ? 'z' : ''
    },
  },
}
export const CREW_SCENES = Object.keys(SCENES) as CrewScene[]

// ── one character: jersey, scarf, head, arms (24 grid, head centred near 12,13) ─────────────────────────────
export const ARM_Y = 20.4
export const ARM_LENGTH = 8.6
/** Where each arm hangs from, left and right, in the character's 24 box. */
export const ARM_X = [5.8, 18.2] as const

export function armMarkup(x: number, side: number, deg: number, c: Hue, cup?: boolean): string {
  const a = ((deg * Math.PI) / 180) * side
  const ex = n2(x + Math.sin(a) * ARM_LENGTH)
  const ey = n2(ARM_Y + Math.cos(a) * ARM_LENGTH)
  return `<path d="M${x} ${ARM_Y}L${ex} ${ey}" stroke="${c.e}" stroke-width="2.6" stroke-linecap="round"/>${cup ? mugMarkup(ex, ey, c) : ''}${mittMarkup(ex, ey)}`
}
export const mittMarkup = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="1.8" fill="${C}"/>`
export const mugMarkup = (ex: number, ey: number, c: Hue) =>
  `<rect x="${n2(ex - 1.5)}" y="${n2(ey - 3.6)}" width="3" height="3.4" rx=".7" fill="${C}"/><rect x="${n2(ex - 1.5)}" y="${n2(ey - 2.4)}" width="3" height=".8" fill="${c.e}"/>`

/** The kit under the head: a jersey in the crew's edge tone and the cream team scarf. */
export const kitMarkup = (c: Hue) =>
  `<path d="M3.4 30C3.4 23.6 7.2 20.4 12 20.4S20.6 23.6 20.6 30Z" fill="${c.e}"/>` +
  `<path d="M6.6 19.6Q12 22.4 17.4 19.6L17.8 21.6Q12 24.8 6.2 21.6Z" fill="${C}"/><path d="M7.4 20.9Q12 23.3 16.6 20.9" stroke="${c.e}" stroke-width=".55" fill="none"/><path d="M14.6 22.2l.9 4.2 1.8-.4-.6-4.4Z" fill="${C}"/>`

function character(species: CreatureSpecies, mood: CreatureMood, c: Hue, hueIdx: number, p: Pose = {}): string {
  const [al, ar] = p.arm || [0, 0]
  // Arms after the head, so a raised mitt or a cup reads beside it.
  return kitMarkup(c) + faceMarkup(species, p.mood || mood, hueIdx) + (al ? armMarkup(ARM_X[0], -1, al, c, p.cup) : '') + (ar ? armMarkup(ARM_X[1], 1, ar, c, p.cup) : '')
}
const place = (cx: number, cy: number, s: number, p: Pose, body: string) =>
  `<g transform="translate(${n2(cx - 12 * s + (p.dx || 0))} ${n2(cy - 12 * s + (p.dy || 0))}) scale(${s})"><g transform="rotate(${n2(p.rot || 0)} 12 26)">${body}</g></g>`

/** Where each character stands, per tier: [slot (0 front, 1 left, 2 right), cx, cy, scale], back to front. */
export type Spot = readonly [slot: 0 | 1 | 2, cx: number, cy: number, s: number]
export function spotsOf(tier: HuddleTier): readonly Spot[] {
  if (tier === 'lead') return [[2, 17.2, 10.2, 0.5], [0, 10.6, 14.2, 0.74]]
  const s = tier === 'scene' ? [0.46, 0.46, 0.56] : [0.5, 0.5, 0.6]
  return [[1, 6.2, 12.6, s[0]], [2, 17.8, 12.6, s[1]], [0, 12, 15.2, s[2]]]
}

export const floorMarkup = (c: Hue) => `<ellipse cx="12" cy="24.6" rx="13" ry="3.4" fill="${mix(c.f, c.e, 0.35)}"/>`
export const buntingMarkup = (c: Hue) =>
  `<path d="M1 3.4Q12 7.2 23 3.4" stroke="${c.g}" stroke-width=".3" fill="none" opacity=".8"/>` +
  [3.4, 7.4, 11.4, 15.4, 19.4]
    .map((x, i) => {
      const y = n2(3.4 + 3.8 * Math.sin(((x - 1) / 22) * Math.PI) * 0.92)
      return `<path d="M${n2(x - 1)} ${y}h2l-1 2.1Z" fill="${i % 2 ? C : c.e}"/>`
    })
    .join('')

/** The three sparks, at their centres; a spark is drawn at scale `s` about its centre. */
export const SPARKS = [[4, 4], [20, 4.6], [12, 2.6]] as const
export const sparkScale = (t: number) => {
  'worklet'
  return 0.6 + 0.6 * Math.sin(t * 14)
}
export const sparkMarkup = (x: number, y: number, s: number) =>
  `<path d="M${x} ${n2(y - 1.6 * s)}L${n2(x + 0.5 * s)} ${n2(y - 0.5 * s)}L${n2(x + 1.6 * s)} ${y}L${n2(x + 0.5 * s)} ${n2(y + 0.5 * s)}L${x} ${n2(y + 1.6 * s)}L${n2(x - 0.5 * s)} ${n2(y + 0.5 * s)}L${n2(x - 1.6 * s)} ${y}L${n2(x - 0.5 * s)} ${n2(y - 0.5 * s)}Z" fill="${W}"/>`
export const CLINK_MARKUP = `<path d="M12 1.6v1.6M9.8 2.4l.9 1.2M14.2 2.4l-.9 1.2" stroke="${W}" stroke-width=".7" stroke-linecap="round"/>`
/** The two z's: their rise `u` (0 → 1) from t = 0.45, at twice the scene's pace. */
export const zRise = (t: number) => {
  'worklet'
  return Math.min(1, (t - 0.45) * 2)
}
export const Z_FONT = 'Satoshi,system-ui'
const zMarkup = (c: Hue, u: number) =>
  `<text x="${n2(17 + u)}" y="${n2(6 - 2 * u)}" font-family="${Z_FONT}" font-weight="800" font-size="3.4" fill="${c.g}" opacity="${n2(u)}">z</text><text x="${n2(19.6 + u)}" y="${n2(3.6 - 1.6 * u)}" font-family="${Z_FONT}" font-weight="800" font-size="2.4" fill="${c.g}" opacity="${n2(u * 0.8)}">z</text>`

function fxMarkup(kind: FxKind, c: Hue, t: number): string {
  if (kind === 'spark') return SPARKS.map(([x, y]) => sparkMarkup(x, y, sparkScale(t))).join('')
  if (kind === 'clink') return CLINK_MARKUP
  if (kind === 'z') return zMarkup(c, zRise(t))
  return ''
}

/** The high five's window in which the front character is drawn behind the back pair. */
export const frontGoesFirst = (t: number) => {
  'worklet'
  return t > 0.15 && t < 0.8
}

export const hueOf = (seed: string): Hue => HUES[huddleKey(seed).hue]

/** The plate: the squircle in the crew's fill with the edge tone's glow from above. `id` keeps this instance's ids its own. */
export const plateMarkup = (id: string, c: Hue) =>
  `<defs><clipPath id="${id}c"><path d="${SQ24}"/></clipPath><radialGradient id="${id}g" cx="12" cy="9" r="16" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c.e}" stop-opacity=".55"/><stop offset="1" stop-color="${c.f}" stop-opacity="0"/></radialGradient></defs><path d="${SQ24}" fill="${c.f}"/><path d="${SQ24}" fill="url(#${id}g)"/>`
export const edgeMarkup = (c: Hue) => `<path d="${SQ24}" fill="none" stroke="${c.e}" stroke-width="1.1" opacity=".9"/>`

/**
 * The emblem as the design's markup: the rest pose (the still, and the Reduce Motion one), or a scene at `t` (0..1).
 * `id` prefixes the clip and glow ids, so two emblems on one screen never share them.
 */
export function huddleMarkup(seed: string, size: number, id: string, opts: { scene?: CrewScene; t?: number } = {}): string {
  const k = huddleKey(seed)
  const c = HUES[k.hue]
  const tier = tierOf(size)
  const sc = opts.scene ? SCENES[opts.scene] : undefined
  const t = opts.t
  const pose = (i: number): Pose => (sc && t != null ? sc.pose(t, i) : {})
  const species = [k.front, k.left, k.right] as const
  const drawn = (spot: Spot) => {
    const [slot, cx, cy, s] = spot
    const p = pose(slot)
    return place(cx, cy, s, p, character(species[slot], k.moods[slot], c, k.hue, p))
  }
  const spots = spotsOf(tier)
  let body: string
  if (tier === 'lead') {
    body = spots.map(drawn).join('')
  } else {
    const extras = tier === 'scene' ? floorMarkup(c) + buntingMarkup(c) : ''
    const back = drawn(spots[0]) + drawn(spots[1])
    const front = drawn(spots[2])
    body = extras + (sc && sc.frontFirst && t != null && frontGoesFirst(t) ? front + back : back + front)
    if (sc && sc.fx && t != null) body += fxMarkup(sc.fx(t), c, t)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${plateMarkup(id, c)}<g clip-path="url(#${id}c)">${body}</g>${edgeMarkup(c)}</svg>`
}


export { HUES as HUDDLE_HUES, mix as mixHex, n2 as round2 }
export type { Hue as HuddleHue }
