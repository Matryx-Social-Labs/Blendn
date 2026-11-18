/*
 * The map's numbers, spoken (pulse-map 10: "Map and number labels are spoken"). A pile is a MapLibre layer, which a
 * screen reader cannot reach: with VoiceOver or TalkBack on, each number on screen gets an invisible marker that says
 * "13 events here, double-tap to zoom in" and does what a tap on the number does. Placed when the camera stops.
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'

type Props = Record<string, unknown> & { id?: string; children?: React.ReactNode }
jest.mock('@maplibre/maplibre-react-native', () => {
  const { View } = require('react-native')
  return {
    Marker: ({ id, children, title, lngLat, onPress }: Props) => (
      <View testID={`marker-${id}`} title={title} lngLat={lngLat} onPress={onPress}>
        {children}
      </View>
    ),
  }
})

/* eslint-disable import/first */
import { PileSpeech } from '../components/home/PileSpeech'
import { pileSpeech, PILE_SPEECH_MAX } from '../lib/mapPresence'
/* eslint-enable import/first */

const cluster = (id: number, n: number, live = 0) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [77.6 + id / 1000, 12.97] },
  properties: { cluster: true, cluster_id: id, point_count: n, n, live },
})
const spot = (id: string, n: number) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [77.61, 12.98] }, properties: { id, kind: 'event', n, live: 0 } })

const setup = (features: unknown[]) => {
  const map = { current: { queryRenderedFeatures: jest.fn(async () => features) } }
  const source = { current: { getClusterExpansionZoom: jest.fn(async () => 15) } }
  return { map, source }
}
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 400)) })

describe('what a number says', () => {
  it('a pile: its count and what a double-tap does; a live share when there is one', () => {
    expect(pileSpeech({ n: 13, live: 0, cluster: true })).toBe('13 events here, double-tap to zoom in')
    expect(pileSpeech({ n: 13, live: 2, cluster: true })).toBe('13 events here, 2 on now, double-tap to zoom in')
  })
  it('several at one place open the first, since zooming in cannot split them', () => {
    expect(pileSpeech({ n: 3, live: 0, cluster: false })).toBe('3 events at one place, double-tap to open the first')
  })
})

describe('PileSpeech', () => {
  const box = { left: 0, top: 100, right: 390, bottom: 400 }

  it('with a screen reader on, reads the numbers in the visible map and gives each a spoken marker', async () => {
    const { map, source } = setup([cluster(1, 13, 2), spot('e9', 3)])
    await render(<PileSpeech on map={map as never} source={source as never} box={box} settled={1} onExpand={jest.fn()} onOpen={jest.fn()} />)
    await flush()
    expect(map.current.queryRenderedFeatures).toHaveBeenCalledWith([[0, 100], [390, 400]], { layers: ['pile-bubble'] })
    expect(screen.getByLabelText('13 events here, 2 on now, double-tap to zoom in')).toBeTruthy()
    expect(screen.getByLabelText('3 events at one place, double-tap to open the first')).toBeTruthy()
  })

  it('a double-tap on a pile eases to its expansion zoom; on a stacked place, opens its first event', async () => {
    const onExpand = jest.fn()
    const onOpen = jest.fn()
    const { map, source } = setup([cluster(7, 13), spot('e9', 3)])
    await render(<PileSpeech on map={map as never} source={source as never} box={box} settled={1} onExpand={onExpand} onOpen={onOpen} />)
    await flush()
    await act(async () => {
      screen.getByLabelText('13 events here, double-tap to zoom in').props.onAccessibilityTap()
    })
    expect(source.current.getClusterExpansionZoom).toHaveBeenCalledWith(7)
    expect(onExpand).toHaveBeenCalledWith({ center: [77.607, 12.97], zoom: 15 })
    await act(async () => {
      screen.getByLabelText('3 events at one place, double-tap to open the first').props.onAccessibilityTap()
    })
    expect(onOpen).toHaveBeenCalledWith('event', 'e9')
  })

  it('reads again when the camera stops somewhere new', async () => {
    const { map, source } = setup([cluster(1, 13)])
    const view = await render(<PileSpeech on map={map as never} source={source as never} box={box} settled={1} onExpand={jest.fn()} onOpen={jest.fn()} />)
    await flush()
    await view.rerender(<PileSpeech on map={map as never} source={source as never} box={box} settled={2} onExpand={jest.fn()} onOpen={jest.fn()} />)
    await flush()
    expect(map.current.queryRenderedFeatures).toHaveBeenCalledTimes(2)
  })

  it(`never more than ${PILE_SPEECH_MAX} markers, however dense the view`, async () => {
    const { map, source } = setup(Array.from({ length: 40 }, (_, i) => cluster(i + 1, 2)))
    await render(<PileSpeech on map={map as never} source={source as never} box={box} settled={1} onExpand={jest.fn()} onOpen={jest.fn()} />)
    await flush()
    expect(screen.getAllByLabelText('2 events here, double-tap to zoom in')).toHaveLength(PILE_SPEECH_MAX)
  })

  it('control: with no screen reader it reads nothing and draws nothing (no cost for anyone else)', async () => {
    const { map, source } = setup([cluster(1, 13)])
    await render(<PileSpeech on={false} map={map as never} source={source as never} box={box} settled={1} onExpand={jest.fn()} onOpen={jest.fn()} />)
    await flush()
    expect(map.current.queryRenderedFeatures).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('13 events here, double-tap to zoom in')).toBeNull()
  })
})
