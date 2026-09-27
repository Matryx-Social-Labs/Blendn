import { act, renderHook } from '@testing-library/react-native'

import { blendnClosed, isBlendnOpen, openBlendn, useBlendnOpen } from '../lib/blendnOverlay'

/**
 * The Blend'n screen is an overlay the tab layout hosts, not a route — see the
 * header of `lib/blendnOverlay.ts` for why (a modal route could not have the
 * chat or a profile pushed on top of it on iOS). This store is the whole of
 * "is it open", so the centre button, `/room` and the overlay's own close all
 * meet here.
 */
describe('the Blend’n overlay store', () => {
  beforeEach(() => {
    // Module state: start every test closed.
    blendnClosed()
  })

  it('starts closed, opens, and closes', () => {
    expect(isBlendnOpen()).toBe(false)
    openBlendn()
    expect(isBlendnOpen()).toBe(true)
    blendnClosed()
    expect(isBlendnOpen()).toBe(false)
  })

  it('is idempotent both ways', () => {
    // The centre button can be tapped twice while the disc is still growing.
    openBlendn()
    openBlendn()
    expect(isBlendnOpen()).toBe(true)
    blendnClosed()
    blendnClosed()
    expect(isBlendnOpen()).toBe(false)
  })

  it('re-renders subscribers on each change, and only on a change', async () => {
    let renders = 0
    const { result } = await renderHook(() => {
      renders++
      return useBlendnOpen()
    })
    expect(result.current).toBe(false)
    const base = renders

    await act(async () => openBlendn())
    expect(result.current).toBe(true)
    const afterOpen = renders
    expect(afterOpen).toBeGreaterThan(base)

    // A second open changes nothing, so nobody is told.
    await act(async () => openBlendn())
    expect(renders).toBe(afterOpen)

    await act(async () => blendnClosed())
    expect(result.current).toBe(false)
  })

  it('stops notifying a subscriber that unmounted', async () => {
    let renders = 0
    const { unmount } = await renderHook(() => {
      renders++
      return useBlendnOpen()
    })
    await unmount()
    const before = renders
    await act(async () => openBlendn())
    expect(renders).toBe(before)
  })
})
