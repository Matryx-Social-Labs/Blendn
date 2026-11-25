/**
 * Near me's two ends (Flow 3b · N1 board `N1none`, `N1canada`; SCRUM-1022): nothing within reach says what exists and how
 * far, with the city and Places as the ways on; a list that ends says it is everything within a short ride.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'

jest.mock('../components/cityArt/CityArtCard', () => ({ CityArtBanner: () => null }))

/* eslint-disable import/first */
import { NearEnd, NothingNear } from '../components/pulse/PulseEmpty'
/* eslint-enable import/first */

it('nothing within reach: the words, then See all of the city (lit) and Places open now', async () => {
  const seeCity = jest.fn()
  const places = jest.fn()
  await render(
    <NothingNear
      copy={{ title: 'Nothing within a short ride this week', message: 'Toronto has 6 events this week.' }}
      city="Toronto"
      onSeeCity={seeCity}
      onPlaces={places}
    />
  )
  expect(screen.getByRole('header').props.children).toBe('Nothing within a short ride this week')
  expect(screen.getByText('Toronto has 6 events this week.')).toBeTruthy()
  await fireEvent.press(screen.getByText('See all of Toronto'))
  await fireEvent.press(screen.getByText('Places open now'))
  expect(seeCity).toHaveBeenCalledTimes(1)
  expect(places).toHaveBeenCalledTimes(1)
})

it('no words yet: the title alone, no empty line', async () => {
  await render(<NothingNear copy={{ title: 'Nothing within a short ride tonight', message: '' }} city="Toronto" onSeeCity={jest.fn()} onPlaces={jest.fn()} />)
  expect(screen.queryByTestId('pulse-nothing-near-message')).toBeNull()
})

it('the end of the Near me list says so, with the same two ways on', async () => {
  const seeCity = jest.fn()
  await render(<NearEnd span="this week" city="Toronto" onSeeCity={seeCity} onPlaces={jest.fn()} />)
  expect(screen.getByText('That’s everything within a short ride this week.')).toBeTruthy()
  await fireEvent.press(screen.getByText('See all of Toronto'))
  expect(seeCity).toHaveBeenCalledTimes(1)
})
