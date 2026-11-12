/*
 * The anonymous faces ("C · Faces", owner-approved 2026-11-12, SCRUM-1047) and the venue plates.
 *
 * The faces are the design's renderer, ported: ~/blendn-design-export/mockups/redesign-2026-11/creatures/full-set/creatures.js,
 * whose 650 SVGs (svg/moods, svg/hues) are what the owner approved. The noun picks the species, the adjective the mood, the
 * pseudonym's hash the hue. Owner rulings on top of the sheets: non-animal nouns draw from a friendlier cast (no cobra,
 * viper or mantis); laughing and dozing faces never blink; the panda stays black and white; the hue stays hash % 8.
 */
import { act, render, screen } from '@testing-library/react-native'
import { createHash } from 'crypto'
import React from 'react'
import { processColor, StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import {
  Creature,
  CREATURE_CAST,
  CREATURE_MOODS,
  CREATURE_NOUN_SPECIES,
  CREATURE_SPECIES,
  creatureFor,
  faceMarkup,
  type CreatureMood,
  type CreatureSpecies,
} from '../components/ds/Creature'
import DsCreaturesPreview from '../app/preview/ds-creatures'
import { VENUE_PLATE_GLYPHS, VenuePlate } from '../components/ds/VenuePlate'
import { Icon } from '../components/ui/Icon'
import { CREATURE_ART, CREATURE_HUES, PALETTE_GLYPH, VENUE_PLATES } from '../lib/design/tokens'
import { fnv1a } from '../lib/pseudonymAvatar'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false) }
})
const reduceMotion = Reanimated.useReducedMotion as jest.Mock

type Node = { type: string; props: Record<string, unknown>; children: Node[] | null }
const all = (n: Node | Node[] | null, type: string): Node[] =>
  !n ? [] : Array.isArray(n) ? n.flatMap((c) => all(c, type)) : [...(n.type === type ? [n] : []), ...all(n.children, type)]
const tree = () => screen.toJSON() as unknown as Node
// Both are decorative, so a query has to ask for what the screen reader skips.
const HIDDEN = { includeHiddenElements: true }
const paint = (colour: string) => ({ type: 0, payload: processColor(colour) })

// The server's words, verbatim from admin lib/anonymous-names.ts (origin/dev, 2026-11-12). A word added there and not
// here leaves these tests passing and the new word unmapped: when the server's lists change, paste them again.
const ADJECTIVES = ['Cosmic', 'Neon', 'Electric', 'Golden', 'Silver', 'Crystal', 'Mystic', 'Lunar', 'Solar', 'Stellar', 'Arctic', 'Tropical', 'Velvet', 'Crimson', 'Emerald', 'Sapphire', 'Ruby', 'Amber', 'Jade', 'Coral', 'Ivory', 'Midnight', 'Twilight', 'Dawn', 'Dusk', 'Shadow', 'Phantom', 'Radiant', 'Vivid', 'Bold', 'Brave', 'Swift', 'Gentle', 'Fierce', 'Noble', 'Wild', 'Silent', 'Stormy', 'Sunny', 'Misty', 'Frosty', 'Blazing', 'Gleaming', 'Hidden', 'Lucky', 'Clever', 'Witty', 'Dreamy', 'Daring', 'Mellow', 'Rustic', 'Urban', 'Wandering', 'Floating', 'Dancing', 'Singing', 'Laughing', 'Glowing', 'Sparkling', 'Shining', 'Burning', 'Roaming', 'Soaring', 'Drifting', 'Rolling', 'Spinning', 'Whirling', 'Rising', 'Falling', 'Leaping', 'Bouncing', 'Tumbling', 'Flowing', 'Rushing', 'Crashing', 'Rumbling', 'Humming', 'Buzzing', 'Chirping', 'Howling']
const NOUNS = ['Panda', 'Phoenix', 'Dragon', 'Falcon', 'Tiger', 'Wolf', 'Eagle', 'Dolphin', 'Panther', 'Jaguar', 'Hawk', 'Raven', 'Owl', 'Fox', 'Bear', 'Lion', 'Stag', 'Cobra', 'Viper', 'Crane', 'Swan', 'Otter', 'Badger', 'Lynx', 'Moose', 'Bison', 'Gecko', 'Mantis', 'Heron', 'Robin', 'Finch', 'Wren', 'Lark', 'Dove', 'Parrot', 'Toucan', 'Pelican', 'Puffin', 'Penguin', 'Koala', 'Lemur', 'Coyote', 'Gazelle', 'Cheetah', 'Mustang', 'Stallion', 'Pegasus', 'Griffin', 'Unicorn', 'Sphinx', 'Kraken', 'Hydra', 'Titan', 'Comet', 'Nebula', 'Quasar', 'Nova', 'Meteor', 'Orbit', 'Zenith', 'Prism', 'Echo', 'Spark', 'Flame', 'Blaze', 'Storm', 'Thunder', 'Frost', 'Glacier', 'Reef', 'Oasis', 'Summit', 'Canyon', 'Ridge', 'Meadow', 'Grove', 'Brook', 'River', 'Tide', 'Wave', 'Dune']

// NOTES.md §7, the mapping table. Every animal noun names its own species except these four.
const RENAMED: Record<string, CreatureSpecies> = { Mustang: 'horse', Stallion: 'horse', Hydra: 'dragon', Kraken: 'octopus' }
const NOT_ANIMALS = ['Titan', 'Comet', 'Nebula', 'Quasar', 'Nova', 'Meteor', 'Orbit', 'Zenith', 'Prism', 'Echo', 'Spark', 'Flame', 'Blaze', 'Storm', 'Thunder', 'Frost', 'Glacier', 'Reef', 'Oasis', 'Summit', 'Canyon', 'Ridge', 'Meadow', 'Grove', 'Brook', 'River', 'Tide', 'Wave', 'Dune']
const UNFRIENDLY: CreatureSpecies[] = ['cobra', 'viper', 'mantis']

// NOTES.md §7, the mood table.
const MOODS: Record<CreatureMood, string> = {
  happy: 'Sunny Lucky Laughing Dancing Singing Bouncing Sparkling Glowing Shining Radiant Vivid Golden Chirping Tumbling Leaping Whirling',
  sleepy: 'Dreamy Mellow Misty Gentle Silent Drifting Floating Lunar Twilight Dusk Midnight Velvet Humming Flowing Falling Frosty',
  fierce: 'Fierce Bold Brave Blazing Stormy Burning Crashing Rumbling Howling Rushing Daring Wild Crimson Electric Buzzing',
  sly: 'Clever Witty Shadow Phantom Hidden Mystic Cosmic Wandering Roaming Neon Urban Noble',
  curious: 'Silver Crystal Solar Stellar Arctic Tropical Emerald Sapphire Ruby Amber Jade Coral Ivory Dawn Swift Gleaming Rustic Soaring Rising Rolling Spinning',
}
const hueOf = (seed: string) => Math.abs(fnv1a(seed.trim() || 'anonymous')) % 8

describe('creatureFor: the noun is the species', () => {
  it('every animal noun on the server draws its own animal, whatever the adjective', () => {
    const animals = NOUNS.filter((w) => !NOT_ANIMALS.includes(w))
    expect(animals).toHaveLength(52)
    for (const noun of animals) {
      const expected = RENAMED[noun] ?? noun.toLowerCase()
      expect(CREATURE_SPECIES).toContain(expected)
      for (const adj of ADJECTIVES) expect([noun, creatureFor(`${adj} ${noun}`).species]).toEqual([noun, expected])
    }
  })

  it('every non-animal noun draws from the friendly cast: every species but the cobra, viper and mantis', () => {
    expect([...CREATURE_CAST].sort()).toEqual(CREATURE_SPECIES.filter((s) => !UNFRIENDLY.includes(s)).sort())
    expect(CREATURE_CAST).toHaveLength(47)
    for (const noun of NOT_ANIMALS) {
      expect(Object.hasOwn(CREATURE_NOUN_SPECIES, noun.toLowerCase())).toBe(false)
      for (const adj of ADJECTIVES) {
        const { species } = creatureFor(`${adj} ${noun}`)
        expect(CREATURE_CAST).toContain(species)
        expect(UNFRIENDLY).not.toContain(species)
      }
    }
  })

  it('control: across the whole server vocabulary a non-animal is never one of the three, and the cast still varies (#384)', () => {
    const drawn = new Set(NOT_ANIMALS.flatMap((noun) => ADJECTIVES.map((adj) => creatureFor(`${adj} ${noun}`).species)))
    expect(UNFRIENDLY.filter((s) => drawn.has(s))).toEqual([])
    expect(drawn.size).toBeGreaterThan(40)
    expect(creatureFor('Cosmic Comet').species).not.toBe(creatureFor('Velvet Comet').species)
  })

  it('the noun map is exactly the animal nouns, nothing else', () => {
    expect(Object.keys(CREATURE_NOUN_SPECIES).sort()).toEqual(NOUNS.filter((w) => !NOT_ANIMALS.includes(w)).map((w) => w.toLowerCase()).sort())
  })
})

describe('creatureFor: the adjective is the face', () => {
  it('every server adjective is listed, in exactly one mood', () => {
    const listed = Object.values(MOODS).flatMap((ws) => ws.split(' '))
    expect([...listed].sort()).toEqual([...ADJECTIVES].sort())
    expect(Object.fromEntries(Object.entries(MOODS).map(([m, ws]) => [m, ws.split(' ').length]))).toEqual({ happy: 16, sleepy: 16, fierce: 15, sly: 12, curious: 21 })
  })

  it.each(Object.entries(MOODS).flatMap(([mood, ws]) => ws.split(' ').map((adj) => [adj, mood])))('%s is %s', (adj, mood) => {
    expect(creatureFor(`${adj} Fox`).mood).toBe(mood)
    expect(creatureFor(`${adj} Comet`).mood).toBe(mood)
  })

  it('the moods are the five the design draws', () => {
    expect([...CREATURE_MOODS].sort()).toEqual(['curious', 'fierce', 'happy', 'sleepy', 'sly'])
  })

  it('an adjective the server does not send looks curious', () => {
    expect(creatureFor('Quiet Fox')).toMatchObject({ species: 'fox', mood: 'curious' })
  })
})

describe('creatureFor: odd names', () => {
  it('a prototype key is neither a species nor a mood ("constructor" is not a creature)', () => {
    for (const name of ['Brave Constructor', 'Cosmic constructor', 'Wild __proto__', 'Lucky Hasownproperty', 'Swift Tostring']) {
      const look = creatureFor(name)
      expect(CREATURE_CAST).toContain(look.species)
    }
    expect(creatureFor('Constructor Fox')).toMatchObject({ species: 'fox', mood: 'curious' })
    expect(creatureFor('Valueof Fox').mood).toBe('curious')
  })

  it('a collision suffix keeps the noun and the adjective: "Wild Wren 2" is a wild wren', () => {
    expect(creatureFor('Wild Wren 2')).toEqual({ species: 'wren', mood: 'fierce', hue: hueOf('Wild Wren 2') })
    expect(creatureFor('Cosmic Panda 2')).toMatchObject({ species: 'panda', mood: 'sly' })
  })

  it('case and outer spaces do not change the species or the mood; the hue is the trimmed name', () => {
    expect(creatureFor('COSMIC PANDA')).toMatchObject({ species: 'panda', mood: 'sly' })
    expect(creatureFor('  Cosmic Panda  ')).toEqual(creatureFor('Cosmic Panda'))
  })

  it('no noun at all (a placeholder seed, an empty name) still draws a friendly face', () => {
    for (const seed of ['', '   ', 'anonymous', 'room-1:user-9', 'you', 'Café']) {
      const look = creatureFor(seed)
      expect(CREATURE_CAST).toContain(look.species)
      expect(look.mood).toBe('curious')
      expect(look.hue).toBe(hueOf(seed))
    }
    expect(creatureFor('')).toEqual(creatureFor('anonymous'))
  })

  it('"Midnight Hummingbird", the worst case: a dozing face from the cast', () => {
    expect(creatureFor('Midnight Hummingbird')).toMatchObject({ mood: 'sleepy', hue: hueOf('Midnight Hummingbird') })
    expect(CREATURE_CAST).toContain(creatureFor('Midnight Hummingbird').species)
  })
})

describe('the hue', () => {
  it('is the eight brand triples, in order', () => {
    expect(CREATURE_HUES).toEqual([
      { name: 'amber', fill: '#4F3A1E', edge: '#D98A2B', glyph: '#F5BE7E' },
      { name: 'ember', fill: '#552D21', edge: '#F05423', glyph: '#FF8A5C' },
      { name: 'coral', fill: '#523029', edge: '#D9604F', glyph: '#F69C8C' },
      { name: 'rose', fill: '#4C3036', edge: '#BE5C71', glyph: '#EB8EA1' },
      { name: 'orchid', fill: '#4A2F43', edge: '#B45C9A', glyph: '#E39ACB' },
      { name: 'violet', fill: '#433247', edge: '#925DA9', glyph: '#B58FD0' },
      { name: 'indigo', fill: '#33304F', edge: '#6F64BC', glyph: '#ABA3EE' },
      { name: 'stone', fill: '#3A3533', edge: '#8E8580', glyph: '#D8CEC8' },
    ])
  })

  it.each(['Cosmic Panda', 'Wild Wren 2', 'Midnight Hummingbird', 'Velvet Heron', 'Brave Titan'])('%s: |FNV-1a| % 8', (seed) => {
    expect(creatureFor(seed).hue).toBe(hueOf(seed))
  })

  it('the panda keeps its black and white on every hue; only the disc takes it', () => {
    const heads = CREATURE_HUES.map((_, hue) => faceMarkup('panda', 'curious', hue))
    expect(new Set(heads).size).toBe(1)
    expect(heads[0]).toContain(`fill="${CREATURE_ART.cream}"`)
  })
})

describe('the artwork is the approved set, byte for byte', () => {
  // sha256 over the body of every file in full-set/svg/moods (each species × mood, violet) and svg/hues (each species ×
  // hue, curious), sorted by path: `${dir}/${file}\n${body}\n`, where body is what follows the disc and its glow.
  const HUE_NAMES = CREATURE_HUES.map((h) => h.name)
  const approved = () => {
    const files: [string, string][] = []
    for (const species of CREATURE_SPECIES) for (const mood of CREATURE_MOODS) files.push([`moods/${species}-${mood}.svg`, faceMarkup(species, mood, 5)])
    for (const species of CREATURE_SPECIES) HUE_NAMES.forEach((name, hue) => files.push([`hues/${species}-${name}.svg`, faceMarkup(species, 'curious', hue)]))
    const sort = (dir: string) => files.filter(([p]) => p.startsWith(dir)).sort(([a], [b]) => (a < b ? -1 : 1))
    const h = createHash('sha256')
    for (const [p, body] of [...sort('moods/'), ...sort('hues/')]) h.update(`${p}\n${body}\n`)
    return { count: files.length, sha: h.digest('hex') }
  }

  it('50 species × 5 moods and × 8 hues: all 650 approved SVGs', () => {
    expect(CREATURE_SPECIES).toHaveLength(50)
    expect(approved()).toEqual({ count: 650, sha: '9d4f2d9cc990fc38a1a6d1aa1d73940ab58e60ddfcde68b0d1d922b776ed127f' })
  })

  it('control: one approved file, in full (svg/moods/fox-sly.svg)', () => {
    expect(faceMarkup('fox', 'sly', 5)).toBe(
      '<path d="M5 4.2 10.4 8.4 5.8 12Z" fill="#B58FD0" stroke="#B58FD0" stroke-width="1.2" stroke-linejoin="round"/><path d="M5 4.2 7.4 6.1 5.3 7.6Z" fill="#0D0C0C" stroke="#0D0C0C" stroke-width="0.8" stroke-linejoin="round"/><g transform="matrix(-1 0 0 1 24 0)"><path d="M5 4.2 10.4 8.4 5.8 12Z" fill="#B58FD0" stroke="#B58FD0" stroke-width="1.2" stroke-linejoin="round"/><path d="M5 4.2 7.4 6.1 5.3 7.6Z" fill="#0D0C0C" stroke="#0D0C0C" stroke-width="0.8" stroke-linejoin="round"/></g><ellipse cx="12" cy="13.6" rx="7.4" ry="6.6" fill="#B58FD0"/><path d="M5.4 13c2 .1 4 1.3 6.6 4.35 2.6-3.05 4.6-4.25 6.6-4.35-.4 3.25-3 5.75-6.6 5.75S5.8 16.25 5.4 13Z" fill="#FFF6EF"/><circle cx="9.1" cy="12.5" r="1.75" fill="#FFF6EF"/><circle cx="9.77" cy="12.68" r="1.12" fill="#0D0C0C"/><circle cx="10.29" cy="12.01" r="0.44" fill="#FFFFFF"/><path d="M7.2 11.89A2 2 0 0 1 11 11.89Z" fill="#B58FD0"/><path d="M7.2 11.89h3.8" fill="none" stroke="#0D0C0C" stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round"/><circle cx="14.9" cy="12.5" r="1.75" fill="#FFF6EF"/><circle cx="15.57" cy="12.68" r="1.12" fill="#0D0C0C"/><circle cx="16.09" cy="12.01" r="0.44" fill="#FFFFFF"/><path d="M13 11.89A2 2 0 0 1 16.8 11.89Z" fill="#B58FD0"/><path d="M13 11.89h3.8" fill="none" stroke="#0D0C0C" stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 16.25h2l-1 1.15Z" fill="#0D0C0C" stroke="#0D0C0C" stroke-width="0.75" stroke-linejoin="round"/><path d="M10.7 18.3q1.4 .8 2.6-.6" fill="none" stroke="#0D0C0C" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"/>'
    )
  })
})

// Path flattening: the SVG spec's arcs and Béziers as polylines.
type Pt = [number, number]
const STEPS = 16

/** An SVG arc's points (the spec's endpoint-to-centre conversion, F.6.5). */
function arcPoints(p0: Pt, rx: number, ry: number, phiDeg: number, large: number, sweep: number, p1: Pt): Pt[] {
  if (rx === 0 || ry === 0) return [p0, p1]
  const phi = (phiDeg * Math.PI) / 180
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)]
  const dx = (p0[0] - p1[0]) / 2
  const dy = (p0[1] - p1[1]) / 2
  const x1 = cos * dx + sin * dy
  const y1 = -sin * dx + cos * dy
  rx = Math.abs(rx)
  ry = Math.abs(ry)
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
  if (lambda > 1) {
    rx *= Math.sqrt(lambda)
    ry *= Math.sqrt(lambda)
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1
  const co = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den))
  const cx1 = (co * rx * y1) / ry
  const cy1 = (-co * ry * x1) / rx
  const cx = cos * cx1 - sin * cy1 + (p0[0] + p1[0]) / 2
  const cy = sin * cx1 + cos * cy1 + (p0[1] + p1[1]) / 2
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  const t1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
  let dt = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
  if (!sweep && dt > 0) dt -= 2 * Math.PI
  if (sweep && dt < 0) dt += 2 * Math.PI
  return Array.from({ length: STEPS + 1 }, (_, i) => {
    const t = t1 + (dt * i) / STEPS
    return [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos] as Pt
  })
}

const bezier = (ps: Pt[]): Pt[] =>
  Array.from({ length: STEPS + 1 }, (_, i) => {
    const t = i / STEPS
    let pts = ps
    while (pts.length > 1) pts = pts.slice(1).map((p, k) => [pts[k][0] + (p[0] - pts[k][0]) * t, pts[k][1] + (p[1] - pts[k][1]) * t] as Pt)
    return pts[0]
  })

/** The path as polylines, one per subpath. */
function polylines(d: string): Pt[][] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g) ?? []
  const lines: Pt[][] = []
  let line: Pt[] = []
  let cur: Pt = [0, 0]
  let start: Pt = [0, 0]
  let lastCtrl: Pt | null = null
  let cmd = ''
  let i = 0
  const num = () => Number(tokens[i++])
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++]
    const rel = cmd === cmd.toLowerCase()
    const at = (x: number, y: number): Pt => (rel ? [cur[0] + x, cur[1] + y] : [x, y])
    const C = cmd.toUpperCase()
    let ctrl: Pt | null = null
    if (C === 'M') {
      if (line.length) lines.push(line)
      cur = at(num(), num())
      start = cur
      line = [cur]
      cmd = rel ? 'l' : 'L'
    } else if (C === 'L') {
      cur = at(num(), num())
      line.push(cur)
    } else if (C === 'H') {
      cur = [rel ? cur[0] + num() : num(), cur[1]]
      line.push(cur)
    } else if (C === 'V') {
      cur = [cur[0], rel ? cur[1] + num() : num()]
      line.push(cur)
    } else if (C === 'C' || C === 'S') {
      const c1: Pt = C === 'C' ? at(num(), num()) : lastCtrl ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur
      const c2 = at(num(), num())
      const end = at(num(), num())
      line.push(...bezier([cur, c1, c2, end]).slice(1))
      ctrl = c2
      cur = end
    } else if (C === 'Q') {
      const c1 = at(num(), num())
      const end = at(num(), num())
      line.push(...bezier([cur, c1, end]).slice(1))
      ctrl = c1
      cur = end
    } else if (C === 'A') {
      const [rx, ry, rot, large, sweep] = [num(), num(), num(), num(), num()]
      const end = at(num(), num())
      line.push(...arcPoints(cur, rx, ry, rot, large, sweep, end).slice(1))
      cur = end
    } else if (C === 'Z') {
      line.push(start)
      cur = start
      lines.push(line)
      line = []
    } else {
      throw new Error(`unhandled path command ${cmd}`)
    }
    lastCtrl = ctrl
  }
  if (line.length) lines.push(line)
  return lines
}


/*
 * Centring, per animal (replaces creatureOptical.test.ts, whose outline glyphs are gone): each face is rasterised from
 * its own markup, every species in every mood, and its ink must sit on the disc's centre across x. The design measured
 * the same at 240 px (NOTES.md §7: "within 0.35 of centre on x everywhere"). Only the busts may leave the disc.
 */
type Shape = { polys: Pt[][]; fill: boolean; stroke: number; box: [number, number, number, number] }
type Mx = [number, number, number, number, number, number]
const ID: Mx = [1, 0, 0, 1, 0, 0]
const mul = (m: Mx, n: Mx): Mx => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]
const apply = (m: Mx, [x, y]: Pt): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
function transformOf(t: string | undefined): Mx {
  let m = ID
  for (const [, fn, args] of (t ?? '').matchAll(/(\w+)\(([^)]*)\)/g)) {
    const v = args.split(/[\s,]+/).filter(Boolean).map(Number)
    if (fn === 'matrix') m = mul(m, v as Mx)
    else if (fn === 'translate') m = mul(m, [1, 0, 0, 1, v[0], v[1] ?? 0])
    else if (fn === 'scale') m = mul(m, [v[0], 0, 0, v[1] ?? v[0], 0, 0])
    else if (fn === 'rotate') {
      const [a, cx = 0, cy = 0] = v
      const r = (a * Math.PI) / 180
      m = mul(mul(mul(m, [1, 0, 0, 1, cx, cy]), [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]), [1, 0, 0, 1, -cx, -cy])
    } else throw new Error(`unhandled transform ${fn}`)
  }
  return m
}
const ring = (cx: number, cy: number, rx: number, ry: number): Pt[] => Array.from({ length: 49 }, (_, i) => [cx + rx * Math.cos((i / 48) * 2 * Math.PI), cy + ry * Math.sin((i / 48) * 2 * Math.PI)])

/** The markup's shapes, transformed into the 24-unit box. */
function shapesOf(markup: string): Shape[] {
  const stack: Mx[] = [ID]
  const out: Shape[] = []
  for (const [, close, tag, attrs] of markup.matchAll(/<(\/?)(g|path|circle|ellipse)\b([^>]*?)\/?>/g)) {
    if (close) { stack.pop(); continue }
    const a = Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v]))
    const m = mul(stack[stack.length - 1], transformOf(a.transform))
    if (tag === 'g') { stack.push(m); continue }
    const raw = tag === 'path' ? polylines(a.d) : tag === 'circle' ? [ring(+a.cx, +a.cy, +a.r, +a.r)] : [ring(+a.cx, +a.cy, +a.rx, +a.ry)]
    const polys = raw.map((l) => l.map((p) => apply(m, p)))
    const stroke = a.stroke && a.stroke !== 'none' ? Number(a['stroke-width'] ?? 1) : 0
    const xs = polys.flat().map((p) => p[0])
    const ys = polys.flat().map((p) => p[1])
    const pad = stroke / 2
    out.push({ polys, fill: a.fill !== 'none', stroke, box: [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad] })
  }
  return out
}
function inside(polys: Pt[][], [x, y]: Pt): boolean {
  let w = 0
  for (const poly of polys)
    for (let i = 0; i < poly.length; i++) {
      const [a, b] = [poly[i], poly[(i + 1) % poly.length]]
      if (a[1] <= y) { if (b[1] > y && (b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1]) > 0) w++ }
      else if (b[1] <= y && (b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1]) < 0) w--
    }
  return w !== 0
}
function nearLine(polys: Pt[][], [x, y]: Pt, r: number): boolean {
  for (const line of polys)
    for (let i = 1; i < line.length; i++) {
      const [a, b] = [line[i - 1], line[i]]
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)))
      if (Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) <= r) return true
    }
  return false
}
const STEP = 0.25
/** The face's ink across the box: its centre on x, and how much of it lies outside the disc (in samples). */
function measure(markup: string): { centreX: number; outside: number } {
  const shapes = shapesOf(markup)
  let [n, sx, outside] = [0, 0, 0]
  for (let y = STEP / 2; y < 24; y += STEP)
    for (let x = STEP / 2; x < 24; x += STEP) {
      const p: Pt = [x, y]
      const ink = shapes.some((s) => x >= s.box[0] && x <= s.box[2] && y >= s.box[1] && y <= s.box[3] && ((s.fill && inside(s.polys, p)) || (s.stroke > 0 && nearLine(s.polys, p, s.stroke / 2))))
      if (!ink) continue
      if (Math.hypot(x - 12, y - 12) > 12) { outside++; continue }
      n++
      sx += x
    }
  return { centreX: sx / n, outside }
}

describe('every face sits on its disc', () => {
  // The busts the design cuts with the disc on purpose: shoulders, and the swan's neck.
  const BUSTS: CreatureSpecies[] = ['eagle', 'griffin', 'swan']
  // The design's 0.35 at 240 px, plus 0.05 for this coarser raster. NOTES.md §7: the unicorn's mane is the one
  // asymmetric drawing.
  const CENTRED = 0.4
  const TOLERANCE: Partial<Record<CreatureSpecies, number>> = { unicorn: 0.45 }
  // In the 24-unit box: a sliver the clip trims unseen (an antler tip, a neck's last hairline) is not a spill.
  const SLIVER = 0.5

  it.each(CREATURE_SPECIES.flatMap((s) => CREATURE_MOODS.map((m) => [s, m] as const)))('%s, %s: centred across x, inside the disc', (species, mood) => {
    const { centreX, outside } = measure(faceMarkup(species, mood, 5))
    expect(Math.abs(centreX - 12)).toBeLessThanOrEqual(TOLERANCE[species] ?? CENTRED)
    if (!BUSTS.includes(species)) expect(outside * STEP * STEP).toBeLessThanOrEqual(SLIVER)
  })

  it('control: an off-centre face and one that spills off the disc both fail', () => {
    expect(Math.abs(measure('<circle cx="11.5" cy="12" r="5" fill="#FFF"/>').centreX - 12)).toBeGreaterThan(0.4)
    expect(measure('<circle cx="12" cy="12" r="5" fill="#FFF"/>')).toEqual({ centreX: expect.closeTo(12, 2), outside: 0 })
    expect(measure('<g transform="translate(8 0)"><circle cx="12" cy="12" r="5" fill="#FFF"/></g>').outside * STEP * STEP).toBeGreaterThan(0.5)
    expect(Math.abs(measure('<path d="M4 4h4v16H4Z" fill="#FFF"/><path d="M14 12h6" fill="none" stroke="#FFF" stroke-width="1"/>').centreX - 12)).toBeGreaterThan(0.4)
  })
})

describe('<Creature>', () => {
  const clipIds = () => all(tree(), 'RNSVGClipPath').map((n) => n.props.name)

  it('draws the look creatureFor picked: the disc in its hue, the glow, then the face', async () => {
    await render(<Creature {...creatureFor('Swift Fox')} />)
    const { hue } = creatureFor('Swift Fox')
    const circles = all(tree(), 'RNSVGCircle')
    expect(circles[1].props.fill).toEqual(paint(CREATURE_HUES[hue].fill))
    // [offset, colour, offset, colour]: the edge tone at the core, the disc at the rim (each with its opacity in the alpha).
    const [o0, core, o1, rim] = all(tree(), 'RNSVGRadialGradient')[0].props.gradient as number[]
    const rgb = (v: number) => (v >>> 0) & 0xffffff
    expect([o0, rgb(core), o1, rgb(rim)]).toEqual([0, parseInt(CREATURE_HUES[hue].edge.slice(1), 16), 1, parseInt(CREATURE_HUES[hue].fill.slice(1), 16)])
    expect(all(tree(), 'RNSVGEllipse').some((e) => (e.props.fill as { payload: unknown }).payload === processColor(CREATURE_HUES[hue].glyph))).toBe(true)
    // Every shape of the markup is drawn, not just the first.
    const markup = faceMarkup('fox', 'curious', hue)
    const count = (tag: string) => markup.split(`<${tag} `).length - 1
    expect(all(tree(), 'RNSVGPath')).toHaveLength(count('path'))
    expect(all(tree(), 'RNSVGEllipse')).toHaveLength(count('ellipse'))
    expect(all(tree(), 'RNSVGCircle')).toHaveLength(count('circle') + 3)
  })

  it('each one names its own glow and clip, so two on one screen never share an id', async () => {
    await render(
      <>
        <Creature {...creatureFor('Swift Fox')} />
        <Creature {...creatureFor('Swift Fox')} />
      </>
    )
    const clips = clipIds()
    expect(clips).toHaveLength(2)
    expect(new Set(clips).size).toBe(2)
    const gradients = all(tree(), 'RNSVGRadialGradient').map((n) => n.props.name)
    expect(new Set(gradients).size).toBe(2)
    // Each disc is clipped by its own circle.
    expect(all(tree(), 'RNSVGGroup').filter((g) => g.props.clipPath).map((g) => g.props.clipPath)).toEqual(clips)
  })

  it.each([24, 40, 120])('is %i pt square, the 24-unit box scaled to it', async (size) => {
    await render(<Creature {...creatureFor('Velvet Heron')} size={size} />)
    expect(all(tree(), 'RNSVGSvgView')[0].props).toMatchObject({ bbWidth: size, bbHeight: size, vbWidth: 24, vbHeight: 24 })
  })

  it('a hue out of range wraps onto one rather than throwing', async () => {
    for (const [hue, index] of [[-1, 7], [8, 0], [2.7, 2], [Number.NaN, 0]] as const) {
      await render(<Creature species="fox" mood="curious" hue={hue} />)
      expect(all(tree(), 'RNSVGCircle')[1].props.fill).toEqual(paint(CREATURE_HUES[index].fill))
    }
  })

  it('draws the cut-out ring outside the disc only when given one', async () => {
    await render(<Creature species="owl" mood="curious" hue={0} />)
    expect(screen.queryByTestId('creature-ring', HIDDEN)).toBeNull()
    await render(<Creature species="owl" mood="curious" hue={0} ring="#0D0C0C" />)
    expect(StyleSheet.flatten(screen.getByTestId('creature-ring', HIDDEN).props.style)).toMatchObject({ borderColor: '#0D0C0C', position: 'absolute' })
  })

  it('is memoised, so a grid re-renders only the faces that changed', () => {
    expect((Creature as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'))
  })

  it('is decorative: the pseudonym beside it is the label', async () => {
    await render(<Creature species="panda" mood="happy" hue={1} />)
    expect(tree().props).toMatchObject({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' })
  })
})

describe('the blink: once, on the person sheet and the profile', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    reduceMotion.mockReturnValue(false)
  })
  afterEach(() => jest.useRealTimers())
  const eyes = () => screen.queryByTestId('creature-blink', HIDDEN)

  it.each(['curious', 'fierce', 'sly'] as const)('an open-eyed face (%s) blinks when asked', async (mood) => {
    await render(<Creature species="fox" mood={mood} hue={0} blink />)
    expect(eyes()).not.toBeNull()
  })

  it.each(['happy', 'sleepy'] as const)('a closed-eyed face (%s) stays still: no blink, no peek', async (mood) => {
    await render(<Creature species="fox" mood={mood} hue={0} blink />)
    expect(eyes()).toBeNull()
  })

  it('lists never blink: no blink unless asked', async () => {
    await render(<Creature species="fox" mood="curious" hue={0} />)
    expect(eyes()).toBeNull()
  })

  it('Reduce Motion: none, and the face is the still one', async () => {
    reduceMotion.mockReturnValue(true)
    await render(<Creature species="fox" mood="curious" hue={0} blink />)
    expect(eyes()).toBeNull()
    const drawn = () => JSON.stringify(tree()).replace(/cr[A-Za-z0-9]+(?=[gck]")/g, 'id')
    const still = drawn()
    reduceMotion.mockReturnValue(false)
    await render(<Creature species="fox" mood="curious" hue={0} />)
    expect(still).toBe(drawn())
  })

  it('blinking, the face is drawn in layers: the eyes alone move, the brows and mouth stay over them', async () => {
    await render(<Creature species="panther" mood="fierce" hue={3} blink />)
    expect(all(tree(), 'RNSVGSvgView')).toHaveLength(4)
    await act(async () => {
      jest.advanceTimersByTime(2000)
    })
    expect(eyes()).not.toBeNull()
  })
})

describe('<VenuePlate>', () => {
  it('draws each type with the design’s glyph', () => {
    // sets.js PLATES, the third field.
    expect(VENUE_PLATE_GLYPHS).toEqual({
      brewery: 'beer',
      gardenBar: 'tree-palm',
      bar: 'wine',
      club: 'disc-3',
      liveMusic: 'music-2',
      cafe: 'coffee',
      restaurant: 'utensils',
    })
  })

  it('a restaurant is the café’s pair with the utensils glyph: no new colour (A87 ruling)', async () => {
    await render(<VenuePlate type="restaurant" size={120} />)
    expect(StyleSheet.flatten(tree().props.style as object)).toMatchObject({ backgroundColor: VENUE_PLATES.cafe[0] })
    expect(StyleSheet.flatten(half().props.style as object)).toMatchObject({ backgroundColor: VENUE_PLATES.cafe[1] })
    expect(await glyphOf('restaurant', 120)).toBe(await icon('utensils', 48))
  })

  it('glyph={false} draws the two colours alone (Going-out hand-off 3: a plate behind its own words)', async () => {
    await render(<VenuePlate type="cafe" size={120} glyph={false} />)
    expect(StyleSheet.flatten(tree().props.style as object)).toMatchObject({ backgroundColor: VENUE_PLATES.cafe[0] })
    expect(all(tree(), 'RNSVGSvgView')).toHaveLength(0)
    await render(<VenuePlate type="cafe" size={120} />)
    expect(all(tree(), 'RNSVGSvgView')).toHaveLength(1)
  })

  /** The second colour: the half of the plate past its 135° split. */
  const half = () => (tree().children as Node[])[0]

  const glyphOf = async (type: string, size?: number) => {
    await render(<VenuePlate type={type} size={size} />)
    return JSON.stringify(all(tree(), 'RNSVGSvgView').at(-1))
  }
  const icon = async (name: Parameters<typeof Icon>[0]['name'], size: number) => {
    await render(<Icon name={name} size={size} color={PALETTE_GLYPH.plate} />)
    return JSON.stringify(tree())
  }

  it.each(Object.keys(VENUE_PLATES) as (keyof typeof VENUE_PLATES)[])('%s: the token pair, its glyph at 40%, 70% white', async (type) => {
    const [a, b] = VENUE_PLATES[type]
    await render(<VenuePlate type={type} size={120} />)
    expect(StyleSheet.flatten(tree().props.style as object)).toMatchObject({ width: 120, height: 120, borderRadius: 24, backgroundColor: a })
    expect(StyleSheet.flatten(half().props.style as object)).toMatchObject({ backgroundColor: b })
    expect(await glyphOf(type, 120)).toBe(await icon(VENUE_PLATE_GLYPHS[type], 48))
  })

  it('takes a row thumb’s radius when given one', async () => {
    await render(<VenuePlate type="brewery" size={56} radius={8} />)
    expect(StyleSheet.flatten(tree().props.style as object)).toMatchObject({ width: 56, borderRadius: 8 })
    expect(await glyphOf('brewery', 56)).toBe(await icon('beer', 22))
  })

  it('draws a type it does not know as a bar', async () => {
    expect(await glyphOf('nightclub', 120)).toBe(await glyphOf('bar', 120))
    await render(<VenuePlate type="nightclub" size={120} />)
    expect(StyleSheet.flatten(tree().props.style as object)).toMatchObject({ backgroundColor: VENUE_PLATES.bar[0] })
  })

  it('fills its parent with no size, split at 135° through its centre from the first frame', async () => {
    await render(<VenuePlate type="liveMusic" />)
    expect(StyleSheet.flatten(tree().props.style as object)).toMatchObject({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 0 })
    // No layout pass: the half-plane right of the centre, turned 45° about the
    // centre, is x + y > (w + h) / 2 at any aspect, as CSS draws 135deg.
    expect(StyleSheet.flatten(half().props.style as object)).toMatchObject({
      position: 'absolute',
      left: '50%',
      top: '50%',
      transformOrigin: 'left center',
      transform: [{ rotate: '45deg' }],
      backgroundColor: VENUE_PLATES.liveMusic[1],
    })
    expect(await glyphOf('liveMusic')).toBe(await icon('music-2', 48))
  })

  it('takes a testID, and has none unless given one', async () => {
    await render(<VenuePlate type="cafe" size={56} />)
    expect(tree().props.testID).toBeUndefined()
    await render(<VenuePlate type="cafe" size={56} testID="koshys-art" />)
    expect(screen.getByTestId('koshys-art', HIDDEN)).toBeTruthy()
  })

  it('is decorative: the venue’s name and type are the label', async () => {
    await render(<VenuePlate type="cafe" size={56} />)
    expect(tree().props).toMatchObject({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' })
  })
})


describe('the gallery, app/preview/ds-creatures', () => {
  it('shows every species in every mood and hue, and every plate', async () => {
    await render(<DsCreaturesPreview />)
    for (const species of CREATURE_SPECIES) {
      screen.getByTestId(`creature-${species}`)
      CREATURE_HUES.forEach((_, hue) => screen.getByTestId(`creature-${species}-${hue}`))
    }
    for (const type of Object.keys(VENUE_PLATES)) screen.getByTestId(`venue-plate-${type}`)
  })
})
