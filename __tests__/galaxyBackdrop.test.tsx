/*
 * The landing's sky (components/onboarding/GalaxyBackdrop.tsx, Flow 1b): two galaxies collide once under real gravity
 * behind the old landing, and the forms behind it show what they left. What has to hold:
 * - the landing runs the physics from a frame callback; after it the remnant turns on with no end, until the person
 *   leaves the landing (owner, 2026-11-03), and the screens after it start from where it was left;
 * - it holds while the app is in the background, the keyboard is up or another screen is over it (`paused`);
 * - Reduce Motion draws the committed remnant, still, and never starts the physics;
 * - the form level draws the remnant too (dimmed, turning, then still) and never re-simulates;
 * - a low-end Android phone runs half the stars;
 * - past the freeze the landing draws the stars once into one image and turns that, no per-star work (SCRUM-1015);
 * - it is decoration: untouchable and hidden from a screen reader.
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AppState, Dimensions, PixelRatio, Platform, type AppStateStatus } from 'react-native'

type FrameInfo = { timeSincePreviousFrame: number | null }
const mockFrame = { cb: null as null | ((info: FrameInfo) => void), setActive: jest.fn(), registered: 0 }
let mockRM = false
let mockMemory: number | null = 8 * 1024 ** 3

jest.mock('../lib/motion', () => ({ ...jest.requireActual('../lib/motion'), useReducedMotion: () => mockRM }))
jest.mock('expo-device', () => ({
  get totalMemory() {
    return mockMemory
  },
}))
const mockWithTiming = jest.fn()
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  __esModule: true,
  withTiming: (...args: unknown[]) => {
    mockWithTiming(...args)
    return jest.requireActual('react-native-reanimated').withTiming(...args)
  },
  useFrameCallback: (cb: (info: FrameInfo) => void) => {
    mockFrame.cb = cb
    mockFrame.registered++
    return { setActive: mockFrame.setActive, isActive: false, callbackId: 1 }
  },
}))
jest.mock('../lib/galaxySim', () => {
  const actual = jest.requireActual('../lib/galaxySim')
  return { ...actual, startFilm: jest.fn(actual.startFilm), advanceFilm: jest.fn(actual.advanceFilm) }
})

import { Backdrop, ORB_LEVEL } from '../components/onboarding/Backdrop'
import { GalaxyBackdrop } from '../components/onboarding/GalaxyBackdrop'
import { COLOR } from '../lib/design/tokens'
import REMNANT from '../assets/galaxy/remnant.json'
import { END_AT, FREEZE_AT, GALAXY_B, advanceFilm, startFilm } from '../lib/galaxySim'
import { tint } from '../lib/theme'

const HIDDEN = { includeHiddenElements: true }
const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
/** What the sky would draw: its Skia nodes of a type (the mock names each host `sk-<type>`). */
const drawn = (sky: string, type: string) => screen.getByTestId(sky, HIDDEN).queryAll((n) => n.type === `sk-${type}`)
/** The tagline's shelf: the one group the sky moves into place. */
const shelfIn = (sky: string) => drawn(sky, 'Group').find((g) => g.props.transform)
/** Let what was scheduled onto the UI thread run (the worklets mock runs it on the next animation frame). */
const uiThread = () => act(() => new Promise((resolve) => setTimeout(resolve, 50)))
const lastActive = () => mockFrame.setActive.mock.calls.at(-1)?.[0]
/** n frames of `ms` each, as the UI thread would call them. */
const frames = async (n: number, ms = 1000 / 60) =>
  act(async () => {
    for (let i = 0; i < n; i++) mockFrame.cb?.({ timeSincePreviousFrame: ms })
  })

let appState: ((s: AppStateStatus) => void) | undefined
beforeEach(() => {
  mockWithTiming.mockClear()
  on('ios')
  mockRM = false
  mockMemory = 8 * 1024 ** 3
  mockFrame.cb = null
  mockFrame.registered = 0
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_e, fn) => {
    appState = fn as (s: AppStateStatus) => void
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>
  })
})

describe('the landing: the collision, once', () => {
  it('runs the physics from a frame callback: the film starts on the UI thread’s first frame and steps every frame', async () => {
    await render(<GalaxyBackdrop mode="collision" />)
    expect(screen.getByTestId('galaxy-live', HIDDEN)).toBeTruthy()
    expect(lastActive()).toBe(true)
    await frames(3)
    expect(startFilm).toHaveBeenCalledTimes(1)
    expect(startFilm).toHaveBeenCalledWith(2000)
    expect(advanceFilm).toHaveBeenCalledTimes(3)
  })

  it('keeps the frame callback on past the film’s end, a minute and more: the remnant turns until they leave', async () => {
    await render(<GalaxyBackdrop mode="collision" />)
    // 100 ms frames: the film's own cap per frame, so END_AT is END_AT × 10 frames away; then a minute more.
    await frames(END_AT * 10 + 600, 100)
    expect(lastActive()).toBe(true)
    expect(mockFrame.setActive).not.toHaveBeenCalledWith(false)
    await act(async () => appState?.('background'))
    expect(lastActive()).toBe(false)
    await act(async () => appState?.('active'))
    expect(lastActive()).toBe(true)
  })

  it('holds while the app is in the background, and goes on when it comes back', async () => {
    await render(<GalaxyBackdrop mode="collision" />)
    await act(async () => appState?.('background'))
    expect(lastActive()).toBe(false)
    await act(async () => appState?.('active'))
    expect(lastActive()).toBe(true)
  })

  it('holds while the keyboard is up (`paused`)', async () => {
    const { rerender } = await render(<GalaxyBackdrop mode="collision" />)
    expect(lastActive()).toBe(true)
    await rerender(<GalaxyBackdrop mode="collision" paused />)
    expect(lastActive()).toBe(false)
    await rerender(<GalaxyBackdrop mode="collision" />)
    expect(lastActive()).toBe(true)
  })

  it('a low-end Android phone (under 3 GB) runs 1,000 stars; a 4 GB one, all 2,000', async () => {
    on('android')
    mockMemory = 2 * 1024 ** 3
    await render(<GalaxyBackdrop mode="collision" />)
    await frames(1)
    expect(startFilm).toHaveBeenLastCalledWith(1000)
    mockMemory = 4 * 1024 ** 3
    await render(<GalaxyBackdrop mode="collision" />)
    await frames(1)
    expect(startFilm).toHaveBeenLastCalledWith(2000)
  })

  it('carries the tagline’s shelf: an ink band behind the words, at 0.94', async () => {
    await render(<GalaxyBackdrop mode="collision" shelf={{ x: 24, y: 304, width: 342, height: 24 }} />)
    const shelf = shelfIn('galaxy-live')
    expect(shelf?.props.transform).toEqual(expect.arrayContaining([{ translateX: 195 }, { translateY: 316 }]))
    const [solid] = shelf?.queryAll((n) => n.type === 'sk-RadialGradient')[0].props.colors
    expect(solid).toBe(tint(COLOR.ink, 0.94))
  })
})

describe('past the freeze: the remnant drawn once, then turned as one image (SCRUM-1015)', () => {
  type Made = { width: number; height: number; calls: unknown[][]; image: object }
  const offscreen = (): { fail: boolean; made: Made[] } => require('@shopify/react-native-skia').offscreen
  const calls = (m: Made, name: string) => m.calls.filter((c) => c[0] === name)
  /** The image's turn, radians: the one group the baked sky turns about its centre. */
  const spin = () => drawn('galaxy-live', 'Group').find((g) => g.props.origin)?.props.transform.value[0].rotate
  const FROZEN = FREEZE_AT * 10 + 1
  beforeEach(() => {
    offscreen().fail = false
    offscreen().made.length = 0
  })

  it('draws every star, live, until the physics stops: nothing is baked before FREEZE_AT', async () => {
    await render(<GalaxyBackdrop mode="collision" />)
    await frames(FREEZE_AT * 10 - 2, 100)
    expect(offscreen().made).toHaveLength(0)
    expect(drawn('galaxy-live', 'Atlas')).toHaveLength(4)
    expect(drawn('galaxy-live', 'Image')).toHaveLength(0)
  })

  it('at the freeze draws the stars, the cores and the bloom once into one image, and from then on the sky draws only that', async () => {
    await render(<GalaxyBackdrop mode="collision" />)
    await frames(FROZEN, 100)
    await frames(600, 100)
    const [made] = offscreen().made
    expect(offscreen().made).toHaveLength(1)
    const atlases = calls(made, 'drawAtlas')
    expect(atlases).toHaveLength(4)
    const [, , srcs, dsts, paint, mode, colors] = atlases[0] as [string, unknown, unknown[], unknown[], { props: Record<string, unknown> }, number, unknown[]]
    expect([srcs.length, dsts.length, colors.length]).toEqual([2000, 2000, 2000])
    expect(paint.props.setBlendMode).toBe(12)
    expect(mode).toBe(13)
    expect((atlases[1][3] as unknown[]).length).toBe(4)
    const [[, bloom]] = calls(made, 'saveLayer') as [string, { props: Record<string, unknown> }][]
    expect(bloom.props).toEqual({ setBlendMode: 12, setAlphaf: 0.55, setImageFilter: { blur: [6, 6, 3, null] } })
    await uiThread()
    expect(drawn('galaxy-live', 'Atlas')).toHaveLength(0)
    const images = drawn('galaxy-live', 'Image')
    expect(images).toHaveLength(1)
    expect(images[0].props.image.value).toBe(made.image)
    expect(images[0].props.blendMode).toBe('plus')
  })

  it('the image covers every point the sky shows at any turn: a square about the centre out to the farthest corner above the fade', async () => {
    await render(<GalaxyBackdrop mode="collision" />)
    await frames(FROZEN, 100)
    const [made] = offscreen().made
    const { width, height } = Dimensions.get('window')
    const cy = (height * 180) / 844
    const reach = Math.hypot(width / 2, height * 0.7 - cy)
    expect(made.width).toBe(made.height)
    expect(made.width / PixelRatio.get()).toBeGreaterThanOrEqual(2 * reach)
    await uiThread()
    const [image] = drawn('galaxy-live', 'Image')
    expect(image.props.x + image.props.width / 2).toBeCloseTo(width / 2, 0)
    expect(image.props.y + image.props.height / 2).toBeCloseTo(cy, 0)
    expect(image.props.width).toBeCloseTo(made.width / PixelRatio.get(), 5)
  })

  it('turns at the remnant’s 3°/s from the angle it was baked at, the orbit’s way, and the forms still start from where it was left', async () => {
    await render(<GalaxyBackdrop mode="collision" />)
    await frames(FROZEN, 100)
    await uiThread()
    const at = spin()
    await frames(100, 100)
    await uiThread()
    const sense = startFilm(2000).spin
    expect(spin() - at).toBeCloseTo((-sense * 10 * GALAXY_B.look.turn * Math.PI) / 180, 4)
    expect(Math.abs(at)).toBeLessThan((GALAXY_B.look.turn * Math.PI) / 180)
    await render(<GalaxyBackdrop mode="remnant" />)
    expect(drawn('galaxy-remnant', 'Atlas')).toHaveLength(4)
  })

  it('a low-end phone bakes its 1,000 stars without the bloom', async () => {
    on('android')
    mockMemory = 2 * 1024 ** 3
    await render(<GalaxyBackdrop mode="collision" />)
    await frames(FROZEN, 100)
    const [made] = offscreen().made
    expect(calls(made, 'drawAtlas')).toHaveLength(2)
    expect((calls(made, 'drawAtlas')[0][3] as unknown[]).length).toBe(1000)
    expect(calls(made, 'saveLayer')).toHaveLength(0)
  })

  it('with no GPU surface the stars stay live, as before, and the bake is not tried again every frame', async () => {
    offscreen().fail = true
    const make = jest.spyOn(require('@shopify/react-native-skia').Skia.Surface, 'MakeOffscreen')
    await render(<GalaxyBackdrop mode="collision" />)
    await frames(FROZEN + 100, 100)
    await uiThread()
    expect(make).toHaveBeenCalledTimes(1)
    expect(drawn('galaxy-live', 'Atlas')).toHaveLength(4)
    expect(drawn('galaxy-live', 'Image')).toHaveLength(0)
    make.mockRestore()
  })

  it('held while paused or in the background, as before: the turn stops with the frame callback', async () => {
    const { rerender } = await render(<GalaxyBackdrop mode="collision" />)
    await frames(FROZEN, 100)
    await rerender(<GalaxyBackdrop mode="collision" paused />)
    expect(lastActive()).toBe(false)
    await act(async () => appState?.('background'))
    await rerender(<GalaxyBackdrop mode="collision" />)
    expect(lastActive()).toBe(false)
    await act(async () => appState?.('active'))
    expect(lastActive()).toBe(true)
  })
})

describe('Reduce Motion', () => {
  it('draws the committed remnant, still, and never starts the physics', async () => {
    mockRM = true
    await render(<GalaxyBackdrop mode="collision" shelf={{ x: 24, y: 304, width: 342, height: 24 }} />)
    expect(screen.getByTestId('galaxy-remnant', HIDDEN)).toBeTruthy()
    expect(screen.queryByTestId('galaxy-live', HIDDEN)).toBeNull()
    expect(shelfIn('galaxy-remnant')).toBeTruthy()
    expect(mockFrame.registered).toBe(0)
    expect(startFilm).not.toHaveBeenCalled()
    await uiThread()
    expect(mockWithTiming).not.toHaveBeenCalled()
  })
})

describe('the form level: what the collision left', () => {
  it('draws the remnant from the committed file, never the sim', async () => {
    await render(<GalaxyBackdrop mode="remnant" />)
    expect(screen.getByTestId('galaxy-remnant', HIDDEN)).toBeTruthy()
    expect(mockFrame.registered).toBe(0)
    expect(startFilm).not.toHaveBeenCalled()
    expect(advanceFilm).not.toHaveBeenCalled()
  })

  it('turns, holds while the keyboard is up, and takes up the rest of its turn when it goes down', async () => {
    const { rerender } = await render(<GalaxyBackdrop mode="remnant" />)
    await uiThread()
    expect(mockWithTiming).toHaveBeenLastCalledWith(8, expect.objectContaining({ duration: 12000 }))
    mockWithTiming.mockClear()
    await rerender(<GalaxyBackdrop mode="remnant" paused />)
    await uiThread()
    expect(mockWithTiming).not.toHaveBeenCalled()
    await rerender(<GalaxyBackdrop mode="remnant" />)
    await uiThread()
    expect(mockWithTiming).toHaveBeenCalledTimes(1)
    expect(mockWithTiming.mock.calls[0][1].duration).toBeLessThanOrEqual(12000)
  })

  it('starts from where the landing was left: the landing’s turn past the file’s frame, the way it was turning', async () => {
    /** Star 0's centre on the remnant's first frame (its sprite is offset by half its scaled size). */
    const firstStar = () => {
      const [stars] = drawn('galaxy-remnant', 'Atlas')
      const xf = stars.props.transforms.value[0]
      return { x: xf.tx + xf.scos * 32, y: xf.ty + xf.scos * 32 }
    }
    // A fresh landing sets the offset back to nothing.
    await render(<GalaxyBackdrop mode="collision" />)
    await frames(1)
    await render(<GalaxyBackdrop mode="remnant" />)
    const before = firstStar()
    // The landing left ten seconds past END_AT: 30° on.
    await render(<GalaxyBackdrop mode="collision" />)
    await frames(END_AT * 10 + 100, 100)
    await render(<GalaxyBackdrop mode="remnant" />)
    const after = firstStar()
    const { width, height } = Dimensions.get('window')
    const cx = width / 2
    const cy = (height * 180) / 844
    const a = (-startFilm(2000).spin * 10 * GALAXY_B.look.turn * Math.PI) / 180
    const dx = before.x - cx
    const dy = before.y - cy
    expect(Math.hypot(dx, dy)).toBeGreaterThan(1)
    expect(after.x).toBeCloseTo(cx + dx * Math.cos(a) - dy * Math.sin(a), 2)
    expect(after.y).toBeCloseTo(cy + dx * Math.sin(a) + dy * Math.cos(a), 2)
    expect(REMNANT.n).toBe(2000)
  })

  it('every star is placed on the frame, all 2,000 and the two cores', async () => {
    await render(<GalaxyBackdrop mode="remnant" />)
    const [stars, cores] = drawn('galaxy-remnant', 'Atlas')
    expect(stars.props.transforms.value).toHaveLength(2000)
    expect(stars.props.transforms.value.every((xf: { tx: number }) => Number.isFinite(xf.tx))).toBe(true)
    expect(cores.props.transforms.value).toHaveLength(4)
  })
})

describe('decoration', () => {
  it('is untouchable and hidden from a screen reader, in either mode', async () => {
    for (const mode of ['collision', 'remnant'] as const) {
      await render(<GalaxyBackdrop mode={mode} testID="sky" />)
      const sky = screen.getByTestId('sky', HIDDEN)
      expect(sky.props.pointerEvents).toBe('none')
      expect(sky.props.accessibilityElementsHidden).toBe(true)
      expect(sky.props.importantForAccessibility).toBe('no-hide-descendants')
    }
  })
})

describe('Backdrop', () => {
  it('the landing (entering) plays the collision; the forms and the rest show the remnant; no orbs', async () => {
    await render(<Backdrop level={ORB_LEVEL.landing} enter />)
    expect(screen.getByTestId('galaxy-live', HIDDEN)).toBeTruthy()
    await render(<Backdrop level={ORB_LEVEL.form} paused />)
    expect(screen.getByTestId('galaxy-remnant', HIDDEN)).toBeTruthy()
    await render(<Backdrop level={ORB_LEVEL.landing} />)
    expect(screen.getByTestId('galaxy-remnant', HIDDEN)).toBeTruthy()
    expect(screen.queryByTestId('orbs', HIDDEN)).toBeNull()
  })
})
