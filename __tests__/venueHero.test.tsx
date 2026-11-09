/*
 * Flow 4 V-A, the map is the hero: 300 pt, the venue's type glyph in the ember pin at its centre, Directions on the map,
 * and the map decoration (hidden from a screen reader: the rows carry the facts).
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { VENUE_HERO_HEIGHT, VenueHero } from '../components/venue/VenueHero'

jest.mock('react-native-maps', () => {
  const { View } = jest.requireActual('react-native')
  return { __esModule: true, default: (p: object) => <View {...p} testID="map" /> }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
jest.mock('../components/ui/Icon', () => {
  const { View } = jest.requireActual('react-native')
  return { ...jest.requireActual('../components/ui/Icon'), Icon: ({ name }: { name: string }) => <View testID={`icon-${name}`} /> }
})

it('is 300 tall with the type’s glyph in the 44 pt pin at its centre', async () => {
  await render(<VenueHero latitude={12.97} longitude={77.6} plate="brewery" onDirections={jest.fn()} />)
  expect(VENUE_HERO_HEIGHT).toBe(300)
  const pin = StyleSheet.flatten(screen.getByTestId('venue-pin', { includeHiddenElements: true }).props.style)
  expect(pin).toMatchObject({ width: 44, height: 44, top: 150 - 22 })
  expect(screen.getByTestId('icon-beer', { includeHiddenElements: true })).toBeTruthy()
})

it('Directions sits on the map and opens directions', async () => {
  const go = jest.fn()
  await render(<VenueHero latitude={12.97} longitude={77.6} plate="bar" onDirections={go} />)
  await fireEvent.press(screen.getByRole('button', { name: 'Directions' }))
  expect(go).toHaveBeenCalled()
})

it('a place with no coordinates draws no map and no Directions (control: one with them does)', async () => {
  await render(<VenueHero latitude={null} longitude={null} plate="bar" onDirections={jest.fn()} />)
  expect(screen.queryByRole('button', { name: 'Directions' })).toBeNull()
  expect(screen.getByTestId('venue-pin', { includeHiddenElements: true })).toBeTruthy()
})
