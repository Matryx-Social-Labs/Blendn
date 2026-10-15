/*
 * The centre disc (DESIGN-BRIEF §11; the design system's
 * guidelines/centre-button): every state as a still frame, every transition on
 * its spec'd spring or curve with its Reduce Motion version, the label a screen
 * reader hears, and H.disc on press-in.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, AppState, type AppStateStatus } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { Disc } from '../components/ds/Disc'
import { DISC_FRAMES, discLook, discReentry, discTransition, type DiscLook, type DiscStep } from '../components/ds/discMotion'
import { H } from '../lib/haptics'
import { DURATION, REDUCE_MOTION, SPRING } from '../lib/design/tokens'
import type { RoomButtonTarget } from '../lib/roomButton'

jest.mock('../lib/haptics', () => ({ H: { disc: jest.fn() } }))
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { __esModule: true, ...actual, withSpring: jest.fn(actual.withSpring), useReducedMotion: jest.fn(() => false) }
})
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: View, isGlassEffectAPIAvailable: () => true, isLiquidGlassAvailable: () => true }
})

const reduceMotion = Reanimated.useReducedMotion as jest.Mock

const TARGETS: Record<DiscLook, RoomButtonTarget> = {
  a: { state: 'idle', eventId: null, badge: 0 },
  b: { state: 'today', eventId: 'e1', badge: 0 },
  c: { state: 'checkin', eventId: 'e1', badge: 0 },
  d: { state: 'live', eventId: 'e1', badge: 0 },
  dn: { state: 'live', eventId: 'e1', badge: 3 },
}

/** The step for one channel, or undefined when the transition leaves it alone. */
const step = (steps: DiscStep[], channel: DiscStep['channel']) => steps.find((s) => s.channel === channel)
const CROSSFADE = { duration: REDUCE_MOTION.duration.base, easing: 'gentle' }
/** (c)'s label is hidden from screen readers, so queries for it must look there too. */
const HIDDEN = { includeHiddenElements: true }

describe('discLook: the tab bar’s target → the design’s state names', () => {
  it.each(Object.entries(TARGETS))('%s', (look, target) => {
    expect(discLook(target)).toBe(look)
  })

  it('(dn) only while live: a badge on any other state is not an unread pill', () => {
    expect(discLook({ state: 'checkin', eventId: 'e1', badge: 2 })).toBe('c')
  })
})

describe('the still frames (§11.3, variant A “the disc fills”)', () => {
  it('(a) idle: an ink disc and the gradient mark, nothing else', () => {
    expect(DISC_FRAMES.a).toMatchObject({ fill: 0, ink: 0, ring: 0, glow: 0, hollow: 0, dot: 0, pill: 0 })
  })

  it('(b) today: (a) plus the gradient ring', () => {
    expect(DISC_FRAMES.b).toEqual({ ...DISC_FRAMES.a, ring: 1 })
  })

  it('(c) check-in: filled, ink mark, the static glow and the hollow ring', () => {
    expect(DISC_FRAMES.c).toMatchObject({ fill: 1, ink: 1, ring: 0, glow: 1, hollow: 1, dot: 0, pill: 0 })
  })

  it('(d) live: filled, ink mark, the green dot, and no glow — quieter than (c)', () => {
    expect(DISC_FRAMES.d).toMatchObject({ fill: 1, ink: 1, glow: 0, hollow: 0, dot: 1, pill: 0 })
  })

  it('(dn) live with unread: the pill replaces the dot', () => {
    expect(DISC_FRAMES.dn).toMatchObject({ fill: 1, ink: 1, dot: 0, pill: 1, pillScale: 1 })
  })

  it('every state differs from every other with the glow off (still, greyscale, Reduce Motion)', () => {
    const looks = Object.keys(DISC_FRAMES) as DiscLook[]
    for (const x of looks) {
      for (const y of looks) {
        if (x === y) continue
        expect({ x, y, same: JSON.stringify({ ...DISC_FRAMES[x], glow: 0 }) === JSON.stringify({ ...DISC_FRAMES[y], glow: 0 }) }).toEqual({ x, y, same: false })
      }
    }
  })
})

describe('transitions (§11.4, transitions.js)', () => {
  it('a → b: the ring draws on, ~450ms ease-out', () => {
    const steps = discTransition('a', 'b', false)
    expect(step(steps, 'ringDraw')).toMatchObject({ from: 0, to: 1, duration: 450, easing: 'gentle' })
    expect(step(steps, 'ring')).toMatchObject({ to: 1, duration: 0 })
  })

  it('a → b under Reduce Motion: a 200ms fade of the ring, no draw-on', () => {
    const steps = discTransition('a', 'b', true)
    expect(steps).toEqual([expect.objectContaining({ channel: 'ring', to: 1, ...CROSSFADE })])
  })

  it.each(['a', 'b'] as const)('%s → c: the gradient rises, the mark turns at the midpoint, one M.snap pulse, the glow holds', (from) => {
    const steps = discTransition(from, 'c', false)
    expect(step(steps, 'fill')).toMatchObject({ to: 1, duration: 500, easing: 'gentle' })
    expect(step(steps, 'ink')).toMatchObject({ to: 1, delay: 220, duration: DURATION.quick })
    expect(step(steps, 'pulse')).toMatchObject({ from: 1.06, to: 1, spring: 'snap', delay: 600 })
    expect(step(steps, 'glow')).toMatchObject({ to: 1, delay: 600, duration: DURATION.base })
    expect(step(steps, 'hollow')).toMatchObject({ to: 1, delay: 450, duration: DURATION.base })
  })

  it('… and the whole entry stays under 1.5s', () => {
    // A spring has no duration; M.snap settles in ~300ms (the export's engine.js).
    const SNAP_SETTLES = 300
    const end = Math.max(...discTransition('b', 'c', false).map((s) => (s.delay ?? 0) + (s.spring ? SNAP_SETTLES : s.duration ?? 0)))
    expect(end).toBeLessThan(1500)
  })

  it('b → c under Reduce Motion: a 200ms crossfade to the still, no rise, no pulse', () => {
    const steps = discTransition('b', 'c', true)
    expect(steps.map((s) => s.channel).sort()).toEqual(['fill', 'glow', 'hollow', 'ink', 'ring'])
    for (const s of steps) expect(s).toMatchObject(CROSSFADE)
    expect(step(steps, 'pulse')).toBeUndefined()
  })

  it('c → d: the glow collapses, one ripple, the hollow ring fills green', () => {
    const steps = discTransition('c', 'd', false)
    expect(step(steps, 'glow')).toMatchObject({ to: 0, duration: 350, easing: 'exit' })
    expect(step(steps, 'ripple')).toMatchObject({ from: 0, to: 1, duration: 600 })
    // One timing for both halves of the marker, so the ink cut-out never dips.
    expect(step(steps, 'dot')).toMatchObject({ to: 1, delay: 100, duration: DURATION.base })
    expect(step(steps, 'hollow')).toMatchObject({ to: 0, delay: 100, duration: DURATION.base })
  })

  it('c → d under Reduce Motion: a crossfade, no ripple', () => {
    const steps = discTransition('c', 'd', true)
    expect(step(steps, 'ripple')).toBeUndefined()
    for (const s of steps) expect(s).toMatchObject(CROSSFADE)
  })

  it('d → a: the fill drains, the mark turns back at the midpoint, the dot fades', () => {
    const steps = discTransition('d', 'a', false)
    expect(step(steps, 'fill')).toMatchObject({ to: 0, duration: 400, easing: 'exit' })
    expect(step(steps, 'ink')).toMatchObject({ to: 0, delay: 160, duration: DURATION.quick })
    expect(step(steps, 'dot')).toMatchObject({ to: 0, duration: DURATION.base, easing: 'exit' })
  })

  it('d → a under Reduce Motion: a crossfade', () => {
    for (const s of discTransition('d', 'a', true)) expect(s).toMatchObject(CROSSFADE)
  })

  it('unread 0 → n: the pill pops in on M.pop and the dot gives way to it', () => {
    const steps = discTransition('d', 'dn', false)
    expect(step(steps, 'pillScale')).toMatchObject({ to: 1, spring: 'pop' })
    expect(step(steps, 'pill')).toMatchObject({ to: 1, duration: 100 })
    // Once the pill is opaque: the dot's cut-out ring holds the spot until then.
    expect(step(steps, 'dot')).toMatchObject({ to: 0, delay: 100, duration: 0 })
  })

  it('unread n → 0: the pill pops out on M.snap and the dot comes back', () => {
    const steps = discTransition('dn', 'd', false)
    expect(step(steps, 'pillScale')).toMatchObject({ to: 0.6, spring: 'snap' })
    expect(step(steps, 'pill')).toMatchObject({ to: 0, duration: DURATION.quick })
    expect(step(steps, 'dot')).toMatchObject({ to: 1, delay: DURATION.quick, duration: 0 })
  })

  it('unread under Reduce Motion: instant', () => {
    for (const [from, to] of [['d', 'dn'], ['dn', 'd']] as const) {
      for (const s of discTransition(from, to, true)) expect(s).toMatchObject({ duration: 0 })
    }
  })

  it('live with unread → idle: drains, and the pill leaves with it', () => {
    const steps = discTransition('dn', 'a', false)
    expect(step(steps, 'fill')).toMatchObject({ to: 0, duration: 400 })
    expect(step(steps, 'pillScale')).toMatchObject({ spring: 'snap' })
  })

  it('a pair the spec does not draw (c → a) tweens over base, a crossfade under Reduce Motion', () => {
    for (const s of discTransition('c', 'a', false).filter((x) => x.channel !== 'pulse')) {
      expect(s).toMatchObject({ duration: DURATION.base, easing: 'gentle' })
    }
    for (const s of discTransition('c', 'a', true)) expect(s).toMatchObject(CROSSFADE)
  })

  it('no state is reached by a transition alone: each lands on its still frame', () => {
    const looks = Object.keys(DISC_FRAMES) as DiscLook[]
    for (const from of looks) {
      for (const to of looks) {
        for (const rm of [false, true]) {
          const landed = { ...DISC_FRAMES[from] }
          for (const s of discTransition(from, to, rm)) landed[s.channel] = s.to
          expect({ from, to, rm, landed }).toEqual({ from, to, rm, landed: DISC_FRAMES[to] })
        }
      }
    }
  })

  it('leaving (c) before its pulse (600ms in) settles the pulse instead of letting it fire in the next state', () => {
    for (const to of ['a', 'b', 'd', 'dn'] as const) {
      expect(step(discTransition('c', to, false), 'pulse')).toEqual({ channel: 'pulse', to: 1, spring: 'snap' })
    }
    // Under Reduce Motion nothing ever pulses, so there is nothing to settle.
    expect(step(discTransition('c', 'a', true), 'pulse')).toBeUndefined()
  })

  it('re-entering (c) on foreground: the one pulse again; nothing under Reduce Motion', () => {
    expect(discReentry(false)).toEqual([{ channel: 'pulse', from: 1.06, to: 1, spring: 'snap' }])
    expect(discReentry(true)).toEqual([])
  })
})

describe('<Disc>', () => {
  beforeEach(() => reduceMotion.mockReturnValue(false))

  const draw = (look: DiscLook, props: Partial<React.ComponentProps<typeof Disc>> = {}) =>
    render(<Disc target={TARGETS[look]} onPress={() => {}} venue="Toit" {...props} />)

  it.each([
    ['a', 'See what’s on near you'],
    ['b', 'Open tonight’s event'],
    ['c', 'You’re at Toit. Check in to see who else is here'],
    ['d', 'Open the room'],
    ['dn', 'Open the room. 3 unread messages'],
  ] as const)('(%s) is a button that says “%s”', async (look, label) => {
    await draw(look)
    // The export's typographic apostrophes; the app's labels use straight ones.
    expect(screen.getByRole('button').props.accessibilityLabel).toBe(label.replace(/’/g, "'"))
  })

  it('(c) wears “Check in · {venue}” above the disc; no other state does', async () => {
    await draw('c')
    expect(screen.getByText('Check in · Toit', HIDDEN)).toBeTruthy()
    for (const look of ['a', 'b', 'd', 'dn'] as const) {
      await draw(look)
      expect(screen.queryByText(/Check in/, HIDDEN)).toBeNull()
    }
  })

  it('… hidden from screen readers: the disc says it, with the consequence', async () => {
    await draw('c')
    expect(screen.queryByText('Check in · Toit')).toBeNull()
  })

  it('(c) without a venue still says what the tap does', async () => {
    await draw('c', { venue: undefined })
    expect(screen.getByText('Check in', HIDDEN)).toBeTruthy()
    expect(screen.getByRole('button').props.accessibilityLabel).toBe("You're at an event. Check in to see who else is here")
  })

  it('(dn) shows the count; past nine, “9+”', async () => {
    await draw('dn')
    expect(screen.getByTestId('disc-pill')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    await render(<Disc target={{ ...TARGETS.dn, badge: 12 }} onPress={() => {}} />)
    expect(screen.getByText('9+')).toBeTruthy()
  })

  it('no pill in any other state', async () => {
    for (const look of ['a', 'b', 'c', 'd'] as const) {
      await draw(look)
      expect(screen.queryByTestId('disc-pill')).toBeNull()
    }
  })

  it.each(Object.keys(TARGETS) as DiscLook[])('(%s) mounts on its still frame', async (look) => {
    await draw(look)
    const opacity = (part: string) => Reanimated.getAnimatedStyle(screen.getByTestId(`disc-${part}`)).opacity
    const f = DISC_FRAMES[look]
    expect({ ring: opacity('ring'), glow: opacity('glow'), hollow: opacity('hollow'), dot: opacity('dot'), ink: opacity('mark-ink') }).toEqual({
      ring: f.ring,
      glow: f.glow,
      hollow: f.hollow,
      dot: f.dot,
      ink: f.ink,
    })
  })

  it('H.disc on press-in, the only haptic the disc makes; the tap opens', async () => {
    const onPress = jest.fn()
    await draw('a', { onPress })
    await fireEvent(screen.getByRole('button'), 'pressIn')
    expect(H.disc).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByRole('button'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('tapping the (c) label is tapping the disc', async () => {
    const onPress = jest.fn()
    await draw('c', { onPress })
    await fireEvent.press(screen.getByText('Check in · Toit', HIDDEN))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('plays the plan on a state change: b → c pulses on M.snap', async () => {
    await draw('b')
    ;(Reanimated.withSpring as jest.Mock).mockClear()
    await act(async () => screen.rerender(<Disc target={TARGETS.c} onPress={() => {}} venue="Toit" />))
    expect(Reanimated.withSpring).toHaveBeenCalledWith(1, expect.objectContaining(SPRING.snap))
  })

  it('… and under Reduce Motion does not pulse', async () => {
    reduceMotion.mockReturnValue(true)
    await draw('b')
    ;(Reanimated.withSpring as jest.Mock).mockClear()
    await act(async () => screen.rerender(<Disc target={TARGETS.c} onPress={() => {}} venue="Toit" />))
    expect(Reanimated.withSpring).not.toHaveBeenCalled()
  })

  it('announces entering (c) once, politely; mounting in (c) does not', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => {})
    await draw('c')
    expect(announce).not.toHaveBeenCalled()
    await act(async () => screen.rerender(<Disc target={TARGETS.a} onPress={() => {}} venue="Toit" />))
    await act(async () => screen.rerender(<Disc target={TARGETS.c} onPress={() => {}} venue="Toit" />))
    expect(announce).toHaveBeenCalledTimes(1)
    expect(announce).toHaveBeenCalledWith("You're at Toit. Check in from the Blend'n button.", { queue: true })
  })

  describe('back from the background in (c)', () => {
    let change: (s: AppStateStatus) => void = () => {}
    let now = 0
    beforeEach(() => {
      jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
        change = handler as typeof change
        return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>
      })
      jest.spyOn(Date, 'now').mockImplementation(() => now)
    })
    afterEach(() => jest.restoreAllMocks())

    const away = async (ms: number) => {
      ;(Reanimated.withSpring as jest.Mock).mockClear()
      now = 1_000_000
      await act(async () => change('background'))
      now += ms
      await act(async () => change('active'))
    }

    it('after more than a minute away: one M.snap pulse', async () => {
      await draw('c')
      await away(61_000)
      expect(Reanimated.withSpring).toHaveBeenCalledTimes(1)
      expect(Reanimated.withSpring).toHaveBeenCalledWith(1, expect.objectContaining(SPRING.snap))
    })

    it('a glance away (under a minute) does not', async () => {
      await draw('c')
      await away(5_000)
      expect(Reanimated.withSpring).not.toHaveBeenCalled()
    })

    it('Reduce Motion: never', async () => {
      reduceMotion.mockReturnValue(true)
      await draw('c')
      await away(61_000)
      expect(Reanimated.withSpring).not.toHaveBeenCalled()
    })
  })
})
