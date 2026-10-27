/*
 * Crews' motion (audit C2, C3, C5, C6): the made beat's emblem crossfades over its placeholder, Like → Liked pops from 0.85
 * and holds a long name, the first-open card leaves with a fade, and a reveal fades to the photo only once it has loaded.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return {
    ...actual,
    __esModule: true,
    useReducedMotion: jest.fn(() => false),
    withSpring: jest.fn(actual.withSpring),
    withTiming: jest.fn(actual.withTiming),
    withDelay: jest.fn(actual.withDelay),
  }
})
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} />, isGlassEffectAPIAvailable: jest.fn(() => true), isLiquidGlassAvailable: jest.fn(() => true) }
})
// The image's own load event, which the real component fires once it has decoded.
jest.mock('expo-image', () => {
  const { View } = jest.requireActual('react-native')
  return { Image: (props: object) => <View testID="photo" {...props} /> }
})

import * as Reanimated from 'react-native-reanimated'

import { MadeBeat } from '../components/crews/MadeBeat'
import { CrewCard, popIn } from '../components/ds/CrewCard'
import { RevealSide } from '../components/ds/RevealSheet'
import { SPRING } from '../lib/design/tokens'

const rm = Reanimated.useReducedMotion as jest.Mock
const withSpring = Reanimated.withSpring as jest.Mock
const withTiming = Reanimated.withTiming as jest.Mock
const withDelay = Reanimated.withDelay as jest.Mock

beforeEach(() => {
  rm.mockReturnValue(false)
  withSpring.mockClear()
  withTiming.mockClear()
  withDelay.mockClear()
})

describe('the made beat (C2)', () => {
  it('settles the emblem in on M.settle from 0.8, not a timed curve', async () => {
    await render(<MadeBeat name="Nebula" emblemSeed={null} invited={2} onContinue={jest.fn()} />)
    expect(withSpring).toHaveBeenCalledWith(1, expect.objectContaining({ stiffness: SPRING.settle.stiffness }))
  })

  it('Reduce Motion: it still fades (200), with no scale', async () => {
    rm.mockReturnValue(true)
    await render(<MadeBeat name="Nebula" emblemSeed={null} invited={2} onContinue={jest.fn()} />)
    expect(withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 200 }))
    expect(withSpring).not.toHaveBeenCalled()
  })

  it('the real emblem fades in over the placeholder, which stays under it', async () => {
    const view = await render(<MadeBeat name="Nebula" emblemSeed={null} invited={2} onContinue={jest.fn()} />)
    expect(screen.queryByTestId('make-emblem')).toBeNull()
    await view.rerender(<MadeBeat name="Nebula" emblemSeed="abc" invited={2} onContinue={jest.fn()} />)
    expect(screen.getByTestId('make-emblem').props.entering).toBeDefined()
    expect(screen.getByTestId('make-emblem-pending')).toBeTruthy()
  })
})

describe('Like → Liked (C3)', () => {
  const crew = { name: 'Nebula', emblemSeed: 's', size: 4, here: 2, tags: [], intent: undefined }

  it('pops in from 0.85 on M.pop, never from nothing', () => {
    const b = popIn(false)()
    expect(b.initialValues.transform[0].scale).toBe(0.85)
    expect(b.initialValues.opacity).toBe(1)
  })

  it('Reduce Motion: a 180 ms fade in place', () => {
    const b = popIn(true)()
    expect(b.initialValues).toEqual({ opacity: 0, transform: [{ scale: 1 }] })
  })

  it('the settled plate carries the pop and springs on M.pop', async () => {
    await render(<CrewCard crew={crew} like={{ liked: true, as: 'Orbit', onPress: jest.fn() }} />)
    const plate = screen.getByTestId('crew-liked')
    expect(plate.props.entering).toBeDefined()
    const b = plate.props.entering()
    expect(b.initialValues.transform[0].scale).toBe(0.85)
    expect(withSpring).toHaveBeenCalledWith(1, expect.objectContaining({ stiffness: SPRING.pop.stiffness }))
  })

  it('holds a legal 32-character name: two lines and no fixed height', async () => {
    const as = 'The Midnight Philosophers Society'
    await render(<CrewCard crew={crew} like={{ liked: true, as, onPress: jest.fn() }} />)
    const text = screen.getByText(`Liked for ${as}`)
    expect(text.props.numberOfLines).toBe(2)
    const plate = StyleSheet.flatten(screen.getByTestId('crew-liked').props.style)
    expect(plate.height).toBeUndefined()
    expect(plate.minHeight).toBe(56)
  })
})

describe('the reveal crossfade waits for the photo (C6)', () => {
  const people = (photo: string | null) => [
    { pseudonym: 'Cosmic Panda', photo },
    { pseudonym: 'Brave Turtle', photo: null },
  ]
  const side = { kind: 'crew' as const, name: 'Orbit', emblemSeed: 's' }

  it('does not start the tween when the photo arrives, only when it has loaded', async () => {
    const view = await render(<RevealSide side={side} people={people(null)} />)
    withTiming.mockClear()
    await view.rerender(<RevealSide side={side} people={people('https://cdn/p.jpg')} />)
    expect(withTiming).not.toHaveBeenCalledWith(1, expect.anything())
    await act(async () => screen.getByTestId('photo', { includeHiddenElements: true }).props.onLoad())
    expect(withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 220 }))
  })

  it('Reduce Motion: it is set the moment it has loaded, with no tween', async () => {
    rm.mockReturnValue(true)
    const view = await render(<RevealSide side={side} people={people(null)} />)
    await view.rerender(<RevealSide side={side} people={people('https://cdn/p.jpg')} />)
    withTiming.mockClear()
    await act(async () => screen.getByTestId('photo', { includeHiddenElements: true }).props.onLoad())
    expect(withTiming).not.toHaveBeenCalled()
  })

  it('a photo that was already shown does not fade again when its image reloads', async () => {
    await render(<RevealSide side={side} people={people('https://cdn/p.jpg')} />)
    withTiming.mockClear()
    await act(async () => screen.getByTestId('photo', { includeHiddenElements: true }).props.onLoad())
    expect(withTiming).not.toHaveBeenCalled()
  })
})

void fireEvent
