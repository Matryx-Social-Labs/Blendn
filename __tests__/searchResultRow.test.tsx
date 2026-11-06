/**
 * The search result row (Flow 3 · Pulse board, the "C · search" frame; owner 2026-11-05): the time over the title, "at
 * venue · 2.2 km" under it, the photo on the right (72 pt, 16 corner), at least 88 tall. A layout of the DS EventCard row.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { EventCard } from '../components/ds/EventCard'
import { FONT_FAMILY } from '../lib/design/tokens'

jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))

const props = { kind: 'row' as const, title: 'Jazz brunch on the lawn', time: 'Sun · 12 PM', venue: 'Olive Beach', distance: '2.2 km', cover: 'https://x/y.jpg', onPress: jest.fn() }
const flat = (s: unknown) => StyleSheet.flatten(s as never) as Record<string, unknown>

it('result: the time first in mono, the title, then "at venue · distance"; the photo after the words, 72 pt with a 16 corner', async () => {
  await render(<EventCard {...props} layout="result" testID="r" />)
  const time = screen.getByText('Sun · 12 PM')
  expect(flat(time.props.style).fontFamily).toBe(FONT_FAMILY.mono[500])
  expect(screen.getByText('Jazz brunch on the lawn')).toBeTruthy()
  // "at venue" and its distance are two slots: the venue gives way, the distance stays (owner 2026-11-05).
  expect(screen.getByTestId('r-venue')).toHaveTextContent('at Olive Beach')
  expect(screen.getByTestId('r-distance')).toHaveTextContent('· 2.2 km')
  expect(flat(screen.getByTestId('r-distance').props.style).flexShrink).toBe(0)
  const thumb = flat(screen.getByTestId('r-thumb').props.style)
  expect(thumb).toMatchObject({ width: 72, height: 72, borderRadius: 16 })
  // The photo is on the right: drawn after the words.
  const tree = JSON.stringify(screen.toJSON())
  const at = (text: string) => tree.indexOf(JSON.stringify([text]))
  expect(at('Sun · 12 PM')).toBeGreaterThan(-1)
  expect(at('Sun · 12 PM')).toBeLessThan(at('Jazz brunch on the lawn'))
  expect(tree.indexOf('"r-thumb"')).toBeGreaterThan(at('Jazz brunch on the lawn'))
  expect(flat(screen.getByTestId('r').props.style).minHeight).toBe(88)
  // Board `.urow .rowtx`: its three lines 2 apart, so the block is 64 and sits 12 from the row's top.
  expect(flat(screen.getByTestId('r-words').props.style).gap).toBe(2)
})

it('without the layout: the row as it was, the 56 pt thumb on the left (the control)', async () => {
  await render(<EventCard {...props} testID="r" />)
  expect(flat(screen.getByTestId('r-thumb').props.style)).toMatchObject({ width: 56, height: 56 })
  expect(screen.queryByText(/^at Olive Beach/)).toBeNull()
})

describe('held, a result lifts as itself (the peek redraws the row it came from)', () => {
  const { PulsePeek } = jest.requireActual('../components/pulse/PulsePeek') as typeof import('../components/pulse/PulsePeek')
  const event = {
    id: 'e1', title: 'Jazz brunch on the lawn', start_time: '2026-11-08T06:30:00Z', end_time: null, timezone: 'Asia/Kolkata',
    venue_name: 'Olive Beach', distance: 2.2, cover_image_url: 'https://x/y.jpg', going_count: 0,
  } as never
  const anchor = { x: 24, y: 300, width: 354, height: 88 }
  it('a search result: the 72 pt photo, the time over the title', async () => {
    await render(<PulsePeek peek={{ event, anchor, kind: 'row', layout: 'result' }} now={Date.parse('2026-11-04T14:10:00Z')} withDistance interested={false} checkedIn={false} withinFence={false} onAction={jest.fn()} onClose={jest.fn()} />)
    const tree = JSON.stringify(screen.toJSON())
    expect(tree).toMatch(/"width":72,"height":72,"borderRadius":16/)
    expect(tree.indexOf('["Jazz brunch on the lawn"]')).toBeGreaterThan(tree.indexOf('["Sun · 12 PM"]'))
    expect(tree.indexOf('["Sun · 12 PM"]')).toBeGreaterThan(-1)
  })
})
