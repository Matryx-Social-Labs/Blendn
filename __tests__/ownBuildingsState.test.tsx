import { act, render } from '@testing-library/react-native'

/**
 * Feature-state on our buildings (SCRUM-572 review M3): applied as a diff,
 * counted as applied only once native accepts it, retried a bounded number of
 * times, and nothing after unmount.
 */

const mockNative = { setFeatureState: jest.fn(), removeFeatureState: jest.fn() }

jest.mock('@maplibre/maplibre-react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react')
  return {
    VectorSource: React.forwardRef(function VectorSource(props: { children?: React.ReactNode }, ref: React.Ref<unknown>) {
      React.useImperativeHandle(ref, () => mockNative)
      return props.children ?? null
    }),
    Layer: () => null,
    GeoJSONSource: () => null,
    Marker: () => null,
  }
})

// eslint-disable-next-line import/first -- after the mock it replaces
import { OwnBuildings } from '../components/home/MapLitLayers'

const lupa = { featureId: 101, pinId: 'lupa', kind: 'venue' as const, live: false }
const arbor = { featureId: 202, pinId: 'arbor', kind: 'venue' as const, live: false }
const draw = (states: (typeof lupa)[]) => <OwnBuildings url="https://t.example/{z}/{x}/{y}.pbf" states={states} onOpen={() => undefined} />
const flush = () => act(async () => undefined)

beforeEach(() => {
  jest.useFakeTimers()
  mockNative.setFeatureState.mockReset().mockResolvedValue(undefined)
  mockNative.removeFeatureState.mockReset().mockResolvedValue(undefined)
})
afterEach(() => jest.useRealTimers())

it('sets each lit building once, and only the change when the lighting changes', async () => {
  const view = await render(draw([lupa]))
  await flush()
  expect(mockNative.setFeatureState).toHaveBeenCalledWith({ id: 101, sourceLayer: 'building' }, { lit: 'venue', live: false })
  await view.rerender(draw([lupa, arbor]))
  await flush()
  expect(mockNative.setFeatureState).toHaveBeenCalledTimes(2)
  expect(mockNative.setFeatureState).toHaveBeenLastCalledWith({ id: 202, sourceLayer: 'building' }, { lit: 'venue', live: false })
  // Lupa goes live: one call, for Lupa.
  await view.rerender(draw([{ ...lupa, live: true }, arbor]))
  await flush()
  expect(mockNative.setFeatureState).toHaveBeenCalledTimes(3)
  expect(mockNative.setFeatureState).toHaveBeenLastCalledWith({ id: 101, sourceLayer: 'building' }, { lit: 'venue', live: true })
})

it('removes the state of a building no longer lit', async () => {
  const view = await render(draw([lupa, arbor]))
  await flush()
  await view.rerender(draw([arbor]))
  await flush()
  expect(mockNative.removeFeatureState).toHaveBeenCalledWith({ id: 101, sourceLayer: 'building' })
})

it('counts a refused state as not applied: retried, a bounded number of times', async () => {
  mockNative.setFeatureState.mockRejectedValue(new Error('source not ready'))
  await render(draw([lupa]))
  await flush()
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      jest.advanceTimersByTime(5_000)
    })
  }
  expect(mockNative.setFeatureState).toHaveBeenCalledTimes(3)
})

it('tries again on the next change after a refusal, since it was never recorded as applied', async () => {
  mockNative.setFeatureState.mockRejectedValue(new Error('source not ready'))
  const view = await render(draw([lupa]))
  await flush()
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      jest.advanceTimersByTime(5_000)
    })
  }
  mockNative.setFeatureState.mockReset().mockResolvedValue(undefined)
  await view.rerender(draw([lupa, arbor]))
  await flush()
  expect(mockNative.setFeatureState.mock.calls.map((c) => c[0].id).sort()).toEqual([101, 202])
})

it('stops retrying once unmounted, even for a refusal that arrives afterwards', async () => {
  let refuse: (e: Error) => void = () => undefined
  mockNative.setFeatureState.mockImplementation(() => new Promise((_, reject) => (refuse = reject)))
  const view = await render(draw([lupa]))
  await flush()
  await view.unmount()
  await act(async () => refuse(new Error('source not ready')))
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      jest.advanceTimersByTime(5_000)
    })
  }
  expect(mockNative.setFeatureState).toHaveBeenCalledTimes(1)
})
