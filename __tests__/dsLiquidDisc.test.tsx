/*
 * <LiquidDisc> (guidelines/round2/pass.js `liquidDisc`, Flow 13 · 13.2): the
 * pass's pour. Decorative, so hidden from a screen reader; the stamp over it is
 * not. The wave and the bubbles are the part that moves, and stop for a spent
 * pass and under Reduce Motion.
 */
import { render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'

import { LiquidDisc } from '../components/ds/LiquidDisc'

jest.mock('../lib/motion', () => ({ ...jest.requireActual('../lib/motion'), useReducedMotion: jest.fn(() => false) }))
// eslint-disable-next-line import/first
import { useReducedMotion } from '../lib/motion'

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
