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

describe('at the largest text sizes the row restacks (board N1ax)', () => {
  const RN = jest.requireActual('react-native') as typeof import('react-native')
  let spy: jest.SpyInstance
  beforeEach(() => {
    spy = jest.spyOn(RN, 'useWindowDimensions').mockReturnValue({ width: 393, height: 852, scale: 3, fontScale: 2 })
  })
  afterEach(() => spy.mockRestore())

  it('the time on its own line above the name, no photo, no time column', async () => {
    await render(<NearbyRow event={{ ...(base as object), cover_image_url: 'https://x/y.jpg' } as never} now={NOW} withDistance onPress={jest.fn()} />)
    expect(screen.getByText('8:30 PM', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByTestId('nearby-row-thumb', { includeHiddenElements: true })).toBeNull()
    expect(screen.queryByTestId('nearby-row-time-col', { includeHiddenElements: true })).toBeNull()
  })
})

it('at the default size: the time column and the photo (the control)', async () => {
  const RN = jest.requireActual('react-native') as typeof import('react-native')
  const spy = jest.spyOn(RN, 'useWindowDimensions').mockReturnValue({ width: 393, height: 852, scale: 3, fontScale: 1 })
  await render(<NearbyRow event={base} now={NOW} withDistance onPress={jest.fn()} />)
  expect(screen.getByTestId('nearby-row-thumb', { includeHiddenElements: true })).toBeTruthy()
  expect(screen.getByTestId('nearby-row-time-col', { includeHiddenElements: true })).toBeTruthy()
  spy.mockRestore()
})

it('a big count is grouped the en-US way (board N1worst: 1,240 going)', () => {
  expect(nearbyRowLabel({ ...(base as object), going_count: 1240 } as never, NOW, false)).toMatch(/1,240 going$/)
})

it('the heading draws its count as "· 2" in mono, and Happening now carries the live dot (board `.gh`)', async () => {
  await render(<WhenHeading title="Happening now" count={2} live />)
  expect(screen.getByText('· 2', { includeHiddenElements: true })).toBeTruthy()
  expect(screen.getByTestId('when-heading-live', { includeHiddenElements: true })).toBeTruthy()
})

describe('tags as on the board (`.tg`, `.tg.walk`, `.tg.pr`)', () => {
  const flat = (s: unknown) => Object.assign({}, ...([] as object[]).concat(s as object[]).flat(Infinity).filter(Boolean))
  it('the walk is an ember pill with its rim; a price is outlined with a ticket; numbers in mono', async () => {
    await render(
      <NearbyRow event={{ ...(base as object), from_price: { minor: 49900, currency: 'INR' }, going_count: 41 } as never} now={NOW} withDistance onPress={jest.fn()} />
    )
    const walk = flat(screen.getByTestId('nearby-tag-walk', { includeHiddenElements: true }).props.style)
    expect(walk.backgroundColor).toBe('#552D21')
    expect(walk.borderColor).toBe('rgba(240,84,35,0.7)')
    const price = flat(screen.getByTestId('nearby-tag-price', { includeHiddenElements: true }).props.style)
    expect(price.backgroundColor).toBe('transparent')
    expect(price.borderColor).toBe('rgba(255,255,255,0.16)')
    const n = flat(screen.getByText('41', { includeHiddenElements: true }).props.style)
    expect(n.fontFamily).toMatch(/GeistMono/)
    expect(screen.getByText(/going/, { includeHiddenElements: true })).toBeTruthy()
  })
})
