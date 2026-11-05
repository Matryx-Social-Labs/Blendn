/**
 * Long-text proofing of the Pulse header and N1 (owner 2026-11-05, `__tests__/fixtures/worstCase.ts`). Jest has no layout,
 * so each slot is held to what makes it hold: one line that ends in an ellipsis where it must, a cap on its width, the
 * variable value never glued to a static suffix in a tight slot, and the value it must not lose kept in its own slot.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { WORST } from './fixtures/worstCase'

jest.mock('expo-image', () => ({ Image: () => null }))

/* eslint-disable import/first */
import { CityChip, CITY_CHIP_MAX } from '../components/home/CityChip'
import { EventCard } from '../components/ds/EventCard'
import { Banner } from '../components/ds/Banner'
import { NothingNear } from '../components/pulse/PulseEmpty'
import { QuickChips } from '../components/pulse/QuickChips'
import { nothingNearCopy } from '../lib/nearby'
import { NO_FILTERS } from '../lib/eventFilters'
/* eslint-enable import/first */

const flat = (s: unknown) => StyleSheet.flatten(s as never) as Record<string, unknown>

describe('the city chip (board `.cc`: at most 148 pt)', () => {
  it.each(WORST.cities)('%s: the name alone, one line, inside 148 pt', async (city) => {
    await render(<CityChip city={city} travelling={false} onPress={jest.fn()} />)
    const label = screen.getByText(city)
    expect(label.props.numberOfLines).toBe(1)
    expect(flat(screen.getByTestId('home-city-box').props.style).maxWidth).toBe(CITY_CHIP_MAX)
    expect(CITY_CHIP_MAX).toBe(148)
  })
  it('no launch state glued to the name: a preview city reads as itself', async () => {
    await render(<CityChip city="Toronto" travelling onPress={jest.fn()} />)
    expect(screen.queryByText(/Preview/)).toBeNull()
    expect(screen.getByText('Toronto')).toBeTruthy()
  })
})

it('chips: a big count is compact, so "This weekend" never grows past its number', async () => {
  await render(<QuickChips counts={{ tonight: 5, weekend: WORST.counts.weekend }} nearOn={false} vibe={null} categories={[]} filters={NO_FILTERS} onChange={jest.fn()} onOpenFilters={jest.fn()} />)
  expect(screen.getByTestId('pulse-chip-weekend-count')).toHaveTextContent('12k')
})

it('the travel banner with a long city: the sentence and the way back both hold it (the action goes under, never cut)', async () => {
  await render(<Banner kind="info" onMap icon="plane" text={`Visiting ${WORST.city}`} action={{ label: `Back to ${WORST.cities[0]}`, onPress: jest.fn() }} onDismiss={jest.fn()} testID="t" />)
  expect(screen.getByText(`Visiting ${WORST.city}`).props.numberOfLines).toBeUndefined()
  expect(screen.getByText(`Back to ${WORST.cities[0]}`)).toBeTruthy()
})

it('nothing within reach with a long city and venue: every word kept (the card wraps)', async () => {
  const copy = nothingNearCopy(WORST.city, { count: 6, closest: { km: 14.2, venue: WORST.venue } }, 'any')
  await render(<NothingNear copy={copy} city={WORST.city} onSeeCity={jest.fn()} onPlaces={jest.fn()} />)
  const message = screen.getByTestId('pulse-nothing-near-message')
  expect(message).toHaveTextContent(`${WORST.city} has 6 events this week. The closest is 14 km away, at ${WORST.venue}.`)
  expect(message.props.numberOfLines).toBeUndefined()
})

describe('the lead card at the largest text: the venue gives way, its distance never does', () => {
  it('the venue truncates in its own slot; the distance sits apart and does not shrink', async () => {
    await render(<EventCard kind="hero" layout="lead" title={WORST.title} time="Sat · 10:30 PM" venue={WORST.venue} distance={WORST.distance} going={WORST.counts.going} onPress={jest.fn()} testID="lead" />)
    const venue = screen.getByTestId('lead-venue', { includeHiddenElements: true })
    expect(venue.props.numberOfLines).toBe(1)
    expect(venue).toHaveTextContent(new RegExp(`at ${WORST.venue}`))
    const km = screen.getByTestId('lead-distance', { includeHiddenElements: true })
    expect(km).toHaveTextContent(new RegExp(WORST.distance))
    expect(flat(km.props.style).flexShrink).toBe(0)
    // The title clamps at two lines, ending in an ellipsis.
    expect(screen.getByText(WORST.title, { includeHiddenElements: true }).props.numberOfLines).toBe(2)
  })
  it('a list row too: "venue · distance" is two slots, not one string', async () => {
    await render(<EventCard kind="row" title={WORST.title} time="8:30 PM" venue={WORST.venue} distance={WORST.distance} onPress={jest.fn()} testID="row" />)
    expect(screen.getByTestId('row-venue', { includeHiddenElements: true }).props.numberOfLines).toBe(1)
    expect(flat(screen.getByTestId('row-distance', { includeHiddenElements: true }).props.style).flexShrink).toBe(0)
  })
})
