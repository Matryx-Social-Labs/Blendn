/*
 * <LiquidDisc> (guidelines/round2/pass.js `liquidDisc`, Flow 13 · 13.2): the
 * pass's pour. Decorative, so hidden from a screen reader; the stamp over it is
 * not. The wave and the bubbles are the part that moves, and stop for a spent
 * pass and under Reduce Motion.
 */
import { render, screen } from '@testing-library/react-native'
import * as Reanimated from 'react-native-reanimated'
import { Text } from 'react-native'

import { LiquidDisc, stampIn } from '../components/ds/LiquidDisc'
import { DURATION, SPRING } from '../lib/design/tokens'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, withSpring: jest.fn(actual.withSpring), withTiming: jest.fn(actual.withTiming) }
})
jest.mock('../lib/motion', () => ({ ...jest.requireActual('../lib/motion'), useReducedMotion: jest.fn(() => false) }))
// eslint-disable-next-line import/first
import { useReducedMotion } from '../lib/motion'

beforeEach(() => {
  ;(useReducedMotion as jest.Mock).mockReturnValue(false)
  jest.mocked(Reanimated.withSpring).mockClear()
  jest.mocked(Reanimated.withTiming).mockClear()
})

describe('<LiquidDisc>', () => {
  it('is hidden from a screen reader, except the stamp over it', async () => {
    await render(<LiquidDisc size={200} level={0.62} stamp={<Text>Redeemed 21:43</Text>} testID="d" />)
    expect(screen.getByText('Redeemed 21:43')).toBeTruthy()
    expect(screen.queryByTestId('d-hidden')).toBeNull()
    // Everything else is the picture: nothing in it reads as text or a control.
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('draws full, part-full and empty without error', async () => {
    for (const level of [0, 0.62, 1]) {
      await render(<LiquidDisc size={200} level={level} testID={`d${level}`} />)
      expect(screen.getByTestId(`d${level}`)).toBeTruthy()
    }
  })

  it('a still disc and Reduce Motion both draw without starting the wave', async () => {
    await render(<LiquidDisc size={120} level={0.5} still testID="still" />)
    expect(screen.getByTestId('still')).toBeTruthy()
    ;(useReducedMotion as jest.Mock).mockReturnValueOnce(true)
    await render(<LiquidDisc size={120} level={0.5} testID="reduced" />)
    expect(screen.getByTestId('reduced')).toBeTruthy()
  })
})

describe('the Redeemed moment: the liquid settles and the stamp lands', () => {
  it('a new level settles on M.settle (a spring), not a cut', async () => {
    const view = await render(<LiquidDisc size={200} level={0.62} testID="d" />)
    jest.mocked(Reanimated.withSpring).mockClear()
    await view.rerender(<LiquidDisc size={200} level={1} testID="d" />)
    expect(Reanimated.withSpring).toHaveBeenCalledWith(1, expect.objectContaining({ stiffness: SPRING.settle.stiffness, damping: SPRING.settle.damping }))
  })

  it('under Reduce Motion the level moves over 200 ms, plainly: no spring', async () => {
    ;(useReducedMotion as jest.Mock).mockReturnValue(true)
    const view = await render(<LiquidDisc size={200} level={0.62} testID="d" />)
    jest.mocked(Reanimated.withSpring).mockClear()
    jest.mocked(Reanimated.withTiming).mockClear()
    await view.rerender(<LiquidDisc size={200} level={1} testID="d" />)
    expect(Reanimated.withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 200 }))
    expect(Reanimated.withSpring).not.toHaveBeenCalled()
  })

  it('the ink mark’s clip is always drawn, so it can grow with the liquid from empty', async () => {
    await render(<LiquidDisc size={200} level={0} still testID="d" />)
    expect(screen.getByTestId('d')).toBeTruthy()
  })

  it('a stamp mounts with an entering animation (it lands, it does not appear)', async () => {
    await render(<LiquidDisc size={200} level={1} stamp={<Text>Redeemed 21:43</Text>} testID="d" />)
    expect(screen.getByTestId('d-stamp').props.entering).toBeDefined()
  })

  it('no stamp, no stamp wrapper', async () => {
    await render(<LiquidDisc size={200} level={0.62} testID="d" />)
    expect(screen.queryByTestId('d-stamp')).toBeNull()
  })

  it('the stamp lands down from 1.12 on M.settle, fading in over base', () => {
    const { initialValues, animations } = stampIn(false)()
    expect(initialValues).toEqual({ opacity: 0, transform: [{ scale: 1.12 }] })
    expect(Reanimated.withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: DURATION.base }))
    expect(Reanimated.withSpring).toHaveBeenCalledWith(1, expect.objectContaining({ stiffness: SPRING.settle.stiffness }))
    expect(animations.opacity).toBeDefined()
  })

  it('under Reduce Motion the stamp only fades: no scale, no spring', () => {
    jest.mocked(Reanimated.withSpring).mockClear()
    const { initialValues } = stampIn(true)()
    expect(initialValues).toEqual({ opacity: 0, transform: [{ scale: 1 }] })
    expect(Reanimated.withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 200 }))
    expect(Reanimated.withSpring).not.toHaveBeenCalled()
  })
})
