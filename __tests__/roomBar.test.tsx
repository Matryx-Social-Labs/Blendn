import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'

/** The room's bar (Flow 5 R-A): the count compact to the eye and exact to the ear, the tabs a tablist, Chat's badge. */
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }))

// eslint-disable-next-line import/first
import { RoomBar, UNDERLINE_SLIDE_MS, underlineStyle } from '../components/blendn/RoomBar'

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
  await fireEvent.press(view.getByTestId('room-tab-people-word'))
  expect(onTab).not.toHaveBeenCalled()
  await fireEvent.press(view.getByTestId('room-tab-chat-word'))
  expect(onTab).toHaveBeenCalledWith('chat')
})

describe('the underline (audit D-1: it slides to the picked tab in 180 ms; Reduce Motion: it is just there)', () => {
  it('one underline for the bar, never one per tab', async () => {
    const view = await render(bar({ tab: 'chat', chatUnread: 3 }))
    expect(view.getAllByTestId('room-tab-underline')).toHaveLength(1)
    expect(view.queryByTestId('room-tab-chat-word-underline')).toBeNull()
  })

  it('slides on a 180 ms timing to the tab word; control: not sliding (first placement, Reduce Motion) sets it with no timing', () => {
    const sliding = underlineStyle({ x: 98, width: 40 }, true) as unknown as { width: { type: string; toValue: number }; transform: { translateX: { type: string; toValue: number } }[] }
    expect(sliding.width).toMatchObject({ type: 'timing', toValue: 40 })
    expect(sliding.transform[0].translateX).toMatchObject({ type: 'timing', toValue: 98 })
    expect(UNDERLINE_SLIDE_MS).toBe(180)
    expect(underlineStyle({ x: 8, width: 62 }, false)).toEqual({ opacity: 1, width: 62, transform: [{ translateX: 8 }] })
    // Not measured yet: nothing drawn, rather than a bar at x 0.
    expect(underlineStyle(undefined, true)).toEqual({ opacity: 0 })
  })
})
