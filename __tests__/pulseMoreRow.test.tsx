/**
 * Saving one Everything-else row re-renders that row and no other: the rows are memoised on their own values and
 * stable handlers, not on the screen's whole maps.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React, { useState } from 'react'

const mockRenders: Record<string, number> = {}
jest.mock('../components/ds/EventCard', () => {
  const { Pressable, Text } = require('react-native')
  return {
    EventCard: (p: { title: string; testID?: string }) => {
      mockRenders[p.title] = (mockRenders[p.title] ?? 0) + 1
      return (
        <Pressable testID={p.testID}>
          <Text>{p.title}</Text>
        </Pressable>
      )
    },
  }
})

/* eslint-disable import/first */
import { MoreRow } from '../components/pulse/MoreRow'
/* eslint-enable import/first */

const events = ['One', 'Two', 'Three'].map((title) => ({ id: title, title })) as never[]
const noop = () => {}

function List() {
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  // The same shape as the screen: the handlers are stable, the per-row value is looked up in a map that changes.
  const onSave = React.useCallback((e: { id: string }) => setSaved((prev) => ({ ...prev, [e.id]: !prev[e.id] })), [])
  return (
    <>
      {events.map((event: { id: string; title: string }) => (
        <MoreRow
          key={event.id}
          event={event as never}
          title={event.title}
          time="9 PM"
          venue="Toit"
          cover={null}
          note={null}
          saved={!!saved[event.id]}
          onPress={noop}
          onPressIn={noop}
          onPeek={noop}
          onSave={onSave}
        />
      ))}
    </>
  )
}

beforeEach(() => {
  for (const k of Object.keys(mockRenders)) delete mockRenders[k]
})

it('a save re-renders only that row, and the heart is a named toggle that is never disabled in flight', async () => {
  await render(<List />)
  expect(mockRenders).toEqual({ One: 1, Two: 1, Three: 1 })
  const heart = screen.getByRole('button', { name: 'Save Two' })
  expect(heart.props.accessibilityState).toMatchObject({ disabled: false, selected: false })
  await fireEvent.press(heart)
  expect(screen.getByRole('button', { name: 'Saved, Two' }).props.accessibilityState).toMatchObject({ selected: true })
  // Two drew again (its heart changed); One and Three did not.
  expect(mockRenders).toEqual({ One: 1, Two: 2, Three: 1 })
})
