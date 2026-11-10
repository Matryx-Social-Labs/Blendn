import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'

/** The room's bar (Flow 5 R-A): the count compact to the eye and exact to the ear, the tabs a tablist, Chat's badge. */
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }))

// eslint-disable-next-line import/first
import { RoomBar } from '../components/blendn/RoomBar'

const bar = (over: Partial<React.ComponentProps<typeof RoomBar>> = {}) => (
  <RoomBar insetTop={54} event="Rooftop Sundowner: House and Disco on the Terrace" hereCount={12480} tab="people" chatUnread={0} onTab={jest.fn()} onClose={jest.fn()} onInfo={jest.fn()} {...over} />
)

it('shows 12k here and says 12,480 here', async () => {
  const view = await render(bar())
  expect(view.getByText('12k here')).toBeTruthy()
  expect(view.getByTestId('room-bar-here').props.accessibilityLabel).toBe('12,480 here')
})

it('caps the Chat badge at 9+ and says it with the tab; no badge at 0', async () => {
  const view = await render(bar({ chatUnread: 14 }))
  expect(view.getByText('9+', { includeHiddenElements: true })).toBeTruthy()
  expect(view.getByLabelText('Chat, 9 or more new')).toBeTruthy()
  await view.rerender(bar({ chatUnread: 0 }))
  expect(view.queryByTestId('room-tab-chat-word-badge')).toBeNull()
  expect(view.getByLabelText('Chat')).toBeTruthy()
})

it('is a tablist with the chosen tab selected, and a tap on the other switches', async () => {
  const onTab = jest.fn()
  const view = await render(bar({ onTab }))
  expect(view.getByTestId('room-tabs').props.accessibilityRole).toBe('tablist')
  expect(view.getByTestId('room-tab-people-word').props.accessibilityState).toMatchObject({ selected: true })
  expect(view.getByTestId('room-tab-chat-word').props.accessibilityState).toMatchObject({ selected: false })
  fireEvent.press(view.getByTestId('room-tab-people-word'))
  expect(onTab).not.toHaveBeenCalled()
  fireEvent.press(view.getByTestId('room-tab-chat-word'))
  expect(onTab).toHaveBeenCalledWith('chat')
})
