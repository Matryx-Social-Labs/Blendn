/*
 * The skeleton (DS #17): still, nothing loops, nothing drawn for a wait under 300 ms, and the content crossfades
 * in when the data lands.
 */
import { act, render, screen } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Text } from 'react-native'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  // Spies live on the builder itself: imports are hoisted above any top-level const.
  const delay = jest.fn()
  const duration = jest.fn()
  const builder = { delay: (ms: number) => (delay(ms), builder), duration: (ms: number) => (duration(ms), builder), easing: () => builder, spies: { delay, duration } }
  return { ...actual, __esModule: true, FadeIn: builder, useReducedMotion: jest.fn(() => false) }
})

import { Skeleton, SkeletonCircle, SkeletonLine } from '../components/Skeleton'
import { useSkeletonCrossfade } from '../components/motion/useSkeletonCrossfade'
import { COLOR } from '../lib/design/tokens'

const { FadeIn } = require('react-native-reanimated')
const mockDelay: jest.Mock = FadeIn.spies.delay
const mockDuration: jest.Mock = FadeIn.spies.duration

describe('<Skeleton>', () => {
  it('is one still block on the design surface, with an entrance after the grace', async () => {
    await render(<Skeleton width={120} height={20} />)
    // The entrance is built once, when the module loads (the mocks were cleared since): load it again to read it.
    jest.isolateModules(() => require('../components/Skeleton'))
    // 300 ms of nothing, then a quick fade.
    expect(mockDelay).toHaveBeenCalledWith(300)
    expect(mockDuration).toHaveBeenCalledWith(160)
  })

  it('draws the design’s sunken surface, not a legacy grey', async () => {
    await render(
      <>
        <Skeleton />
        <SkeletonLine />
        <SkeletonCircle />
      </>
    )
    const bg = screen.toJSON()
    expect(JSON.stringify(bg)).toContain(COLOR.surfaceSunken)
  })

  it('has no loop: the source never repeats a thing', () => {
    const src = readFileSync(join(__dirname, '../components/Skeleton.tsx'), 'utf8')
    expect(src).not.toMatch(/loop\(|withRepeat|useNativeDriver|Animated\.Value/)
  })
})

describe('useSkeletonCrossfade', () => {
  const Body = ({ loading }: { loading: boolean }) => {
    const entering = useSkeletonCrossfade(loading)
    return <Text testID="entering">{entering ? 'fade' : 'none'}</Text>
  }

  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('a load that outlasts the grace crossfades to its content', async () => {
    await render(<Body loading />)
    await act(async () => jest.advanceTimersByTime(300))
    await screen.rerender(<Body loading={false} />)
    expect(screen.getByTestId('entering').children.join('')).toBe('fade')
  })

  it('a load faster than the grace shows its content at once: no skeleton was drawn, so nothing to cross from', async () => {
    await render(<Body loading />)
    await act(async () => jest.advanceTimersByTime(100))
    await screen.rerender(<Body loading={false} />)
    expect(screen.getByTestId('entering').children.join('')).toBe('none')
  })

  it('uses base, and 200 under Reduce Motion', async () => {
    const { useReducedMotion } = require('react-native-reanimated')
    mockDuration.mockClear()
    await render(<Body loading />)
    await act(async () => jest.advanceTimersByTime(300))
    expect(mockDuration).toHaveBeenCalledWith(220)
    mockDuration.mockClear()
    useReducedMotion.mockReturnValue(true)
    await screen.rerender(<Body loading />)
    await act(async () => jest.advanceTimersByTime(300))
    expect(mockDuration).toHaveBeenCalledWith(200)
    useReducedMotion.mockReturnValue(false)
  })
})
