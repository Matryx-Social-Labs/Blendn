/*
 * Places' five numbered pins on the home map (BUILD-SPEC B4): a disc per pin carrying the row's number,
 * out of the screen reader's way (the map is decorative; the rows are the reading order).
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'

jest.mock('@maplibre/maplibre-react-native', () => {
  const { View } = jest.requireActual('react-native')
  return { Marker: ({ id, children }: { id: string; children: React.ReactNode }) => <View testID={`marker-${id}`}>{children}</View> }
})

// eslint-disable-next-line import/first
import { NearPins } from '../components/home/NearPins'

describe('NearPins', () => {
  it('draws one numbered disc per pin, anchored where the venue is', async () => {
    await render(<NearPins pins={[{ id: 'a', lat: 12.9, lon: 77.6, n: 1 }, { id: 'b', lat: 12.95, lon: 77.62, n: 2 }]} />)
    expect(screen.getByTestId('marker-near-a')).toBeTruthy()
    expect(screen.getByTestId('marker-near-b')).toBeTruthy()
    expect(screen.getByText('1', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByText('2', { includeHiddenElements: true })).toBeTruthy()
  })

  it('is hidden from a screen reader: the rows say the same in words', async () => {
    await render(<NearPins pins={[{ id: 'a', lat: 12.9, lon: 77.6, n: 1 }]} />)
    expect(screen.queryByText('1')).toBeNull()
  })

  it('no pins, no markers', async () => {
    await render(<NearPins pins={[]} />)
    expect(screen.queryByTestId(/^marker-/)).toBeNull()
  })
})
