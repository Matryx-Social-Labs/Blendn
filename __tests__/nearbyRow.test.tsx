/**
 * The Nearby row and its group heading (Flow 3b · N1 board `.rrow`, `.gh`; SCRUM-1022).
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'

jest.mock('expo-image', () => ({ Image: () => null }))

/* eslint-disable import/first */
import { NearbyRow, nearbyRowLabel, WhenHeading } from '../components/pulse/NearbyRow'
/* eslint-enable import/first */

const NOW = Date.parse('2026-11-04T14:10:00Z')
const base = {
  id: 'e1',
  title: 'Rooftop Jazz Sessions',
  start_time: '2026-11-04T15:00:00Z',
  end_time: null,
  timezone: 'Asia/Kolkata',
  venue_name: 'Loft 38',
  distance: 0.6,
  going_count: 41,
  promoted: false,
  ticketed: false,
  from_price: null,
  cover_image_url: null,
} as never

it('reads as one element: Promoted, Live, name, time, venue, reach, price, people (in that order)', () => {
  expect(nearbyRowLabel({ ...(base as object), promoted: true, from_price: { minor: 79900, currency: 'INR' } } as never, NOW, true)).toBe(
    'Promoted. Rooftop Jazz Sessions, 8:30 PM, at Loft 38, 10 min walk, From ₹799, 41 going'
  )
  const live = { ...(base as object), start_time: '2026-11-04T13:30:00Z', end_time: '2026-11-04T16:30:00Z', here_count: 12 }
  expect(nearbyRowLabel(live as never, NOW, true)).toBe('Live. Rooftop Jazz Sessions, till 10 PM, at Loft 38, 10 min walk, 12 here now')
})

it('tags: Promoted in words, the walk, a price only when one is on sale, people from five', async () => {
  await render(<NearbyRow event={{ ...(base as object), promoted: true, going_count: 3 } as never} now={NOW} withDistance onPress={jest.fn()} />)
  expect(screen.getByText('Promoted', { includeHiddenElements: true })).toBeTruthy()
  expect(screen.getByText('10 min walk', { includeHiddenElements: true })).toBeTruthy()
  // Free: nothing about price. Three going: nothing about people.
  expect(screen.queryByText(/From/, { includeHiddenElements: true })).toBeNull()
  expect(screen.queryByText(/going/, { includeHiddenElements: true })).toBeNull()
})

it('no reach without a fix in the city', async () => {
  await render(<NearbyRow event={base} now={NOW} withDistance={false} onPress={jest.fn()} />)
  expect(screen.queryByText('10 min walk', { includeHiddenElements: true })).toBeNull()
})

it('a group heading is a header, read with its count and its end', async () => {
  await render(<WhenHeading title="Starting soon" count={2} note="by 9:10 PM" />)
  const h = screen.getByRole('header')
  expect(h.props.accessibilityLabel).toBe('Starting soon, 2 events, by 9:10 PM')
})

it('a group still loading past the page has no count: never a guess', async () => {
  await render(<WhenHeading title="Later tonight" count={null} />)
  expect(screen.getByRole('header').props.accessibilityLabel).toBe('Later tonight')
})
