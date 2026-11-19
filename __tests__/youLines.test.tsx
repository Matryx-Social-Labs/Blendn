/*
 * The two lines about you on the map (pulse-map 06): approximate ("Approximate · Use precise", the way to precise) and
 * stale ("Last seen here 25 min ago · updating", over the grey dot).
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { makeMutable } from 'react-native-reanimated'

type Props = Record<string, unknown> & { id?: string; children?: React.ReactNode }
jest.mock('@maplibre/maplibre-react-native', () => {
  const { View } = require('react-native')
  return {
    Marker: ({ id, children, lngLat }: Props) => (
      <View testID={`marker-${id}`} lngLat={lngLat}>
        {children}
      </View>
    ),
  }
})

/* eslint-disable import/first */
import { ApproximateLine, StaleCallout } from '../components/home/YouLines'
/* eslint-enable import/first */

const drawer = { half: 420, full: 120 }

describe('ApproximateLine', () => {
  it('says the location is approximate and its tap is the way to precise', async () => {
    const onPress = jest.fn()
    await render(<ApproximateLine visible drawerTop={makeMutable(drawer.half)} drawer={drawer} onPress={onPress} />)
    expect(screen.getByText(/Approximate ·/)).toBeTruthy()
    expect(screen.getByText('Use precise')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Your location is approximate. Use precise' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('cannot be tapped or read while the drawer covers the map', async () => {
    await render(<ApproximateLine visible={false} drawerTop={makeMutable(drawer.full)} drawer={drawer} onPress={jest.fn()} />)
    expect(screen.queryByRole('button', { name: 'Your location is approximate. Use precise' })).toBeNull()
  })
})

describe('StaleCallout', () => {
  it('stands over the grey dot with its words', async () => {
    await render(<StaleCallout at={[77.6, 12.97]} text="Last seen here 25 min ago · updating" />)
    expect(screen.getByTestId('marker-you-stale').props.lngLat).toEqual([77.6, 12.97])
    expect(screen.getByText('Last seen here 25 min ago · updating')).toBeTruthy()
  })
})
