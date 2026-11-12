import { memo, useEffect, useId, type ReactElement } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated'
import Svg, { Circle, ClipPath, Defs, G, parse, RadialGradient, Stop } from 'react-native-svg'

import { CREATURE_ART, CREATURE_HUES, DURATION, GLYPH, RADIUS, SPACE } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { castIndex, fnv1a, nounOf } from '../../lib/pseudonymAvatar'

/*
 * The anonymous faces ("C · Faces", owner-approved 2026-11-12, SCRUM-1047). One 24×24 face system: the noun picks the
 * species, the adjective the mood (eyes and mouth), the pseudonym's hash the hue.
 *
 * Ported from the design's renderer, ~/blendn-design-export/mockups/redesign-2026-11/creatures/full-set/creatures.js,
 * kit for kit and string for string: the face is built as the same SVG markup, then parsed once per look into
 * react-native-svg elements. `__tests__/dsCreatures.test.tsx` holds `faceMarkup` to the 650 approved SVGs byte for
 * byte, so an edit here is a design change, made there first.
 *
 * Owner rulings on top of the sheets: non-animal nouns draw from a friendlier cast (no cobra, viper or mantis);
 * laughing and dozing faces never blink; the panda stays black and white; the hue stays hash % 8.
 */

type Hue = { k: string; f: string; e: string; g: string }
const HUES: readonly Hue[] = CREATURE_HUES.map((h) => ({ k: h.name, f: h.fill, e: h.edge, g: h.glyph }))
const A = CREATURE_ART
const K = A.ink
const C = A.cream
const W = A.white
const RED = A.red
const GOLD = A.gold
const CHAR = A.char
const PINK = A.pink
const beakOf = (c: Hue) => (c.k === 'amber' ? A.beak : GOLD)

// ── svg helpers (24-unit space) ───────────────────────────────────────────
const n = (v: number) => +v.toFixed(2)
const sym = (s: string) => s + `<g transform="matrix(-1 0 0 1 24 0)">${s}</g>`
const P = (d: string, fill: string, x = '') => `<path d="${d}" fill="${fill}"${x}/>`
const R = (d: string, fill: string, w = 1.1) => P(d, fill, ` stroke="${fill}" stroke-width="${w}" stroke-linejoin="round"`)
const S = (d: string, stroke: string, w: number) => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`
const O = (cx: number, cy: number, r: number, fill: string) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`
const EL = (cx: number, cy: number, rx: number, ry: number, fill: string, rot?: number) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${rot ? ` transform="rotate(${rot} ${cx} ${cy})"` : ''}/>`
const ell = (cx: number, cy: number, rx: number, ry: number) => `M${n(cx - rx)} ${cy}a${rx} ${ry} 0 1 0 ${n(2 * rx)} 0a${rx} ${ry} 0 1 0 ${n(-2 * rx)} 0Z`
// A dark head (panther, raven, toucan, puffin, penguin) gets a glyph-tone rim so it never sinks into the disc.
const rim = (d: string, fill: string, c: Hue) => P(d, c.g, ` stroke="${c.g}" stroke-width="1.5" stroke-linejoin="round"`) + P(d, fill)

// ── shared parts ──────────────────────────────────────────────────────────
const HEAD = (c: Hue, cy = 13.6, rx = 7.3, ry = 6.7, fill = c.g) => EL(12, cy, rx, ry, fill)
const MUZZLE = (cy = 16.4, rx = 3.3, ry = 2.4) => EL(12, cy, rx, ry, C)
const roundEars = (fill: string, inner: string | null, x = 6.5, y = 7.4, r = 2.4, ri = 1.15) => sym(O(x, y, r, fill) + (inner ? O(x + 0.15, y + 0.15, ri, inner) : ''))
const catEars = (c: Hue, inner = c.e, fill = c.g) => sym(R('M5.4 4.4 10.4 8.2 6 11.8Z', fill, 1.3) + P('M6.6 6.6 9 8.5 6.9 10.2Z', inner))
const birdHead = (c: Hue, cy = 12.8, r = 7, fill = c.g) => O(12, cy, r, fill)
const horseHead = (c: Hue) =>
  P('M12 5.4c2.8 0 4.4 1.8 4.4 4.6 0 1.8-.4 3.2-.2 4.8.2 1.6.8 2.6.8 3.8 0 2-2.2 3.4-5 3.4s-5-1.4-5-3.4c0-1.2.6-2.2.8-3.8.2-1.6-.2-3-.2-4.8 0-2.8 1.6-4.6 4.4-4.6Z', c.g)
const horseEars = (c: Hue) => sym(R('M8.6 7.6 7.5 3.4 10.4 6.4Z', c.g, 1) + P('M8.6 6.6 8.1 4.6 9.5 6.1Z', c.e))
const horseMuzzle = () => EL(12, 18.4, 3.6, 2.6, C) + EL(10.6, 18.3, 0.55, 0.8, K) + EL(13.4, 18.3, 0.55, 0.8, K)
// Beaks: a small wedge, opened on a laugh.
const beakSmall = (c: Hue, open: boolean, y = 14.4, w = 1.7, h = 2.8) =>
  open
    ? R(`M${12 - w} ${y}h${2 * w}L12 ${y + h + 0.6}Z`, K, 0.8) + R(`M${12 - w} ${y}h${2 * w}L12 ${y + h * 0.5}Z`, beakOf(c), 0.8) + R(`M${12 - w * 0.55} ${y + h * 0.75}h${w * 1.1}L12 ${y + h + 0.6}Z`, beakOf(c), 0.6)
    : R(`M${12 - w} ${y}h${2 * w}L12 ${y + h}Z`, beakOf(c), 0.8)
const beakHook = (c: Hue, open: boolean, y = 13.6, fill: string = beakOf(c)) =>
  (open ? R(`M10.4 ${y + 2.6}h3.2L12 ${y + 5.6}Z`, K, 0.8) : '') + R(`M9.9 ${y}h4.2c0 2.3-.9 3.9-2.1 4.9-1.2-1-2.1-2.6-2.1-4.9Z`, fill, 0.8) + S(`M11.2 ${y + 0.9}h1.6`, K, 0.5)

// ── species kits ──────────────────────────────────────────────────────────
// art(c) = everything under the eyes; beak(c, open) = drawn over (birds); eye / mouth = where the mood goes.
// eye: y, dx (half spacing), r (sclera), bg ('g' | colour under the eye), sclera colour. mouth: kind, y, w.
type Paint = string | ((c: Hue) => string)
type Kit = {
  art: (c: Hue) => string
  eye?: { y?: number; dx?: number; r?: number; cx?: number; bg?: Paint; brow?: Paint; sclera?: Paint }
  mouth?: { kind: 'mammal' | 'snout' | 'beak'; y?: number; w?: number; ink?: Paint; nose?: Paint; tongue?: boolean }
  beak?: (c: Hue, open: boolean) => string
  dy?: number
}
type Species = Required<Pick<Kit, 'art' | 'eye' | 'mouth'>> & Pick<Kit, 'beak' | 'dy'> & { id: string }
const SP: Record<string, Species> = {}
const def = (id: string, o: Kit) => {
  SP[id] = { id, eye: {}, mouth: { kind: 'mammal', y: 17.4 }, ...o } as Species
}

// Big cats and small cats
def('panda', {
  art: (c) => roundEars(K, null, 6.3, 7.2, 2.5) + HEAD(c, 13.6, 7.3, 6.7, C) + sym(EL(9.1, 13.1, 2.4, 2.9, K, 28)),
  eye: { bg: K, brow: K }, mouth: { kind: 'mammal', y: 17.6 },
})
def('tiger', {
  art: (c) => roundEars(c.g, K, 6.4, 7.6, 2.3, 1.05) + HEAD(c) + MUZZLE() +
    S('M12 7v2.3M9.4 7.5l.7 1.7M14.6 7.5l-.7 1.7', K, 1) + sym(S('M4.9 13.2h2.1M5.2 15.5h1.8', K, 1)),
})
def('lion', {
  art: (c) => {
    let mane = O(12, 13.2, 8, c.e)
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; mane += O(n(12 + Math.cos(a) * 7.6), n(13.2 + Math.sin(a) * 7.6), 2.3, c.e) }
    return mane + roundEars(c.g, c.e, 7.6, 8.4, 1.8, 0.85) + O(12, 13.6, 5.7, c.g) + MUZZLE(16.6, 2.8, 2)
  },
  eye: { y: 13, dx: 2.4, r: 1.55 }, mouth: { kind: 'mammal', y: 17.4 },
})
def('panther', {
  art: (c) => { const ears = 'M5.4 4.4 10.4 8.2 6 11.8ZM18.6 4.4 13.6 8.2 18 11.8Z', head = ell(12, 13.6, 7.2, 6.6) // filled apart: one path with both would wind a hole where they overlap
    return P(ears + head, c.g, ` stroke="${c.g}" stroke-width="1.5" stroke-linejoin="round"`) + P(ears, K) + P(head, K) + sym(P('M6.6 6.6 9 8.5 6.9 10.2Z', c.f)) },
  eye: { bg: K, sclera: 'g' }, mouth: { kind: 'mammal', y: 17.4, ink: 'g', nose: 'e' },
})
def('jaguar', {
  art: (c) => catEars(c) + HEAD(c, 13.6, 7.2, 6.6) + MUZZLE(16.5, 3, 2.2) +
    [[8.3, 9.2], [12, 8.4], [15.7, 9.2], [5.8, 12.4], [18.2, 12.4], [6.6, 15.8], [17.4, 15.8]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".75" fill="none" stroke="${K}" stroke-width=".65"/>`).join(''),
})
def('cheetah', {
  art: (c) => catEars(c) + HEAD(c, 13.6, 7.2, 6.6) + MUZZLE(16.6, 2.6, 2) + sym(S('M10.2 14.2 9.5 17.3', K, 1)) +
    [[10.3, 8.8], [13.7, 8.8], [12, 7.8], [6.1, 13.2], [17.9, 13.2], [6.6, 15.6], [17.4, 15.6]].map(([x, y]) => O(x, y, 0.5, K)).join(''),
})
def('lynx', {
  art: (c) => sym(S('M5.5 4.6 5.3 2.9', K, 1.1)) + catEars(c) + sym(P('M5.4 14.2 3 16.8l2.6-.3-1 2.2 2.8-1.1c1.2 1.4 2.8 2.4 4.6 2.6V15Z', C)) +
    HEAD(c, 13.4, 7, 6.2) + MUZZLE(16.3, 2.9, 2.1),
  eye: { y: 12.6 }, mouth: { kind: 'mammal', y: 17.2 },
})
def('sphinx', {
  art: (c) => P('M12 3.6c-4.6 0-7 2.6-7.4 6.2L3.4 19.6h4.8l.8-4.2h6l.8 4.2h4.8l-1.2-9.8C19 6.2 16.6 3.6 12 3.6Z', c.e) +
    sym(S('M3.9 15.6h3.6M3.6 18h3.8', C, 0.9)) + S('M6.2 8c3.4-2.2 8.2-2.2 11.6 0', C, 0.9) +
    EL(12, 13.4, 4.7, 5.3, c.g) + MUZZLE(15.9, 2.3, 1.7) + R('M11.3 4.2h1.4l-.7 2.2Z', GOLD, 0.6),
  eye: { y: 12.4, dx: 2.1, r: 1.45 }, mouth: { kind: 'mammal', y: 16.8 },
})

// Canines
def('wolf', {
  art: (c) => sym(R('M5.2 3.4 10.6 8.4 5.4 11.6Z', c.g, 1.2) + P('M6.2 5.7 9.2 8.5 6.3 10.3Z', c.e)) +
    P('M12 6.8c4.2 0 7.2 2.8 7.4 6.6l1.2 1.4-1.6.6c-.8 3-3.6 5.4-7 5.4s-6.2-2.4-7-5.4l-1.6-.6 1.2-1.4C4.8 9.6 7.8 6.8 12 6.8Z', c.g) +
    P('M12 12.4c-1.4 0-2.2 1.6-3.4 2.6-1 .8-2.2 1-3.3.9.9 2.7 3.6 4.7 6.7 4.7s5.8-2 6.7-4.7c-1.1.1-2.3-.1-3.3-.9-1.2-1-2-2.6-3.4-2.6Z', C),
  eye: { y: 12.3, dx: 2.8 }, mouth: { kind: 'mammal', y: 17.6 },
})
def('coyote', {
  art: (c) => sym(R('M4.9 3.3 10.2 8.2 5.1 12Z', c.g, 1.2) + P('M5.9 5.3 8.9 8.3 5.8 10.6Z', c.e)) + HEAD(c, 13.8, 6.6, 6.6) +
    P('M12 7.2c-1.2 1.4-1.6 3-1.2 4.4h2.4c.4-1.4 0-3-1.2-4.4Z', c.e) +
    P('M12 13.6c-1.6 0-3 1.4-3.4 3 .5 1.8 1.8 3.2 3.4 3.2s2.9-1.4 3.4-3.2c-.4-1.6-1.8-3-3.4-3Z', C),
  eye: { y: 12.7, dx: 2.7, r: 1.65 }, mouth: { kind: 'mammal', y: 17.9 },
})
def('fox', {
  art: (c) => sym(R('M5 4.2 10.4 8.4 5.8 12Z', c.g, 1.2) + R('M5 4.2 7.4 6.1 5.3 7.6Z', K, 0.8)) + HEAD(c, 13.6, 7.4, 6.6) +
    P('M5.4 13c2 .1 4 1.3 6.6 4.35 2.6-3.05 4.6-4.25 6.6-4.35-.4 3.25-3 5.75-6.6 5.75S5.8 16.25 5.4 13Z', C),
  eye: { y: 12.5 }, mouth: { kind: 'mammal', y: 18.1 },
})

// Bears, small mammals
def('bear', { art: (c) => roundEars(c.g, c.e, 6.3, 7.4, 2.5, 1.25) + HEAD(c) + MUZZLE(16.4, 3.5, 2.6) })
def('koala', {
  art: (c) => sym(O(5.2, 10, 3.6, c.g) + O(5.4, 10.2, 2, C)) + HEAD(c, 14, 6.8, 6.4) + EL(12, 15.5, 1.55, 2.1, K),
  eye: { y: 13, dx: 3.2 }, mouth: { kind: 'snout', y: 18.6 },
})
def('otter', {
  art: (c) => roundEars(c.g, c.e, 5.3, 11.2, 1.5, 0.7) + EL(12, 14, 7.4, 6.4, c.g) + O(10.6, 16.6, 2.1, C) + O(13.4, 16.6, 2.1, C) +
    sym(O(9.6, 16.4, 0.3, K) + O(10.1, 17.4, 0.3, K)) + R('M10.6 14.8h2.8c0 .9-.7 1.4-1.4 1.4s-1.4-.5-1.4-1.4Z', K, 0.5),
  eye: { y: 12.4, dx: 3 }, mouth: { kind: 'snout', y: 17.9, w: 0.8 }, dy: -0.8,
})
def('badger', {
  art: (c) => roundEars(c.g, K, 6, 8.4, 1.7, 0.8) + HEAD(c, 13.6, 7.2, 6.6) +
    sym(P('M8.2 7.6c1.2-.4 2 .4 2.2 1.6l.8 7.4c.1 1-.5 1.6-1.3 1.4-1.3-.4-2.3-2.6-2.7-5.2-.4-2.2 0-4.8 1-5.2Z', K)),
  eye: { bg: K, y: 12.6, dx: 2.8, r: 1.6 }, mouth: { kind: 'mammal', y: 17.9 },
})
def('lemur', {
  art: (c) => sym(R('M5.6 9.4 3.2 5.6 8.2 7.6Z', C, 1)) + HEAD(c, 13.2, 7.2, 6.6) +
    P('M12 7.4c-3.4 0-5.6 2.4-5.6 5.4 0 2 1.4 3.4 3 4.4l2.6 3.2 2.6-3.2c1.6-1 3-2.4 3-4.4 0-3-2.2-5.4-5.6-5.4Z', C) +
    sym(P('M8.8 10.4c1.7 0 2.8 1.4 2.6 3-.2 1.4-1.4 2.1-2.7 1.9-1.5-.2-2.5-1.5-2.3-2.9.2-1.2 1-2 2.4-2Z', K)) +
    P('M12 15c.9 0 1.5.7 1.5 1.6 0 .9-.6 2-1.5 2s-1.5-1.1-1.5-2c0-.9.6-1.6 1.5-1.6Z', K),
  eye: { bg: K, brow: K, y: 12.7, dx: 2.9, r: 1.55, sclera: GOLD }, mouth: { kind: 'snout', y: 19.3, w: 0.7 },
})

// Hooved
def('bison', {
  art: (c) => sym(S('M6.2 9.8C3.8 9.6 2.8 7.6 3.4 5.6c.6 1.2 1.8 1.8 3.4 1.8', C, 1.5)) + sym(EL(4.6, 11.8, 1.8, 1, c.g, -20)) +
    P('M12 6.6c4 0 6.8 2.6 6.8 6.4 0 2.2-.8 3.6-1.8 4.8-1 1.4-2.6 2.6-5 2.6s-4-1.2-5-2.6C6 16.6 5.2 15.2 5.2 13c0-3.8 2.8-6.4 6.8-6.4Z', c.g) +
    O(9, 7.8, 2.2, c.e) + O(12, 6.8, 2.4, c.e) + O(15, 7.8, 2.2, c.e) + P('M9.4 19.2c.6 1.8 1.5 2.8 2.6 2.8s2-1 2.6-2.8Z', c.e) +
    EL(12, 17, 3.6, 2.3, C) + O(10.6, 16.7, 0.6, K) + O(13.4, 16.7, 0.6, K),
  eye: { y: 12.4, dx: 3.2, r: 1.6 }, mouth: { kind: 'snout', y: 18.4, w: 0.8 },
})
def('moose', {
  art: (c) => sym(P('M8.8 8.4C7.2 7.6 5.4 7.6 3.8 8.4 2.6 6.8 2.6 4.6 3.6 3.2c.5 1 1.1 1.6 1.9 1.6-.2-1.2.2-2.3 1-3.1.3 1.2.9 2 1.7 2.2.2-1 .8-1.7 1.6-2.1.5 2.1.3 4.6-1 6.6Z', C)) +
    sym(EL(6.2, 10.6, 1.9, 0.95, c.g, -25)) +
    P('M12 6.8c2.8 0 4.6 1.8 4.6 4.4 0 1.6-.2 2.6.4 4 .6 1.6.8 2.4.8 3.4 0 1.8-2.6 3.2-5.8 3.2s-5.8-1.4-5.8-3.2c0-1 .2-1.8.8-3.4.6-1.4.4-2.4.4-4 0-2.6 1.8-4.4 4.6-4.4Z', c.g) +
    EL(12, 18.4, 4.3, 2.6, c.e) + EL(10.4, 18.1, 0.55, 0.8, K) + EL(13.6, 18.1, 0.55, 0.8, K),
  eye: { y: 11.8, dx: 2.6, r: 1.6 }, mouth: { kind: 'snout', y: 19.8, w: 0.8 },
})
def('stag', {
  art: (c) => sym(S('M9.6 7.4C8 6 7.1 4.2 7.3 2.2M7.6 4.5 4.9 3.4M8.4 6.3 5.4 6.5', C, 1.4)) +
    sym(P('M7.4 9.6C5.6 9.8 3.8 9.2 2.8 7.9 4.2 7 6.4 7 8.2 8.1Z', c.g) + P('M6.9 9C5.8 9 4.8 8.7 4.1 8.1 5 7.7 6.3 7.8 7.3 8.4Z', c.e)) +
    P('M12 6.6c3 0 5.2 2.2 5.2 5 0 2.2-1 3.6-2 5.2-.8 1.4-1.6 3-3.2 3s-2.4-1.6-3.2-3c-1-1.6-2-3-2-5.2 0-2.8 2.2-5 5.2-5Z', c.g) +
    EL(12, 18, 2.4, 1.9, C),
  eye: { y: 11.8, dx: 2.6, r: 1.6 }, mouth: { kind: 'mammal', y: 19.1 },
})
def('gazelle', {
  art: (c) => sym(S('M10.4 7.2C10 5 9.4 3.2 8 1.9', C, 1.3) + S('M9.4 4.6l1-.3M8.7 3.3l.9-.4', K, 0.5)) +
    sym(P('M7.6 10C5.6 10.4 3.6 9.8 2.6 8.4 4.2 7.6 6.6 7.6 8.4 8.6Z', c.g)) +
    P('M12 6.4c2.8 0 4.6 2 4.6 4.8 0 2-.8 3.6-1.6 5.2-.8 1.8-1.4 3.6-3 3.6s-2.2-1.8-3-3.6c-.8-1.6-1.6-3.2-1.6-5.2 0-2.8 1.8-4.8 4.6-4.8Z', c.g) +
    sym(S('M10.2 10.2 11.1 16.4', C, 0.9) + S('M9.2 12.6 10.3 17.4', K, 0.9)) + EL(12, 18.4, 1.9, 1.5, C),
  eye: { y: 11.6, dx: 2.6, r: 1.5 }, mouth: { kind: 'mammal', y: 19.3, w: 0.8 },
})
def('horse', {
  art: (c) => horseEars(c) + horseHead(c) + P('M12 8.6c-.6 1.4-.8 3.4-.6 5.6h1.2c.2-2.2 0-4.2-.6-5.6Z', C) +
    P('M12 5.2c-1.6 0-2.8 1-3 2.4 1-.4 1.8-.2 2.4.6.2-1 .6-1.4 1-1.6.2 1 .8 1.6 1.8 1.8-.2-1.8-.8-3.2-2.2-3.2Z', c.e) + horseMuzzle(),
  eye: { y: 11.4, dx: 2.9, r: 1.6 }, mouth: { kind: 'snout', y: 19.9, w: 0.8 },
})
def('unicorn', {
  art: (c) => horseEars(c) + P('M14.4 6c2.8.2 4.9 2.3 5.3 5.2-1-.6-2-.8-2.9-.6.8.9 1.2 1.9 1.2 3.1-1-.8-2-1.2-2.9-1.2Z', c.e) + horseHead(c) +
    P('M8.8 7.2c.8-1.4 2-2 3.4-2 1.8 0 3 1 3.6 2.4-1.2-.4-2.4-.4-3.6 0-1.2-.6-2.2-.8-3.4-.4Z', c.e) +
    R('M12 1.2 10.8 6.4h2.4Z', C, 0.9) + S('M11.2 5.3l1.6-.5M11.5 3.8l1.1-.35', c.e, 0.5) + horseMuzzle(),
  eye: { y: 11.4, dx: 2.9, r: 1.6 }, mouth: { kind: 'snout', y: 19.9, w: 0.8 },
})
def('pegasus', {
  art: (c) => sym(P('M7.4 15.4C4.6 16.2 2.2 15 1.6 12.4c.9.4 1.8.4 2.5 0-.6-.8-.8-1.8-.5-2.8.7.8 1.5 1.2 2.4 1.2-.2-.8 0-1.6.6-2.2 1 2.2 1.2 4.6.8 6.8Z', C)) +
    horseEars(c) + horseHead(c) + P('M12 5.2c-1.6 0-2.8 1-3 2.4 1-.4 1.8-.2 2.4.6.2-1 .6-1.4 1-1.6.2 1 .8 1.6 1.8 1.8-.2-1.8-.8-3.2-2.2-3.2Z', c.e) + horseMuzzle(),
  eye: { y: 11.4, dx: 2.9, r: 1.6 }, mouth: { kind: 'snout', y: 19.9, w: 0.8 },
})

// Sea
def('dolphin', {
  art: (c) => P('M14 5.4c1.6-1.8 3.8-2.6 5.8-2.4-1 1.4-1.4 3.2-1.2 5Z', c.e) + sym(P('M6.2 17.4c-1.8.7-3.4.2-4.2-1 1.6-.4 3-1.1 4-2.3Z', c.g)) +
    P('M12 4.8c4.4 0 7.2 3.6 7.2 7.6 0 3-1.4 5.2-3.6 6.4H8.4C6.2 17.6 4.8 15.4 4.8 12.4c0-4 2.8-7.6 7.2-7.6Z', c.g) +
    S('M11.2 6.6q.8.6 1.6 0', K, 0.6) + EL(12, 17.6, 3.9, 2.4, C),
  eye: { y: 12, dx: 3.3, r: 1.65 }, mouth: { kind: 'snout', y: 17.9, w: 1.1 },
})
def('octopus', {
  // Redrawn: no skirt hem (that read as a ghost). A domed mantle sits back, and four thick arms curl OUT with suckers.
  art: (c) => sym(S('M8 14.8C5.6 15.4 4.1 17.2 4.6 19c.4 1.3 1.9 1.5 2.5.5', c.g, 2.3) + S('M10.2 16.2C9.4 18 9.3 19.8 10.2 20.7c.8.7 1.9.2 1.7-.8', c.g, 2.1) +
    O(5.5, 17.3, 0.38, C) + O(5, 18.9, 0.34, C) + O(9.8, 18.6, 0.34, C)) +
    P('M12 3.2c4.3 0 7.1 3 7.1 6.9 0 2.5-.8 4.3-2.2 5.7-1.2 1.2-2.9 1.9-4.9 1.9s-3.7-.7-4.9-1.9C5.7 14.4 4.9 12.6 4.9 10.1c0-3.9 2.8-6.9 7.1-6.9Z', c.g) +
    O(8.6, 7.2, 0.95, c.e) + O(14.9, 6.3, 0.65, c.e) + O(16.5, 9.3, 0.75, c.e),
  eye: { y: 11.6, dx: 2.6, r: 1.7 }, mouth: { kind: 'snout', y: 14.9, w: 0.7 },
})

// Raptors and mythic birds
def('eagle', {
  art: (c) => P('M4.6 19.6c1.6-1.4 3.2-1.8 4.6-1.4l2.8.7 2.8-.7c1.4-.4 3 0 4.6 1.4L17.4 24H6.6Z', c.e) + birdHead(c, 12.2, 6.9, C) +
    sym(P('M5.4 16.2 4.2 18.6l2.4-.8-.4 2 2-1.4Z', C)),
  eye: { y: 11.4, dx: 3.1, bg: C }, mouth: { kind: 'beak' }, beak: (c, o) => beakHook(c, o, 13.4),
})
def('falcon', {
  art: (c) => birdHead(c) + P('M5.3 14.4c1.7.7 4.1 1.1 6.7 1.1s5-.4 6.7-1.1c-.6 3.3-3.3 5.4-6.7 5.4s-6.1-2.1-6.7-5.4Z', C) +
    sym(P('M8.5 13.2c1 1.6 1 3.5 0 5.2-1-1.6-1.1-3.5 0-5.2Z', K)),
  eye: { y: 12.2, dx: 3.1 }, mouth: { kind: 'beak' }, beak: (c, o) => beakHook(c, o, 13.8),
})
def('hawk', {
  art: (c) => birdHead(c) + sym(S('M9.4 12.4 5.3 11.2', K, 1.5)) + EL(12, 17.8, 3.6, 2.4, C) +
    O(10.8, 18.4, 0.42, c.e) + O(13.2, 18.4, 0.42, c.e) + O(12, 19.3, 0.42, c.e),
  eye: { y: 12.3, dx: 3 }, mouth: { kind: 'beak' }, beak: (c, o) => beakHook(c, o, 13.8),
})
def('griffin', {
  art: (c) => sym(R('M7.8 7.8 5.4 2.6 10.2 6.2Z', c.g, 1.1) + P('M7.7 6.6 6.3 3.9 9.1 6Z', c.e)) + P('M4.8 19.6c2-2 4.4-2.4 7.2-2.4s5.2.4 7.2 2.4L18 24H6Z', c.e) + birdHead(c, 12.8, 6.8),
  eye: { y: 12.2, dx: 3 }, mouth: { kind: 'beak' }, beak: (c, o) => beakHook(c, o, 13.8, C),
})
def('phoenix', {
  art: (c) => sym(P('M9.6 7.4C7.8 6.4 7 4.4 7.6 2.6c1.2 1 2.2 2.6 2 4.8Z', c.e)) + P('M12 6.6C10.6 4.8 10.8 2.6 12 1.2c1.2 1.4 1.4 3.6 0 5.4Z', beakOf(c)) +
    sym(P('M5.6 14.4c-1.6.6-2.8 2-3 3.8 1.6-.2 2.8-1 3.6-2Z', beakOf(c))) + birdHead(c, 12.9, 6.8),
  eye: { y: 12.2, dx: 3 }, mouth: { kind: 'beak' }, beak: (c, o) => beakSmall(c, o, 14.4),
})
def('owl', {
  art: (c) => sym(R('M6.2 7.6 5 3.6 9.4 6.4Z', c.g, 1)) + EL(12, 13.2, 7.4, 7, c.g) + O(9, 12.6, 3.2, C) + O(15, 12.6, 3.2, C) +
    sym(S('M7.4 19.2l1 .8 1-.8', c.e, 0.7)),
  eye: { y: 12.6, dx: 3, r: 2.05, bg: C }, mouth: { kind: 'beak' }, beak: (c, o) => beakSmall(c, o, 14.8, 1, 1.9),
})
def('raven', {
  art: (c) => rim(ell(12, 12.8, 7, 7), CHAR, c) + P('M12 5.8c-.5-1.5.2-2.8 1.5-3.2 0 1 .4 1.7 1.1 2.2', CHAR),
  eye: { bg: CHAR, y: 11.8, dx: 3.1 }, mouth: { kind: 'beak' },
  beak: (c, o) => (o ? R('M10.6 16.4h2.8L12 19.4Z', K, 0.8) : '') + R('M10.1 13.6h3.8c.2 2.1-.6 4.1-1.9 5.4-1.3-1.3-2.1-3.3-1.9-5.4Z', A.ravenBeak, 0.8) + S('M12 14v4.2', CHAR, 0.5),
})

// Waders and water birds
def('crane', {
  art: (c) => birdHead(c, 12.6, 6.9) + P('M5.4 15.2c2 1.1 4.2 1.6 6.6 1.6s4.6-.5 6.6-1.6c-.4 2.8-3 4.8-6.6 4.8s-6.2-2-6.6-4.8Z', K) + EL(12, 6.9, 2.4, 1.4, RED),
  eye: { y: 11.8, dx: 3 }, mouth: { kind: 'beak' }, beak: (c, o) => (o ? R('M11.3 17.4h1.4L12 21Z', K, 0.6) : '') + R('M10.9 13.6h2.2l-.6 6.6h-1Z', beakOf(c), 0.7),
})
def('heron', {
  art: (c) => S('M15.4 6.6c2-.2 4 .4 5.6 1.8', K, 0.8) + S('M14.8 7.4c2.2.2 4 1.2 5.2 2.8', K, 0.7) + birdHead(c, 12.6, 6.9) +
    P('M12 5.8c-1 0-1.6 1.6-1.6 3.6 0 1.2.6 2 1.6 2s1.6-.8 1.6-2c0-2-.6-3.6-1.6-3.6Z', C) + S('M13.4 6.4c.9.2 1.6.6 2.2 1.2', K, 0.9) + EL(12, 18, 3, 2, C),
  eye: { y: 12, dx: 3 }, mouth: { kind: 'beak' }, beak: (c, o) => (o ? R('M11.4 17.6h1.2L12 21.4Z', K, 0.6) : '') + R('M11 13.6h2L12 21.4Z', beakOf(c), 0.7),
})
def('swan', {
  art: (c) => P('M9.4 15.6h5.2v8.6H9.4Z', C) + birdHead(c, 11.4, 6.3, C) + EL(12, 13.4, 1.9, 1.1, K),
  eye: { y: 11.2, dx: 2.8, r: 1.6, bg: C }, mouth: { kind: 'beak' },
  beak: (c, o) => (o ? R('M11.1 16.6h1.8L12 19Z', K, 0.6) : '') + R('M10.5 14h3l-.6 4.4h-1.8Z', A.beak, 0.7),
})
def('pelican', {
  art: (c) => R('M11.4 5 12 3l.6 2Z', C, 0.8) + birdHead(c, 10.4, 5.8) +
    P('M10 13.4h4c1.2 2.4 1.4 5 .4 7.6-.6 1.2-1.6 1.8-2.4 1.8s-1.8-.6-2.4-1.8c-1-2.6-.8-5.2.4-7.6Z', C) + S('M10.6 15.2c.6 2.4 2.2 4 2.8 4.4', c.e, 0.5),
  eye: { y: 10, dx: 2.6, r: 1.55 }, mouth: { kind: 'beak' },
  beak: (c, o) => R(`M10.2 12.6h3.6l-.6 ${o ? 4.2 : 5.6}h-2.4Z`, beakOf(c), 0.7) + (o ? R('M10.6 17.4h2.8L12 19Z', K, 0.6) : ''),
})
def('puffin', {
  art: (c) => rim(ell(12, 12.4, 7, 7), K, c) + P('M12 7.8c3.6 0 5.8 2.4 5.8 5.4 0 2.6-2.4 4.6-5.8 4.6s-5.8-2-5.8-4.6c0-3 2.2-5.4 5.8-5.4Z', C),
  eye: { y: 11.6, dx: 2.9, r: 1.5, bg: C }, mouth: { kind: 'beak' },
  beak: (c, o) => (o ? R('M10.7 16.8h2.6L12 19.6Z', K, 0.6) : '') + R(`M10 13.4h4l-.6 ${o ? 3 : 4.4}c-.4.8-1 1.2-1.4 1.2s-1-.4-1.4-1.2Z`, A.beak, 0.7) + R('M10 13.2h4v1.1h-4Z', A.puffinBand, 0.5) + S('M10.5 15.4h3', GOLD, 0.5),
})
def('penguin', {
  art: (c) => rim(ell(12, 12.8, 7, 7), K, c) + P('M12 9.6c1.2-1.4 4.6-1.6 5.2 1 .8 3.2-.8 7.4-5.2 8.6-4.4-1.2-6-5.4-5.2-8.6.6-2.6 4-2.4 5.2-1Z', C) +
    sym(P('M6 11c-.6 1.4-.4 2.8.6 3.8.2-1.4.6-2.6 1.4-3.4Z', GOLD)),
  eye: { y: 12.2, dx: 2.8, r: 1.55, bg: C }, mouth: { kind: 'beak' },
  beak: (c, o) => (o ? R('M11.2 16h1.6L12 17.6Z', K, 0.6) : '') + R(`M10.9 13.8h2.2L12 ${o ? 15.4 : 16.2}Z`, K, 0.7) + S('M11.2 14.4h1.6', A.beak, 0.5),
})

// Songbirds and parrots
def('dove', {
  art: (c) => birdHead(c, 12.6, 6.9) + P('M5.6 16.4c2 1.6 4 2.4 6.4 2.4s4.4-.8 6.4-2.4c0 2.8-2.8 4.6-6.4 4.6s-6.4-1.8-6.4-4.6Z', c.e) + EL(12, 14, 1.1, 0.6, C),
  eye: { y: 12, dx: 3 }, mouth: { kind: 'beak' }, beak: (c, o) => beakSmall(c, o, 14.4, 1, 2),
})
def('robin', {
  art: (c) => birdHead(c, 12.6, 6.9) + P('M5.4 15c1.4 2.4 3.8 4 6.6 4s5.2-1.6 6.6-4c-.1 3.6-3 6.4-6.6 6.4s-6.5-2.8-6.6-6.4Z', c.e),
  eye: { y: 11.8, dx: 3 }, mouth: { kind: 'beak' }, beak: (c, o) => beakSmall(c, o, 14, 1.2, 2.2),
})
def('finch', {
  art: (c) => birdHead(c, 12.8, 6.9) + sym(EL(7.2, 15.6, 1.7, 1.3, C)) + O(12, 15.4, 3.1, c.e),
  eye: { y: 12.2, dx: 3 }, mouth: { kind: 'beak' }, beak: (c, o) => beakSmall(c, o, 14.2, 1.5, 2.8),
})
def('wren', {
  art: (c) => P('M14.2 9.4c.6-2.8 2.2-5.2 4.8-6.2.6 2.8-.6 5.6-3 7.4Z', c.e) + S('M16 7.8l1.9 1M17 6.1l1.9.8M18.1 4.6l1.2.5', K, 0.6) +
    O(11.6, 13.2, 6.6, c.g),
  eye: { y: 12.6, dx: 2.9, cx: 11.6 }, mouth: { kind: 'beak' }, beak: (c, o) => `<g transform="translate(-.4 0)">${beakSmall(c, o, 15, 0.8, 2.2)}</g>`,
})
def('lark', {
  art: (c) => R('M10.4 7.2 11.6 2.4 13.4 7Z', c.g, 0.9) + R('M12.6 7 14.6 3.6 14.8 7.4Z', c.e, 0.8) + birdHead(c, 13, 6.8) +
    [[9.6, 8.2], [12, 7.6], [14.4, 8.2], [10.8, 9.2], [13.2, 9.2]].map(([x, y]) => O(x, y, 0.4, c.e)).join(''),
  eye: { y: 12.6, dx: 2.9 }, mouth: { kind: 'beak' }, beak: (c, o) => beakSmall(c, o, 14.8, 1, 2.2),
})
def('parrot', {
  art: (c) => P('M12 5.8c-.6-1.6 0-3.2 1.4-3.8 0 1.2.4 2 1.2 2.6', c.e) + birdHead(c, 12.6, 7) + sym(EL(8.6, 12.4, 2.9, 2.5, C) + S('M6.4 13.6h1.2M6.8 14.6h1', c.e, 0.45)),
  eye: { y: 12, dx: 3.1, bg: C, r: 1.6 }, mouth: { kind: 'beak' },
  beak: (c, o) => R(`M10.6 ${o ? 16.4 : 15.6}h2.8L12 ${o ? 19.4 : 18.6}Z`, K, 0.8) + R('M9.8 13.6c0-1.4 1-2.2 2.2-2.2s2.2.8 2.2 2.2c0 1.8-.8 3.2-2.2 4.2-1.4-1-2.2-2.4-2.2-4.2Z', C, 0.6),
})
def('toucan', {
  art: (c) => rim(ell(12, 11.4, 6.8, 6.8), K, c) + sym(EL(6.6, 14.2, 1.8, 2.4, C)) + O(8.8, 10.8, 2.35, c.e) + O(15.2, 10.8, 2.35, c.e),
  eye: { y: 10.8, dx: 3.2, r: 1.5, bg: (c) => c.e, brow: C }, mouth: { kind: 'beak' },
  beak: (c, o) => R(`M8.6 13.2h6.8c.6 2.6 0 5.4-1.6 7.6-.6.8-1.2 1.2-1.8 1.2s-1.2-.4-1.8-1.2c-1.6-2.2-2.2-5-1.6-7.6Z`, beakOf(c), 0.6) +
    P('M10.2 19.6h3.6c-.4.8-1 1.8-1.8 2.4-.8-.6-1.4-1.6-1.8-2.4Z', c.e) + S(o ? 'M9.4 16.6h5.2' : 'M12 13.6v5.4', K, 0.6),
})

// Reptiles, insects, dragons
def('dragon', {
  art: (c) => sym(P('M8.6 7.4C7.4 5.6 5.4 4.4 3.4 4.6c1.4.8 2.4 2 3 3.6Z', C) + P('M5.6 10.6 2.2 9.6l1.6 2.2-2 .9 2.2.9-1.3 1.8 3.2-.6Z', c.e)) +
    P('M12 5.8c3.8 0 6.4 2.6 6.4 6 0 1.6-.4 3-.4 4.2 0 2.6-2.6 4.6-6 4.6s-6-2-6-4.6c0-1.2-.4-2.6-.4-4.2 0-3.4 2.6-6 6.4-6Z', c.g) +
    R('M12 6.2 11.1 4.4h1.8Z', c.e, 0.7) + EL(12, 17.4, 3.6, 2.4, c.e) + O(10.7, 16.8, 0.5, K) + O(13.3, 16.8, 0.5, K),
  eye: { y: 12, dx: 3 }, mouth: { kind: 'snout', y: 18.5, w: 0.8 },
})
def('cobra', {
  art: (c) => P('M12 4.6c4.4 0 7.4 3.6 7.4 8.4 0 3-1.4 5.6-3.6 7.6L14 24h-4l-1.8-3.4C6 18.6 4.6 16 4.6 13c0-4.8 3-8.4 7.4-8.4Z', c.e) +
    sym(EL(7.3, 14.4, 0.9, 1.7, C, 10)) + P('M10.7 15.6h2.6v8.6h-2.6Z', C) + S('M10.7 18h2.6M10.7 20.4h2.6', c.e, 0.45) + EL(12, 11.4, 4, 4.6, c.g),
  eye: { y: 10.6, dx: 2, r: 1.35 }, mouth: { kind: 'snout', y: 13.9, w: 0.6, tongue: true },
})
def('viper', {
  art: (c) => P('M9.6 17h4.8v7.2H9.6Z', c.g) + P('M12 4.6c3.6 0 7 2.4 7.6 6 .4 2.4-.8 4.4-2.6 6-1.4 1.4-3 2.6-5 2.6s-3.6-1.2-5-2.6c-1.8-1.6-3-3.6-2.6-6 .6-3.6 4-6 7.6-6Z', c.g) +
    P('M12 5.6l1.2 1.4-1.2 1.4-1.2-1.4ZM12 9l1 1.2-1 1.2-1-1.2Z', K) + O(11, 15.2, 0.45, K) + O(13, 15.2, 0.45, K),
  eye: { y: 11.4, dx: 3.9, r: 1.5, sclera: GOLD }, mouth: { kind: 'snout', y: 16.9, w: 0.8, tongue: true },
})
def('gecko', {
  art: (c) => O(7.6, 10.2, 3.1, c.g) + O(16.4, 10.2, 3.1, c.g) + EL(12, 14.4, 7.6, 5.6, c.g) +
    [[12, 10.6, 0.7], [9.6, 16.8, 0.55], [14.6, 17.2, 0.6], [5.6, 14.4, 0.5], [18.4, 14.2, 0.5]].map(([x, y, r]) => O(x, y, r, c.e)).join(''),
  eye: { y: 10.2, dx: 4.4, r: 2.15, sclera: GOLD }, mouth: { kind: 'snout', y: 15.6, w: 1.5 },
})
def('mantis', {
  art: (c) => sym(S('M10.6 6.4C9.8 4.2 8.4 2.8 6.4 2.2', c.g, 0.7)) +
    P('M12 21c-1.2 0-2-1-2.8-2.2L5.2 11c-.8-1.6-.4-3.4 1.2-4C8 6.2 10 6 12 6s4 .2 5.6 1c1.6.6 2 2.4 1.2 4l-4 7.8C14 20 13.2 21 12 21Z', c.g) +
    sym(P('M11.2 19.4c-.4.8-.4 1.6 0 2.2l.6-1.4Z', c.e)),
  eye: { y: 9.6, dx: 4.4, r: 2.35 }, mouth: { kind: 'snout', y: 16, w: 0.7 },
})

// ── the mapping ───────────────────────────────────────────────────────────
export type CreatureSpecies = string
/** Every species, in the design's order. */
export const CREATURE_SPECIES: readonly CreatureSpecies[] = Object.keys(SP)

/**
 * The server's animal nouns (admin lib/anonymous-names.ts) and the species each draws: its own, except Mustang and
 * Stallion (the horse), Hydra (the dragon) and Kraken (the octopus). A noun not here is not an animal.
 */
export const CREATURE_NOUN_SPECIES: Readonly<Record<string, CreatureSpecies>> = {
  mustang: 'horse', stallion: 'horse', hydra: 'dragon', kraken: 'octopus',
  ...Object.fromEntries(
    ['panda', 'phoenix', 'dragon', 'falcon', 'tiger', 'wolf', 'eagle', 'dolphin', 'panther', 'jaguar', 'hawk', 'raven', 'owl', 'fox', 'bear', 'lion', 'stag', 'cobra', 'viper', 'crane', 'swan', 'otter', 'badger', 'lynx', 'moose', 'bison', 'gecko', 'mantis', 'heron', 'robin', 'finch', 'wren', 'lark', 'dove', 'parrot', 'toucan', 'pelican', 'puffin', 'penguin', 'koala', 'lemur', 'coyote', 'gazelle', 'cheetah', 'pegasus', 'griffin', 'unicorn', 'sphinx'].map((s) => [s, s])
  ),
}

/**
 * For a noun that is not an animal ("Cosmic Comet"): a seeded pick from every species but the cobra, viper and mantis
 * (owner, 2026-11-12: a friendlier cast). Seeded by the whole pseudonym, so "Cosmic Comet" and "Velvet Comet" differ (#384).
 */
export const CREATURE_CAST: readonly CreatureSpecies[] = CREATURE_SPECIES.filter((s) => s !== 'cobra' && s !== 'viper' && s !== 'mantis')

// The adjective is the face. Every server adjective is listed, so a new word cannot fall through unseen.
const MOODS = {
  happy: 'Sunny Lucky Laughing Dancing Singing Bouncing Sparkling Glowing Shining Radiant Vivid Golden Chirping Tumbling Leaping Whirling',
  sleepy: 'Dreamy Mellow Misty Gentle Silent Drifting Floating Lunar Twilight Dusk Midnight Velvet Humming Flowing Falling Frosty',
  fierce: 'Fierce Bold Brave Blazing Stormy Burning Crashing Rumbling Howling Rushing Daring Wild Crimson Electric Buzzing',
  sly: 'Clever Witty Shadow Phantom Hidden Mystic Cosmic Wandering Roaming Neon Urban Noble',
  curious: 'Silver Crystal Solar Stellar Arctic Tropical Emerald Sapphire Ruby Amber Jade Coral Ivory Dawn Swift Gleaming Rustic Soaring Rising Rolling Spinning',
} as const
export type CreatureMood = keyof typeof MOODS
export const CREATURE_MOODS = Object.keys(MOODS) as CreatureMood[]
const ADJ_MOOD: Record<string, CreatureMood> = Object.fromEntries(
  CREATURE_MOODS.flatMap((m) => MOODS[m].split(' ').map((w) => [w.toLowerCase(), m]))
)

/** "Cosmic Panda" → "cosmic"; "Cosmic Panda 2" (a collision suffix) → "cosmic". `nounOf`'s rule, for the first word. */
function adjectiveOf(pseudonym: string): string | null {
  const words = pseudonym.split(/\s+/).filter((w) => /^[A-Za-z]+$/.test(w))
  return words.length > 1 ? words[0].toLowerCase() : null
}

export type CreatureLook = { species: CreatureSpecies; mood: CreatureMood; hue: number }

/**
 * A pseudonym's face: the noun's species (or a seeded friendly one), the adjective's mood, and the hue, |FNV-1a| % 8 of
 * the whole pseudonym (`pseudonymAvatar`'s hash), so one person is one face everywhere under that name and a different
 * one at the next event. Feed it the `markSeed`, never a user id. Spread it into `<Creature>`.
 */
export function creatureFor(pseudonym: string): CreatureLook {
  const seed = pseudonym.trim() || 'anonymous'
  const h = Math.abs(fnv1a(seed))
  const noun = nounOf(seed)
  const adjective = adjectiveOf(seed)
  // `Object.hasOwn`: "constructor" is neither a creature nor a mood.
  return {
    species: noun && Object.hasOwn(CREATURE_NOUN_SPECIES, noun) ? CREATURE_NOUN_SPECIES[noun] : CREATURE_CAST[castIndex(h, CREATURE_CAST.length)],
    mood: adjective && Object.hasOwn(ADJ_MOOD, adjective) ? ADJ_MOOD[adjective] : 'curious',
    hue: h % HUES.length,
  }
}

// ── moods: eyes ───────────────────────────────────────────────────────────
const resolve = (v: Paint | undefined, c: Hue, d: string) =>
  v == null ? d : typeof v === 'function' ? v(c) : v === 'g' ? c.g : v === 'e' ? c.e : v === 'f' ? c.f : v
const isDark = (col: string) => [K, CHAR].includes(col as typeof K) || /^#[0-4]/.test(col)
const EYE_Y = 12.9

/**
 * The eyes in three parts: `open` (what the mood draws, and what a blink squeezes), `closed` (the closed lids a blink
 * passes through; empty for a face whose eyes are already closed, which therefore never blinks) and `brows` (they stay).
 * `open + brows` is the design's `eyes()`.
 */
function eyeParts(sp: Species, mood: CreatureMood, c: Hue): { open: string; closed: string; brows: string } {
  const e = sp.eye, y = e.y ?? EYE_Y, dx = e.dx ?? 2.9, r = e.r ?? 1.75
  const bg = resolve(e.bg, c, c.g), sclera = resolve(e.sclera, c, C), line = isDark(bg) ? C : K
  const ex = e.cx ?? 12, xs = [ex - dx, ex + dx]
  const open = (x: number, look = 0) => (bg === C || bg === sclera ? O(x, y, n(r + 0.35), K) : '') + O(x, y, r, sclera) +
    O(n(x + look * r * 0.38), n(y + r * 0.1), n(r * 0.64), K) + O(n(x + look * r * 0.38 + r * 0.3), n(y - r * 0.28), n(r * 0.25), W)
  const lw = n(Math.max(0.9, r * 0.6))
  const shut = xs.map((x) => S(`M${n(x - r)} ${n(y - r * 0.1)}Q${x} ${n(y + r * 1.25)} ${n(x + r)} ${n(y - r * 0.1)}`, line, lw)).join('')
  if (mood === 'happy') return { open: xs.map((x) => S(`M${n(x - r)} ${n(y + r * 0.35)}Q${x} ${n(y - r * 1.45)} ${n(x + r)} ${n(y + r * 0.35)}`, line, lw)).join(''), closed: '', brows: '' }
  if (mood === 'sleepy') return { open: shut, closed: '', brows: '' }
  if (mood === 'sly') {
    // The lid is the top segment of the eye (sclera plus ring), filled with whatever the eye sits on.
    const Rl = (bg === C || bg === sclera ? r + 0.35 : r) + 0.25, d = r * 0.35, hw = n(Math.sqrt(Rl * Rl - d * d)), yl = n(y - d)
    return { open: xs.map((x) => open(x, 1) + P(`M${n(x - hw)} ${yl}A${n(Rl)} ${n(Rl)} 0 0 1 ${n(x + hw)} ${yl}Z`, bg) + S(`M${n(x - hw)} ${yl}h${n(2 * hw)}`, line, lw)).join(''), closed: shut, brows: '' }
  }
  const brow = resolve(e.brow, c, line)
  const brows = mood === 'fierce'
    ? S(`M${n(xs[0] - r * 1.25)} ${n(y - r * 1.75)}L${n(xs[0] + r * 0.95)} ${n(y - r * 1.05)}M${n(xs[1] + r * 1.25)} ${n(y - r * 1.75)}L${n(xs[1] - r * 0.95)} ${n(y - r * 1.05)}`, brow, lw)
    : ''
  return { open: xs.map((x) => open(x)).join(''), closed: shut, brows }
}

// ── moods: mouths ─────────────────────────────────────────────────────────
function mouth(sp: Species, mood: CreatureMood, c: Hue): string {
  const m = sp.mouth
  if (m.kind === 'beak') return sp.beak ? sp.beak(c, mood === 'happy') : ''
  const y = m.y as number, w = m.w ?? 1, ink = resolve(m.ink, c, K), x = (v: number) => n(12 + v * w)
  const nose = m.kind === 'mammal' ? R(`M11 ${n(y - 1.85)}h2l-1 1.15Z`, resolve(m.nose, c, K), 0.75) : ''
  const tongue = m.tongue && mood !== 'sleepy' ? S(`M12 ${n(y + 0.5)}v1.4l-.6.7M12 ${n(y + 1.9)}l.6.7`, RED, 0.55) : ''
  const lines: Record<CreatureMood, string> = {
    // A cat's "w" needs a nose above it; on a bare snout it reads as a moustache, so a snout gets a small smile.
    curious: m.kind === 'mammal' ? S(`M${x(-1.5)} ${y}q${n(0.75 * w)} .8 ${n(1.5 * w)} 0q${n(0.75 * w)} .8 ${n(1.5 * w)} 0`, ink, 0.8)
      : S(`M${x(-1.1)} ${y}q${n(1.1 * w)} .9 ${n(2.2 * w)} 0`, ink, 0.8),
    happy: P(`M${x(-1.7)} ${n(y - 0.2)}h${n(3.4 * w)}c0 2.3-${n(3.4 * w)} 2.3-${n(3.4 * w)} 0Z`, ink) + EL(12, n(y + 1.05), n(0.85 * w), 0.45, PINK),
    sleepy: S(`M${x(-0.7)} ${n(y + 0.25)}q${n(0.7 * w)} .55 ${n(1.4 * w)} 0`, ink, 0.8),
    fierce: S(`M${x(-1.4)} ${n(y + 0.75)}q${n(1.4 * w)}-1 ${n(2.8 * w)} 0`, ink, 0.85),
    sly: S(`M${x(-1.3)} ${n(y + 0.2)}q${n(1.4 * w)} .8 ${n(2.6 * w)}-.6`, ink, 0.8),
  }
  return nose + (mood === 'happy' ? '' : tongue) + lines[mood]
}

// ── the face, in layers ───────────────────────────────────────────────────
/** -1 → 7, 2.7 → 2, NaN → 0: a bad index draws a hue rather than throwing. */
function hueIndex(hue: number): number {
  const len = HUES.length
  return Number.isFinite(hue) ? ((Math.trunc(hue) % len) + len) % len : 0
}
const kitOf = (species: string) => SP[Object.hasOwn(SP, species) ? species : 'fox']

type Layers = { art: string; open: string; closed: string; over: string; dy: number; eyeY: number }
// Built once per look, so a grid of hundreds builds each distinct face once. At most 50 × 5 × 8 = 2,000 entries.
const layers = new Map<string, Layers>()
function layersOf(species: CreatureSpecies, mood: CreatureMood, hue: number): Layers {
  const key = `${species}|${mood}|${hueIndex(hue)}`
  const known = layers.get(key)
  if (known) return known
  const sp = kitOf(species), c = HUES[hueIndex(hue)]
  const { open, closed, brows } = eyeParts(sp, mood, c)
  const built = { art: sp.art(c), open, closed, over: brows + mouth(sp, mood, c), dy: sp.dy ?? 0, eyeY: (sp.eye.y ?? EYE_Y) + (sp.dy ?? 0) }
  layers.set(key, built)
  return built
}
const shift = (dy: number, s: string) => (dy ? `<g transform="translate(0 ${dy})">${s}</g>` : s)

/** The face over its disc, as the design's markup (the body of its `svg()`): what the approved SVGs hold. */
export function faceMarkup(species: CreatureSpecies, mood: CreatureMood, hue: number): string {
  const l = layersOf(species, mood, hue)
  return shift(l.dy, l.art + l.open + l.over)
}

// Parsed once per distinct markup: 2,000 looks at most, a few parts each.
// ponytail: an unbounded Map, bounded in practice by the 2,000 looks (a few parts each); no eviction needed.
const parsed = new Map<string, ReactElement | null>()
function elementsOf(markup: string): ReactElement | null {
  if (!markup) return null
  let el = parsed.get(markup)
  if (el === undefined) {
    const parts = parse(`<g>${markup}</g>`)?.children
    el = parts ? <G>{parts}</G> : null
    parsed.set(markup, el)
  }
  return el
}

const BLINK = GLYPH.blink

/**
 * The eyes squeezed to a line and back, once, then still (Foundations C "glyph verb, once"): scaleY 1 → 0.1 → 1 over
 * 260 ms, the closed lids shown below 0.15 as the design's frames draw them. Waits for the sheet or page to land first.
 */
function BlinkLayers({ size, open, closed, eyeY }: { size: number; open: string; closed: string; eyeY: number }) {
  const s = useSharedValue(1)
  // The eye line, from the box's centre, in pt: scaleY turns about it.
  const about = (eyeY / 24 - 0.5) * size
  useEffect(() => {
    s.value = withDelay(
      DURATION.long,
      withSequence(withTiming(BLINK.closedScale, { duration: BLINK.close }), withTiming(BLINK.closedScale, { duration: BLINK.hold }), withTiming(1, { duration: BLINK.open }))
    )
  }, [s])
  const openStyle = useAnimatedStyle(() => ({
    opacity: s.value > BLINK.lidBelow ? 1 : 0,
    transform: [{ translateY: about }, { scaleY: s.value }, { translateY: -about }],
  }))
  const closedStyle = useAnimatedStyle(() => ({ opacity: s.value > BLINK.lidBelow ? 0 : 1 }))
  return (
    <>
      <Animated.View testID="creature-blink" collapsable={false} pointerEvents="none" style={[StyleSheet.absoluteFill, openStyle]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          {elementsOf(open)}
        </Svg>
      </Animated.View>
      <Animated.View collapsable={false} pointerEvents="none" style={[StyleSheet.absoluteFill, closedStyle]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          {elementsOf(closed)}
        </Svg>
      </Animated.View>
    </>
  )
}

/** The blinking face: the eyes on their own layer between the head and the brows and mouth. Reduce Motion: the still face. */
function BlinkingFace({ id, size, look, c }: { id: string; size: number; look: Layers; c: Hue }) {
  const reduce = useReducedMotion()
  if (reduce) return <Face id={id} size={size} c={c} body={shift(look.dy, look.art + look.open + look.over)} />
  return (
    <>
      <Face id={id} size={size} c={c} body={shift(look.dy, look.art)} />
      <BlinkLayers size={size} open={shift(look.dy, look.open)} closed={shift(look.dy, look.closed)} eyeY={look.eyeY} />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Defs>
            <ClipPath id={`${id}k`}>
              <Circle cx={12} cy={12} r={12} />
            </ClipPath>
          </Defs>
          <G clipPath={`url(#${id}k)`}>{elementsOf(shift(look.dy, look.over))}</G>
        </Svg>
      </View>
    </>
  )
}

/** One face on its disc, clipped to it: the design's `svg()`, with this instance's own ids for the glow and the clip. */
function Face({ id, size, c, body }: { id: string; size: number; c: Hue; body: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <RadialGradient id={`${id}g`} cx={12} cy={15} r={13} gradientUnits="userSpaceOnUse">
          <Stop offset={0} stopColor={c.e} stopOpacity={GLOW_CORE} />
          <Stop offset={1} stopColor={c.f} stopOpacity={0} />
        </RadialGradient>
        <ClipPath id={`${id}c`}>
          <Circle cx={12} cy={12} r={12} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${id}c)`}>
        <Circle cx={12} cy={12} r={12} fill={c.f} />
        <Circle cx={12} cy={12} r={12} fill={`url(#${id}g)`} />
        {elementsOf(body)}
      </G>
    </Svg>
  )
}

/**
 * A pseudonym's face on its disc. `size` 24–120 (48 by default); `ring` is the 2 pt cut-out ring for a disc on a photo,
 * outside the box. `blink`: once, on the person sheet and the profile only; never in a list. A laughing or dozing face
 * has no open eyes and stays still, and Reduce Motion draws the still face.
 *
 * Decorative: the pseudonym beside it ("Cosmic Panda") is what is read out.
 *
 * Memoised: a room grid or a facepile re-renders only the faces that changed.
 */
export const Creature = memo(function Creature({
  species,
  mood,
  hue,
  size = 48,
  ring,
  blink = false,
}: CreatureLook & { size?: number; ring?: string; blink?: boolean }) {
  // SVG ids: letters only (useId's colons are not safe inside url(#…)).
  const id = `cr${useId().replace(/[^A-Za-z0-9]/g, '')}`
  const look = layersOf(species, mood, hue)
  const c = HUES[hueIndex(hue)]
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {blink && look.closed ? (
        <BlinkingFace id={id} size={size} look={look} c={c} />
      ) : (
        <Face id={id} size={size} c={c} body={shift(look.dy, look.art + look.open + look.over)} />
      )}
      {ring ? <View testID="creature-ring" style={[styles.ring, { borderColor: ring }]} /> : null}
    </View>
  )
})

/** The glow's strength at its core: the hue's edge tone at half, fading to the disc. */
const GLOW_CORE = 0.5

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    top: -SPACE.badgeRing,
    left: -SPACE.badgeRing,
    right: -SPACE.badgeRing,
    bottom: -SPACE.badgeRing,
    borderWidth: SPACE.badgeRing,
    borderRadius: RADIUS.capsule,
  },
})
