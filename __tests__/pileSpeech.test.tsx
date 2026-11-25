/*
 * The map's numbers, spoken (pulse-map 10: "Map and number labels are spoken"). A pile is a MapLibre layer, which a
 * screen reader cannot reach: with VoiceOver or TalkBack on, each number on screen gets an invisible marker that says
 * "13 events here, double-tap to zoom in" and does what a tap on the number does. Placed when the camera stops.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Platform, StyleSheet } from 'react-native'

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
import { SIZE } from '../lib/design/tokens'
import { pileSpeech, PILE_SPEECH_MAX } from '../lib/mapPresence'
/* eslint-enable import/first */

const cluster = (id: number, n: number, live = 0) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [77.6 + id / 1000, 12.97] },
  properties: { cluster: true, cluster_id: id, point_count: n, n, live },
})
const spot = (id: string, n: number) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [77.61, 12.98] }, properties: { id, kind: 'event', n, live: 0 } })

const setup = (features: unknown[]) => {
  const map = { current: { queryRenderedFeatures: jest.fn(async () => features), project: jest.fn(async ([lng]: [number, number]) => [Math.round((lng - 77.6) * 10000), 250]) } }
  const source = { current: { getClusterExpansionZoom: jest.fn(async () => 15) } }
  return { map, source }
}
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 600)) })

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

  /*
   * Android drive with TalkBack: MapLibre's Android view keeps every child view (Markers, the lit chips) out of the
   * accessibility tree, so a marker inside the map was never read. The targets are plain views over the map instead, each
   * centred on its number's screen point (map.project), which both platforms read.
   */
  it('draws each target over the map at its number\'s screen point, not as a Marker inside the map', async () => {
    const { map, source } = setup([cluster(7, 13)])
    await render(<PileSpeech on map={map as never} source={source as never} box={box} settled={1} onExpand={jest.fn()} onOpen={jest.fn()} />)
    await flush()
    expect(screen.queryByTestId('marker-speech-pile-7')).toBeNull()
    const target = screen.getByLabelText('13 events here, double-tap to zoom in')
    const half = (Platform.OS === 'ios' ? SIZE.targetIos : SIZE.targetAndroid) / 2
    expect(StyleSheet.flatten(target.props.style)).toMatchObject({ position: 'absolute', left: 70 - half, top: 250 - half })
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

  /*
   * Drives (iOS and Android): after a number's double-tap the old "16" was read beside the new "14". The read ran 250 ms
   * after the stop, inside MapLibre's 300 ms symbol cross-fade, so the outgoing zoom's pile was still rendered.
   */
  it('waits out the map\'s 300 ms cross-fade before reading, so an old pile is not read beside its parts', async () => {
    const { map, source } = setup([cluster(1, 13)])
    await render(<PileSpeech on map={map as never} source={source as never} box={box} settled={1} onExpand={jest.fn()} onOpen={jest.fn()} />)
    await act(async () => { await new Promise((r) => setTimeout(r, 320)) })
    expect(map.current.queryRenderedFeatures).not.toHaveBeenCalled()
    await flush()
    expect(map.current.queryRenderedFeatures).toHaveBeenCalledTimes(1)
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

/*
 * The spoken numbers must be reachable (pulse-map 10: "a number: '12 events near Church Street. Double-tap to zoom in.'
 * Back to you is a button"). The iOS drive with VoiceOver found the whole map, and the on-map lines, taken out of the
 * reading order whenever a screen reader was on, so no marker was ever read. The map leaves the order only while the full
 * drawer covers it; the reader still opens on the full list, and lowering the drawer (it is adjustable) brings the map back.
 */
describe('HomeShell keeps the map readable', () => {
  const src = readFileSync(join(__dirname, '../components/home/HomeShell.tsx'), 'utf8')
  it('hides the map from a screen reader only while the full drawer covers it', () => {
    expect(src).toMatch(/accessibilityElementsHidden={snap === 'full'}/)
    expect(src).toMatch(/importantForAccessibility={snap === 'full' \? 'no-hide-descendants' : 'auto'}/)
    expect(src).not.toMatch(/accessibilityElementsHidden={screenReader}/)
  })
  it('draws the on-map lines with a screen reader on too', () => {
    expect(src).not.toMatch(/segment === 'events' && !screenReader \? \(\s*<MapBanners/)
  })
})

/*
 * Part 2 (pulse-map 10, map agent 2026-11-19): the map as a whole is spoken first, and the lit names (chips) get targets
 * over the map too, since TalkBack cannot reach a Marker inside MapLibre's Android view (the same cause as the numbers).
 */
describe('PileSpeech: the summary and the chips', () => {
  const box = { left: 0, top: 100, right: 390, bottom: 400 }
  const chip = { id: 'v1', kind: 'event', at: [77.62, 12.97] as [number, number], speech: 'Church Street Social, 3 events. Tonight 8 PM, 200 m away' }

  it('speaks the map summary along the top of the visible map, first, without taking its touches', async () => {
    const { map, source } = setup([])
    await render(<PileSpeech on map={map as never} source={source as never} box={box} settled={1} summary="Map. 2 events here." onExpand={jest.fn()} onOpen={jest.fn()} />)
    await flush()
    const summary = screen.getByLabelText('Map. 2 events here.')
    expect(summary.props.pointerEvents).toBe('none')
    expect(StyleSheet.flatten(summary.props.style)).toMatchObject({ position: 'absolute', left: 0, top: 100, width: 390, height: Platform.OS === 'ios' ? SIZE.targetIos : SIZE.targetAndroid })
  })

  it('gives each lit name a target at its point that opens it', async () => {
    const { map, source } = setup([])
    const onOpen = jest.fn()
    await render(<PileSpeech on map={map as never} source={source as never} box={box} settled={1} chips={[chip]} onExpand={jest.fn()} onOpen={onOpen} />)
    await flush()
    const target = screen.getByLabelText(chip.speech)
    expect(StyleSheet.flatten(target.props.style)).toMatchObject({ position: 'absolute' })
    await fireEvent.press(target)
    expect(onOpen).toHaveBeenCalledWith('event', 'v1')
  })

  it('says and draws nothing with the screen reader off', async () => {
    const { map, source } = setup([])
    await render(<PileSpeech on={false} map={map as never} source={source as never} box={box} settled={1} summary="Map." chips={[chip]} onExpand={jest.fn()} onOpen={jest.fn()} />)
    await flush()
    expect(screen.queryByLabelText('Map.')).toBeNull()
    expect(screen.queryByLabelText(chip.speech)).toBeNull()
  })
})
