/*
 * The landing's sky (components/onboarding/GalaxyBackdrop.tsx, Flow 1b): two galaxies collide once under real gravity
 * behind the old landing, and the forms behind it show what they left. What has to hold:
 * - the landing runs the physics from a frame callback, and that callback stops at the film's end: no loop, no work after;
 * - it holds while the app is in the background or the keyboard is up;
 * - Reduce Motion draws the committed remnant, still, and never starts the physics;
 * - the form level draws the remnant too (dimmed, turning, then still) and never re-simulates;
 * - a low-end Android phone runs half the stars;
 * - it is decoration: untouchable and hidden from a screen reader.
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AppState, Platform, type AppStateStatus } from 'react-native'

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
import { END_AT, advanceFilm, startFilm } from '../lib/galaxySim'
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

  it('stops the frame callback at the film’s end, and nothing restarts it', async () => {
    await render(<GalaxyBackdrop mode="collision" />)
    // 100 ms frames: the film's own cap per frame, so END_AT is END_AT × 10 frames away.
    await frames(END_AT * 10 - 1, 100)
    expect(lastActive()).toBe(true)
    await frames(1, 100)
    expect(lastActive()).toBe(false)
    await act(async () => appState?.('background'))
    await act(async () => appState?.('active'))
    expect(lastActive()).toBe(false)
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
