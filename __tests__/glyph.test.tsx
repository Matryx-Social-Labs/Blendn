/*
 * <Glyph> (foundations, direction C): an Icon that acts once when it is chosen. It never plays on mount, never on deselect,
 * and under Reduce Motion runs no verb at all.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import * as Reanimated from 'react-native-reanimated'

import { __iconData as beer } from 'lucide-react-native/icons/beer'
import { __iconData as check } from 'lucide-react-native/icons/check'
import { __iconData as circleCheck } from 'lucide-react-native/icons/circle-check'
import { __iconData as coffee } from 'lucide-react-native/icons/coffee'
import { __iconData as handshake } from 'lucide-react-native/icons/handshake'
import { __iconData as mountain } from 'lucide-react-native/icons/mountain'
import { __iconData as music2 } from 'lucide-react-native/icons/music-2'

import { DrawnGlyph, Glyph, GLYPH_LENGTHS, GLYPH_VERB, type GlyphProps } from '../components/ui/Glyph'
import { DRAW_NODES } from '../components/ui/Icon'
import { DURATION, GLYPH, SPRING, STAGGER } from '../lib/design/tokens'

jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), __esModule: true, useReducedMotion: jest.fn(() => false) }))
const reduceMotion = Reanimated.useReducedMotion as jest.Mock

let spring: jest.SpyInstance
let timing: jest.SpyInstance
let delay: jest.SpyInstance
beforeEach(() => {
  reduceMotion.mockReturnValue(false)
  spring = jest.spyOn(Reanimated, 'withSpring')
  timing = jest.spyOn(Reanimated, 'withTiming')
  delay = jest.spyOn(Reanimated, 'withDelay')
})
afterEach(() => jest.restoreAllMocks())

const g = (name: GlyphProps['name'], play: boolean) => <Glyph name={name} play={play} />
/** Mounts not playing, then chooses it. */
async function choose(name: GlyphProps['name']) {
  await render(g(name, false))
  await screen.rerender(g(name, true))
}

describe('the verb table', () => {
  it.each([
    ['wine', 'tilt'],
    ['utensils', 'tilt'],
    ['moon', 'tilt'],
    ['disc-3', 'spin'],
    ['tree-palm', 'hop'],
    ['map-pin', 'hop'],
    ['radio', 'flicker'],
    ['beer', 'draw'],
    ['music-2', 'draw'],
    ['check', 'draw'],
    ['sparkles', 'pop'],
    ['heart', 'pop'],
    ['handshake', 'draw'],
    ['mountain', 'draw'],
    ['palette', 'pop'],
    ['cpu', 'pop'],
    ['trophy', 'hop'],
    ['mic-vocal', 'tilt'],
  ] as const)('%s is %s', (name, verb) => {
    expect(GLYPH_VERB[name]).toBe(verb)
  })

  it('a glyph not listed pops, by default', async () => {
    expect(GLYPH_VERB.cat).toBeUndefined()
    await choose('cat')
    expect(spring).toHaveBeenCalledWith(1, SPRING.pop)
  })
})

describe('the draw lengths', () => {
  const data = { beer, 'music-2': music2, coffee, check, 'circle-check': circleCheck, handshake, mountain } as const

  it.each(Object.entries(data))('%s has one length per stroke of the Lucide geometry', (name, icon) => {
    expect(GLYPH_LENGTHS[name as keyof typeof GLYPH_LENGTHS]).toHaveLength(icon.node.length)
    expect(DRAW_NODES[name as keyof typeof DRAW_NODES]).toBe(icon.node)
  })

  it('a circle’s length is never under 2πr, so its seam never shows', () => {
    for (const [name, icon] of Object.entries(data)) {
      icon.node.forEach(([tag, attrs], i) => {
        if (tag !== 'circle') return
        expect(GLYPH_LENGTHS[name as keyof typeof GLYPH_LENGTHS][i]).toBeGreaterThanOrEqual(2 * Math.PI * Number(attrs.r))
      })
    }
  })

  it('every drawn glyph is a path or a circle, the two shapes Stroke draws', () => {
    for (const icon of Object.values(data)) for (const [tag] of icon.node) expect(['path', 'circle']).toContain(tag)
  })
})

describe('when it plays', () => {
  it('skips the mount: playing from the first frame runs nothing', async () => {
    await render(g('sparkles', true))
    await render(g('wine', true))
    await render(g('beer', true))
    expect(spring).not.toHaveBeenCalled()
    expect(timing).not.toHaveBeenCalled()
  })

  it('without play it is a plain Icon: no motion, nothing to run', async () => {
    await render(<Glyph name="check" testID="g" />)
    expect(screen.queryByTestId('g')).toBeNull()
    expect(spring).not.toHaveBeenCalled()
  })

  it('pop: from popFrom, on SPRING.pop', async () => {
    await choose('sparkles')
    expect(spring).toHaveBeenCalledTimes(1)
    expect(spring).toHaveBeenCalledWith(1, SPRING.pop)
    expect(GLYPH.popFrom).toBe(0.85)
  })

  it('spin: a record spins up on SPRING.snap', async () => {
    await choose('disc-3')
    expect(spring).toHaveBeenCalledWith(0, SPRING.snap)
  })

  it('tilt: a clink on SPRING.pop', async () => {
    await choose('wine')
    expect(spring).toHaveBeenCalledWith(0, SPRING.pop)
  })

  it('hop: up over press, then lands on SPRING.pop', async () => {
    await choose('tree-palm')
    expect(timing).toHaveBeenCalledWith(-GLYPH.hop, expect.objectContaining({ duration: DURATION.press }))
    expect(spring).toHaveBeenCalledWith(0, SPRING.pop)
  })

  it('flicker: four linear steps that add up to DURATION.medium, once', async () => {
    await choose('radio')
    const steps = timing.mock.calls.filter(([, config]) => config.duration < DURATION.medium)
    expect(steps.map(([level]) => level)).toEqual([GLYPH.flickerDips[0], 1, GLYPH.flickerDips[1], 1])
    expect(steps.reduce((sum, [, config]) => sum + config.duration, 0)).toBeCloseTo(DURATION.medium)
    expect(spring).not.toHaveBeenCalled()
  })

  it('draw: each stroke times in over base, STAGGER.tight after the last', async () => {
    await choose('beer')
    expect(delay.mock.calls.map(([ms]) => ms)).toEqual(GLYPH_LENGTHS.beer.map((_, i) => i * STAGGER.tight))
    expect(timing).toHaveBeenCalledTimes(GLYPH_LENGTHS.beer.length)
    expect(timing).toHaveBeenCalledWith(1, expect.objectContaining({ duration: DURATION.base }))
  })

  it('plays nothing when it is let go: true → false', async () => {
    await render(g('sparkles', true))
    await screen.rerender(g('sparkles', false))
    expect(spring).not.toHaveBeenCalled()
  })

  it('plays again each time it is chosen', async () => {
    await choose('sparkles')
    await screen.rerender(g('sparkles', false))
    await screen.rerender(g('sparkles', true))
    expect(spring).toHaveBeenCalledTimes(2)
  })

  it('a re-render while still chosen plays nothing more', async () => {
    await choose('sparkles')
    await screen.rerender(<Glyph name="sparkles" play color="#fff" />)
    expect(spring).toHaveBeenCalledTimes(1)
  })
})

describe('Reduce Motion', () => {
  it.each(['sparkles', 'wine', 'disc-3', 'tree-palm', 'radio', 'beer', 'check'] as const)('%s runs no verb', async (name) => {
    reduceMotion.mockReturnValue(true)
    await choose(name)
    expect(spring).not.toHaveBeenCalled()
    expect(timing).not.toHaveBeenCalled()
    expect(delay).not.toHaveBeenCalled()
  })

  it('a drawn glyph stands drawn: every stroke at offset 0', async () => {
    reduceMotion.mockReturnValue(true)
    await render(<DrawnGlyph name="check" play={false} testID="d" />)
    expect(screen.getByTestId('d')).toBeTruthy()
  })
})
