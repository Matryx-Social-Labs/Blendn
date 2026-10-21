import { act, renderHook } from '@testing-library/react-native'
import { Platform } from 'react-native'

import { H } from '../lib/haptics'
import { PULL_ARM, pullProgress, usePullToRefresh } from '../lib/usePullToRefresh'

const at = (y: number) => ({ nativeEvent: { contentOffset: { y } } }) as never
const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })

afterEach(() => on('ios'))

it('progress is the pull over the arm point, from 0 to 1 and no further', async () => {
  expect(pullProgress(10)).toBe(0)
  expect(pullProgress(-PULL_ARM / 2)).toBe(0.5)
  expect(pullProgress(-500)).toBe(1)
})

describe('iOS: the monogram pull', () => {
  it('arms once with H.threshold as the pull passes the point, not before, not again while held there', async () => {
    on('ios')
    const threshold = jest.spyOn(H, 'threshold').mockImplementation(() => {})
    const { result } = await renderHook(() => usePullToRefresh({ refreshing: false, onRefresh: jest.fn() }))
    await act(async () => result.current.scrollProps.onScroll(at(-20)))
    expect(threshold).not.toHaveBeenCalled()
    await act(async () => result.current.scrollProps.onScroll(at(-70)))
    await act(async () => result.current.scrollProps.onScroll(at(-90)))
    expect(threshold).toHaveBeenCalledTimes(1)
    // Let go back to rest, pull again: armed again.
    await act(async () => result.current.scrollProps.onScroll(at(0)))
    await act(async () => result.current.scrollProps.onScroll(at(-70)))
    expect(threshold).toHaveBeenCalledTimes(2)
  })

  it('refreshes on release past the point only', async () => {
    on('ios')
    const onRefresh = jest.fn()
    const { result } = await renderHook(() => usePullToRefresh({ refreshing: false, onRefresh }))
    await act(async () => result.current.scrollProps.onScrollEndDrag(at(-30)))
    expect(onRefresh).not.toHaveBeenCalled()
    await act(async () => result.current.scrollProps.onScrollEndDrag(at(-70)))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('holds the list down while it loads, and does not start a second refresh', async () => {
    on('ios')
    const onRefresh = jest.fn()
    const { result } = await renderHook(() => usePullToRefresh({ refreshing: true, onRefresh }))
    expect(result.current.holdInset).toBe(PULL_ARM)
    await act(async () => result.current.scrollProps.onScrollEndDrag(at(-90)))
    expect(onRefresh).not.toHaveBeenCalled()
  })
})

it('Android keeps the platform control: no custom hold, no scroll handling', async () => {
  on('android')
  const onRefresh = jest.fn()
  const threshold = jest.spyOn(H, 'threshold').mockImplementation(() => {})
  const { result } = await renderHook(() => usePullToRefresh({ refreshing: true, onRefresh }))
  expect(result.current.native).toBe(true)
  expect(result.current.holdInset).toBe(0)
  await act(async () => result.current.scrollProps.onScroll(at(-90)))
  await act(async () => result.current.scrollProps.onScrollEndDrag(at(-90)))
  expect(threshold).not.toHaveBeenCalled()
  expect(onRefresh).not.toHaveBeenCalled()
})
