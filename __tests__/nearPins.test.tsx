/*
 * Places' five numbered pins on the home map (BUILD-SPEC B4): a disc per pin carrying the row's number,
 * out of the screen reader's way (the map is decorative; the rows are the reading order).
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'

jest.mock('@maplibre/maplibre-react-native', () => {
  const { View } = jest.requireActual('react-native')
  // `title` is what iOS hands MLNAnnotationView, which VoiceOver reads the annotation by (audit M3).
  return {
    Marker: ({ id, children, offset, title }: { id: string; children: React.ReactNode; offset?: [number, number]; title?: string }) => (
      <View testID={`marker-${id}`} offset={offset} title={title}>
        {children}
      </View>
    ),
    GeoJSONSource: () => null,
    Layer: () => null,
    VectorSource: () => null,
  }
})

// eslint-disable-next-line import/first
import { NearPins } from '../components/home/NearPins'
// eslint-disable-next-line import/first
import { Chips } from '../components/home/MapLitLayers'

describe('NearPins', () => {
  it('draws one numbered disc per pin, anchored where the venue is', async () => {
    await render(<NearPins pins={[{ id: 'a', lat: 12.9, lon: 77.6, n: 1, name: 'Venue a' }, { id: 'b', lat: 12.95, lon: 77.62, n: 2, name: 'Venue b' }]} />)
    expect(screen.getByTestId('marker-near-a')).toBeTruthy()
    expect(screen.getByTestId('marker-near-b')).toBeTruthy()
    expect(screen.getByText('1', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByText('2', { includeHiddenElements: true })).toBeTruthy()
  })

  it('is hidden from a screen reader: the rows say the same in words', async () => {
    await render(<NearPins pins={[{ id: 'a', lat: 12.9, lon: 77.6, n: 1, name: 'Venue a' }]} />)
    expect(screen.queryByText('1')).toBeNull()
  })

  it('no pins, no markers', async () => {
    await render(<NearPins pins={[]} />)
    expect(screen.queryByTestId(/^marker-/)).toBeNull()
  })
})

describe('a pin beside you (rc7 D16)', () => {
  const { LIFT_NEAR_YOU } = jest.requireActual('../components/home/NearPins')
  it('is lifted clear of the you-dot; one further off stays on its point', async () => {
    const you = { latitude: 12.9, longitude: 77.6 }
    await render(<NearPins you={you} pins={[{ id: 'a', lat: 12.9003, lon: 77.6, n: 4, name: 'Venue a' }, { id: 'b', lat: 12.95, lon: 77.62, n: 2, name: 'Venue b' }]} />)
    expect(screen.getByTestId('marker-near-a').props.offset).toEqual([0, -LIFT_NEAR_YOU])
    expect(screen.getByTestId('marker-near-b').props.offset).toBeUndefined()
  })

  it('with no fix, nothing moves', async () => {
    await render(<NearPins pins={[{ id: 'a', lat: 12.9003, lon: 77.6, n: 4, name: 'Venue a' }]} />)
    expect(screen.getByTestId('marker-near-a').props.offset).toBeUndefined()
  })
})

/*
 * Audit M3: on iOS each annotation is an accessible button MapLibre labels by its title, hiding the view inside it.
 * VoiceOver read "button" 22 times on the Places map. A pin is named as its row is numbered; a chip by its own speech.
 */
describe('VoiceOver names each map annotation', () => {
  it('a pin: its number and the place, as the row says it', async () => {
    await render(<NearPins pins={[{ id: 'a', lat: 12.9, lon: 77.6, n: 1, name: 'Toit' }]} />)
    expect(screen.getByTestId('marker-near-a').props.title).toBe('1, Toit')
  })

  it('a chip: its own spoken line', async () => {
    const chip = { id: 'v1', kind: 'venue' as const, live: true, title: 'Toit', line: '10+ live', speech: 'Toit, live now. Opens it.', at: [77.6, 12.9] as [number, number], lift: 0 }
    await render(<Chips chips={[chip]} onOpen={jest.fn()} />)
    expect(screen.getByTestId('marker-chip-v1').props.title).toBe('Toit, live now. Opens it.')
  })
})
