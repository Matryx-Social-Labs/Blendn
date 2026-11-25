/**
 * Any country (Flow 3 · Pulse, Option C, the Canada frames): "We're not in Toronto yet" then where Blend'n is on, each row
 * opening that city; a quiet week ends with a sentence and two ways on.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'

jest.mock('../components/cityArt/CityArtCard', () => ({ CityArtBanner: () => null }))

/* eslint-disable import/first */
import { PulseEmpty, QuietWeekEnd } from '../components/pulse/PulseEmpty'
import { pulseEmptyCopy } from '../lib/pulseFeed'
import type { CityOption } from '../lib/city'
/* eslint-enable import/first */

const CITIES: CityOption[] = [
  { city: 'Bengaluru', eventCount: 1240, country: 'IN', slug: 'bengaluru' },
  { city: 'Mumbai', eventCount: 312, country: 'IN', slug: 'mumbai' },
  { city: 'Toronto', eventCount: 0, country: 'CA', slug: 'toronto', access: 'comingSoon' },
]
const handlers = { onClearSearch: jest.fn(), onClearFilters: jest.fn(), onChangeCity: jest.fn(), onRefresh: jest.fn() }

it('not here yet: the honest line, then the open cities, each a way into that city', async () => {
  const onChooseCity = jest.fn()
  await render(<PulseEmpty kind="notLive" copy={pulseEmptyCopy('notLive', { city: 'Toronto', term: '' })} city="Toronto" canChangeCity cities={CITIES} onChooseCity={onChooseCity} {...handlers} />)
  expect(screen.getByText('We’re not in Toronto yet')).toBeTruthy()
  expect(screen.getByText('Where Blend’n is on')).toBeTruthy()
  expect(screen.getByText('1,240 events', { includeHiddenElements: true })).toBeTruthy()
  // Toronto itself is not offered as somewhere Blend'n is on.
  expect(screen.queryByLabelText(/^Toronto/)).toBeNull()
  await act(async () => fireEvent.press(screen.getByLabelText('Bengaluru, 1,240 events')))
  expect(onChooseCity).toHaveBeenCalledWith(CITIES[0])
})

it('a quiet week ends with one sentence, Places open tonight lit and Change city quiet', async () => {
  const onPlaces = jest.fn()
  const onChangeCity = jest.fn()
  await render(<QuietWeekEnd city="Toronto" onPlaces={onPlaces} onChangeCity={onChangeCity} />)
  expect(screen.getByText('That’s everything in Toronto this week.')).toBeTruthy()
  await act(async () => fireEvent.press(screen.getByLabelText('Places open tonight')))
  await act(async () => fireEvent.press(screen.getByLabelText('Change city')))
  expect(onPlaces).toHaveBeenCalled()
  expect(onChangeCity).toHaveBeenCalled()
})
