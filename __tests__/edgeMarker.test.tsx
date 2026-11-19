/*
 * The lap's venue off the map you can see (pulse-map 05, frames 3 and 6): a marker at the edge, pointing at it, with its
 * name and distance. Auto-advance never moves the camera; a tap is the person's own ask.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'

jest.mock('@maplibre/maplibre-react-native', () => ({}))

/* eslint-disable import/first */
import { EdgeMarker } from '../components/home/EdgeMarker'
/* eslint-enable import/first */

const box = { left: 0, top: 100, right: 400, bottom: 500 }
const kittyKo = { id: 'e1', name: 'Kitty Ko', at: [77.64, 12.99] as [number, number] }
const mapAt = (xy: [number, number]) => ({ current: { project: jest.fn(async () => xy) } }) as never

const draw = async (over: Partial<React.ComponentProps<typeof EdgeMarker>> = {}) => {
  const onPress = jest.fn()
  await render(
    <EdgeMarker
      map={mapAt([-300, -200])}
      target={kittyKo}
      distance="3.1 km"
      box={box}
      settled={1}
      moving={false}
      onPress={onPress}
      {...over}
    />
  )
  await act(async () => {})
  return onPress
}

describe('EdgeMarker', () => {
  it('names the off-frame venue and how far, and a tap asks to go there', async () => {
    const onPress = await draw()
    const marker = screen.getByRole('button', { name: 'Kitty Ko, 3.1 km away, off the map. Double-tap to show it' })
    expect(screen.getByText('Kitty Ko')).toBeTruthy()
    expect(screen.getByText('3.1 km')).toBeTruthy()
    await fireEvent.press(marker)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('is not drawn while the venue is in frame, while the camera moves, or with no lap venue', async () => {
    await draw({ map: mapAt([200, 300]) })
    expect(screen.queryByTestId('map-edge-marker')).toBeNull()
    await draw({ moving: true })
    expect(screen.queryByTestId('map-edge-marker')).toBeNull()
    await draw({ target: null })
    expect(screen.queryByTestId('map-edge-marker')).toBeNull()
  })

  it('never guesses a distance without a fix', async () => {
    await draw({ distance: null })
    expect(screen.getByRole('button', { name: 'Kitty Ko, off the map. Double-tap to show it' })).toBeTruthy()
  })
})
