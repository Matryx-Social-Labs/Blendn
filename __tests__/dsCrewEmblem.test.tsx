/*
 * <CrewEmblem>: B · Huddle (refined), owner-approved 2026-11-12 (SCRUM-1053). The markup is the design's renderer's,
 * ~/blendn-design-export/mockups/redesign-2026-11/crew-emblems/B-refined/huddle.js, byte for byte.
 */
import { act, render, screen } from '@testing-library/react-native'
import { createHash } from 'crypto'
import React from 'react'

import { CrewEmblem, movingEmblems } from '../components/ds/CrewEmblem'
import { CREATURE_SPECIES } from '../components/ds/Creature'
import { CREW_SCENES, HUDDLE_CAST, HUDDLE_EXCLUDED, SCENES, huddleKey, huddleMarkup, spotsOf, tierOf } from '../components/ds/crewHuddle'

jest.mock('../lib/motion', () => ({ ...jest.requireActual('../lib/motion'), useReducedMotion: jest.fn(() => false) }))
// eslint-disable-next-line @typescript-eslint/no-require-imports
const reduceMotion = require('../lib/motion').useReducedMotion as jest.Mock

const HIDDEN = { includeHiddenElements: true }
const seedOf = (i: number) => createHash('md5').update(`crew${i}`).digest('hex').slice(0, 16)
const SEEDS = Array.from({ length: 200 }, (_, i) => seedOf(i))

describe('the artwork is the approved renderer’s, byte for byte', () => {
  /*
   * sha256 over `${key}\n${svg}\n` for: 200 seeds (md5('crew' + i), 16 hex) at 24 / 40 / 120, rest pose; then the first
   * 20 seeds × the six scenes × t 0.1 / 0.25 / 0.5 / 0.75 / 0.9 × sizes 40 and 120. Produced by running huddle.js (on
   * creatures.js and emblems.js) in Node with every `h<n>` id written `h0`. Control: a one-character change to the
   * scarf path in `kitMarkup` fails this.
   */
  it('1,800 stills and scene frames', () => {
    const h = createHash('sha256')
    let count = 0
    const add = (key: string, svg: string) => {
      h.update(`${key}\n${svg}\n`)
      count++
    }
    for (const s of SEEDS) for (const size of [24, 40, 120]) add(`${s}@${size}`, huddleMarkup(s, size, 'h0'))
    for (const s of SEEDS.slice(0, 20))
      for (const scene of CREW_SCENES)
        for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) for (const size of [40, 120]) add(`${s}@${size}:${scene}:${t}`, huddleMarkup(s, size, 'h0', { scene, t }))
    expect({ count, sha: h.digest('hex') }).toEqual({ count: 1800, sha: 'b164525822d145518dfab4a4c12c0c7d7a021426280df065246f90f8a0d3b3fe' })
  })

  it('the scenes in the design’s order, with its lengths', () => {
    expect(CREW_SCENES).toEqual(['cheer', 'dance', 'clink', 'highfive', 'wave', 'sleepy'])
    expect(CREW_SCENES.map((s) => SCENES[s].ms)).toEqual([1100, 1400, 1300, 1100, 1300, 1600])
  })

  it('the key, from the seed alone and the same every time', () => {
    expect(huddleKey('915144f67a81cebb')).toEqual({ hue: 3, front: 'dove', left: 'horse', right: 'phoenix', moods: ['happy', 'curious', 'sleepy'] })
    expect(huddleKey('915144f67a81cebb')).toEqual(huddleKey('915144f67a81cebb'))
  })
})

describe('every seed draws a crew', () => {
  const many = Array.from({ length: 3000 }, (_, i) => createHash('sha1').update(`any${i}`).digest('hex').slice(0, 16))

  it('three different characters, a hue, at every tier, with nothing missing', () => {
    for (const s of many) {
      const k = huddleKey(s)
      expect(new Set([k.front, k.left, k.right]).size).toBe(3)
      expect(k.hue).toBeGreaterThanOrEqual(0)
      expect(k.hue).toBeLessThan(8)
      for (const size of [24, 40, 120]) expect(huddleMarkup(s, size, 'x')).not.toMatch(/undefined|NaN/)
    }
    // Not only server seeds: anything a crew row could hold still draws.
    for (const odd of ['', 'x', 'preview-abc', '🔥'.repeat(9)]) expect(huddleMarkup(odd, 40, 'x')).toMatch(/^<svg/)
  })

  it('never panda, eagle, swan, crane, heron or griffin, and never angry', () => {
    expect(HUDDLE_EXCLUDED).toEqual(['panda', 'eagle', 'swan', 'crane', 'heron', 'griffin'])
    expect(HUDDLE_CAST).toHaveLength(CREATURE_SPECIES.length - 6)
    for (const s of many) {
      const k = huddleKey(s)
      for (const sp of [k.front, k.left, k.right]) expect(HUDDLE_EXCLUDED).not.toContain(sp)
      expect(k.moods).not.toContain('fierce')
    }
    for (const scene of CREW_SCENES) {
      expect(SCENES[scene].moods).not.toContain('fierce')
      for (let t = 0; t <= 1; t += 0.05) for (const i of [0, 1, 2]) expect(SCENES[scene].pose(t, i).mood).not.toBe('fierce')
    }
  })

  it('a 214-crew room at 40: on average no crew looks like another (the murmur mix)', () => {
    let repeats = 0
    const ROOMS = 40
    for (let r = 0; r < ROOMS; r++) {
      const looks = Array.from({ length: 214 }, (_, i) => JSON.stringify(huddleKey(createHash('sha1').update(`room${r}:${i}`).digest('hex').slice(0, 16))))
      const seen = new Map<string, number>()
      for (const l of looks) seen.set(l, (seen.get(l) ?? 0) + 1)
      repeats += [...seen.values()].filter((n) => n > 1).reduce((a, n) => a + n, 0)
    }
    expect(repeats / ROOMS).toBeLessThanOrEqual(1)
  })
})

describe('the size ladder', () => {
  it('two faces to 28, three to 80, the full scene from 81', () => {
    expect([12, 24, 28].map(tierOf)).toEqual(['lead', 'lead', 'lead'])
    expect([29, 40, 56, 80].map(tierOf)).toEqual(['trio', 'trio', 'trio', 'trio'])
    expect([81, 96, 120, 160].map(tierOf)).toEqual(['scene', 'scene', 'scene', 'scene'])
    const faces = (size: number) => (huddleMarkup(SEEDS[0], size, 'x').match(/M3\.4 30C3\.4 23\.6/g) ?? []).length
    expect([faces(24), faces(40), faces(120)]).toEqual([2, 3, 3])
    // Bunting and a floor only on the scene tier.
    expect(huddleMarkup(SEEDS[0], 80, 'x')).not.toContain('<ellipse cx="12" cy="24.6"')
    expect(huddleMarkup(SEEDS[0], 81, 'x')).toContain('<ellipse cx="12" cy="24.6"')
  })
})

describe('centred and clipped', () => {
  it('everyone stands inside the plate; the trio is symmetric about its centre', () => {
    for (const tier of ['lead', 'trio', 'scene'] as const) {
      for (const [, cx, cy] of spotsOf(tier)) {
        expect(cx).toBeGreaterThan(4)
        expect(cx).toBeLessThan(20)
        expect(cy).toBeGreaterThan(4)
        expect(cy).toBeLessThan(20)
      }
    }
    for (const tier of ['trio', 'scene'] as const) {
      const [l, r, f] = spotsOf(tier)
      expect(l[1] + r[1]).toBe(24)
      expect(l[2]).toBe(r[2])
      expect(f[1]).toBe(12)
    }
  })

  it('every character is inside the squircle’s clip; the edge is drawn over, unclipped', () => {
    const svg = huddleMarkup(SEEDS[1], 120, 'q')
    const clip = svg.indexOf('<g clip-path="url(#qc)">')
    expect(clip).toBeGreaterThan(0)
    expect(svg.indexOf('M3.4 30C')).toBeGreaterThan(clip)
    expect(svg).toMatch(/<\/g><path d="M12 0C[^"]+" fill="none" stroke="#[0-9A-F]{6}" stroke-width="1.1" opacity=".9"\/><\/svg>$/)
  })
})

describe('<CrewEmblem>', () => {
  beforeEach(() => reduceMotion.mockReturnValue(false))

  it('draws the still at its size, decorative', async () => {
    await render(<CrewEmblem seed={SEEDS[0]} size={56} testID="e" />)
    const root = screen.getByTestId('e', HIDDEN)
    expect(root.props.style).toEqual(expect.objectContaining({ width: 56, height: 56 }))
    expect(root.props.accessibilityElementsHidden).toBe(true)
    expect(root.props.importantForAccessibility).toBe('no-hide-descendants')
    expect(screen.queryByTestId('crew-emblem-scene', HIDDEN)).toBeNull()
  })

  it('each instance has its own clip and glow ids', async () => {
    await render(
      <>
        <CrewEmblem seed={SEEDS[0]} size={40} testID="a" />
        <CrewEmblem seed={SEEDS[0]} size={40} testID="b" />
      </>
    )
    const idOf = (t: string) => (screen.getByTestId(`${t}-xml`, HIDDEN).props.xml as string).match(/clipPath id="([^"]+)"/)![1]
    expect(idOf('a')).not.toBe(idOf('b'))
  })

  // On device the scene's first frame drew every character at identity, one full-size head filling the plate, until the
  // UI thread's first matrix landed: Reanimated hands over its initial `matrix` as a prop that G's JS side drops.
  it.each([24, 40, 120].flatMap((size) => CREW_SCENES.map((scene) => [size, scene] as const)))(
    'the first frame already stands everyone in their place: %i, %s',
    async (size, scene) => {
      await render(<CrewEmblem seed={SEEDS[3]} size={size} scene={scene} />)
      const scales = screen.root!.queryAll((n) => n.type === 'RNSVGGroup' && Array.isArray(n.props.matrix)).map((n) => {
        const m = n.props.matrix as number[]
        return Math.round(Math.hypot(m[0], m[1]) * 100) / 100
      })
      for (const [, , , s] of spotsOf(tierOf(size))) expect(scales).toContain(s)
    }
  )

  // Android (react-native-svg 15.15) draws a group whose opacity is not 1 into a canvas-sized bitmap of its own, every
  // frame, and a toggle landing mid-draw restores a canvas it never saved: the Release app died in the clink with
  // "Underflow in restore". A part comes and goes by `display`, a fade is the paint's (`fillOpacity`), never a group's.
  it.each(CREW_SCENES.map((scene) => [scene] as const))('no group in the %s scene carries an opacity; hidden parts are display none', async (scene) => {
    await render(<CrewEmblem seed={SEEDS[4]} size={120} scene={scene} />)
    const groups = screen.root!.queryAll((n) => n.type === 'RNSVGGroup')
    expect(groups.filter((n) => n.props.opacity !== undefined && n.props.opacity !== 1)).toHaveLength(0)
    expect(groups.some((n) => n.props.display === 'none')).toBe(true)
  })

  it('a scene plays once, then rests and says so', async () => {
    jest.useFakeTimers()
    const onDone = jest.fn()
    await render(<CrewEmblem seed={SEEDS[0]} size={120} scene="dance" onDone={onDone} testID="e" />)
    expect(screen.getByTestId('crew-emblem-scene', HIDDEN)).toBeTruthy()
    expect(movingEmblems()).toEqual(['dance'])
    await act(async () => {
      jest.advanceTimersByTime(SCENES.dance.ms + 100)
    })
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('crew-emblem-scene', HIDDEN)).toBeNull()
    expect(movingEmblems()).toEqual([])
    jest.useRealTimers()
  })

  it('Reduce Motion: the still, and done at once', async () => {
    reduceMotion.mockReturnValue(true)
    const onDone = jest.fn()
    await render(<CrewEmblem seed={SEEDS[0]} size={120} scene="wave" onDone={onDone} testID="e" />)
    expect(screen.queryByTestId('crew-emblem-scene', HIDDEN)).toBeNull()
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('e-xml', HIDDEN).props.xml).toBe(huddleMarkup(SEEDS[0], 120, (screen.getByTestId('e-xml', HIDDEN).props.xml as string).match(/clipPath id="([^"]+)c"/)![1]))
  })

  it('the sleepy lean rests on its held frame, also under Reduce Motion', async () => {
    reduceMotion.mockReturnValue(true)
    await render(<CrewEmblem seed={SEEDS[2]} size={120} scene="sleepy" testID="e" />)
    const xml = screen.getByTestId('e-xml', HIDDEN).props.xml as string
    const id = xml.match(/clipPath id="([^"]+)c"/)![1]
    expect(xml).toBe(huddleMarkup(SEEDS[2], 120, id, { scene: 'sleepy', t: 1 }).replaceAll('Satoshi,system-ui', 'Satoshi_900Black'))
  })

  it('one emblem moves at a time: a second asked to move shows its still; the Mix’s two clink together', async () => {
    const second = jest.fn()
    await render(
      <>
        <CrewEmblem seed={SEEDS[0]} size={120} scene="dance" />
        <CrewEmblem seed={SEEDS[1]} size={120} scene="wave" onDone={second} />
      </>
    )
    expect(screen.getAllByTestId('crew-emblem-scene', HIDDEN)).toHaveLength(1)
    expect(second).toHaveBeenCalledTimes(1)
    await screen.unmount()
    expect(movingEmblems()).toEqual([])

    await render(
      <>
        <CrewEmblem seed={SEEDS[0]} size={120} scene="clink" />
        <CrewEmblem seed={SEEDS[1]} size={120} scene="clink" />
      </>
    )
    expect(screen.getAllByTestId('crew-emblem-scene', HIDDEN)).toHaveLength(2)
    await screen.unmount()
  })
})
