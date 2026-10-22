/*
 * Flow 4 R4.1 4.6 (#25): the event was cancelled while you are inside. The
 * server sends `live:ended { reason: 'cancelled' }`; the Room becomes a calm
 * card that says you are checked out. An older server sends nothing, and
 * nothing happens.
 */
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo } from 'react-native'

import { RoomCancelled } from '../components/blendn/RoomCancelled'
import { useRoomCancelled } from '../lib/useRoomCancelled'

type Ended = (d: { eventId: string; reason: string }) => void
let push: Ended = () => {}
let pushCancelled: (d: { eventId: string }) => void = () => {}
const mockSubscribedTo = jest.fn()
const mockChanged = jest.fn()
jest.mock('../lib/socketClient', () => ({
  subscribeToEventCancelled: (id: string, cb: typeof pushCancelled) => {
    mockSubscribedTo(id)
    pushCancelled = cb
    return () => {}
  },
  subscribeToLiveEnded: (cb: Ended) => {
    push = cb
    return () => {}
  },
}))
jest.mock('../lib/checkIn', () => ({ checkInChanged: (...a: unknown[]) => mockChanged(...a) }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)

const EVENT = { id: 'e1', title: 'Vinyl Night' }
beforeEach(() => mockChanged.mockClear())

describe('useRoomCancelled · event:cancelled', () => {
  beforeEach(() => mockSubscribedTo.mockClear())

  it('listens in the room you are inside, and the socket event makes the card', async () => {
    const { result } = await renderHook(() => useRoomCancelled(EVENT))
    expect(mockSubscribedTo).toHaveBeenCalledWith('e1')
    await act(async () => pushCancelled({ eventId: 'e1' }))
    expect(result.current.cancelled).toEqual({ title: 'Vinyl Night' })
    expect(mockChanged).toHaveBeenCalledWith('e1')
  })

  it('another event’s cancellation is not this room’s', async () => {
    const { result } = await renderHook(() => useRoomCancelled(EVENT))
    await act(async () => pushCancelled({ eventId: 'other' }))
    expect(result.current.cancelled).toBeNull()
  })

  it('listens to nothing outside a room', async () => {
    await renderHook(() => useRoomCancelled(null))
    expect(mockSubscribedTo).not.toHaveBeenCalled()
  })
})

describe('useRoomCancelled', () => {
  it('is nothing until the server says cancelled for this event', async () => {
    const { result } = await renderHook(() => useRoomCancelled(EVENT))
    expect(result.current.cancelled).toBeNull()
    await act(async () => push({ eventId: 'e1', reason: 'expired' }))
    await act(async () => push({ eventId: 'other', reason: 'cancelled' }))
    expect(result.current.cancelled).toBeNull()
  })

  it('keeps the title after the room has gone, and drains the disc now', async () => {
    const { result, rerender } = await renderHook(({ e }: { e: typeof EVENT | null }) => useRoomCancelled(e), { initialProps: { e: EVENT as typeof EVENT | null } })
    await act(async () => push({ eventId: 'e1', reason: 'cancelled' }))
    expect(result.current.cancelled).toEqual({ title: 'Vinyl Night' })
    expect(mockChanged).toHaveBeenCalledWith('e1')
    await rerender({ e: null })
    expect(result.current.cancelled).toEqual({ title: 'Vinyl Night' })
  })

  it('dismisses, and a different room is a clean slate', async () => {
    const { result, rerender } = await renderHook(({ e }: { e: typeof EVENT }) => useRoomCancelled(e), { initialProps: { e: EVENT } })
    await act(async () => push({ eventId: 'e1', reason: 'cancelled' }))
    await rerender({ e: { id: 'e2', title: 'Techno' } })
    expect(result.current.cancelled).toBeNull()
    await act(async () => push({ eventId: 'e2', reason: 'cancelled' }))
    expect(result.current.cancelled).not.toBeNull()
    await act(async () => result.current.dismiss())
    expect(result.current.cancelled).toBeNull()
  })

  it('does nothing outside a room', async () => {
    const { result } = await renderHook(() => useRoomCancelled(null))
    await act(async () => push({ eventId: 'e1', reason: 'cancelled' }))
    expect(result.current.cancelled).toBeNull()
  })
})

describe('<RoomCancelled>', () => {
  it('says what happened, offers tonight and Close, and is heard once', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => {})
    const onSeeTonight = jest.fn()
    const onClose = jest.fn()
    await render(<RoomCancelled title="Vinyl Night" onSeeTonight={onSeeTonight} onClose={onClose} testID="c" />)
    expect(screen.getByText('Vinyl Night was cancelled')).toBeTruthy()
    expect(screen.getByText('The organiser called it off. You’re checked out.')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'See what’s on tonight' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }))
    expect(onSeeTonight).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(announce).toHaveBeenCalledTimes(1)
  })

  it('is modal for a screen reader and scrolls, so large type never clips its actions', async () => {
    await render(<RoomCancelled title="Vinyl Night" onSeeTonight={jest.fn()} onClose={jest.fn()} testID="c" />)
    expect(screen.getByTestId('c').props.accessibilityViewIsModal).toBe(true)
    expect(screen.UNSAFE_getByType(require('react-native').ScrollView)).toBeTruthy()
  })

  it('a very long title wraps in the card and never pushes the actions off', async () => {
    await render(<RoomCancelled title="The Extraordinarily Long Named Night of Many Many Words and Sounds" onSeeTonight={jest.fn()} onClose={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  })
})
