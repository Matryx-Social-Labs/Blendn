/*
 * Friends here (plans/friends-in-room.md, C1): the Room's section of friends
 * who let friends see them. Nothing with none; a row and Message for each of
 * up to three; "N more here" and See all past that; offline dims Message; the
 * count tells the truth at 60 and 5,000.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { FriendsHere } from '../components/blendn/FriendsHere'
import { HueProvider } from '../components/ds/shared'
import type { FriendHere } from '../lib/friendsHere'

jest.mock('../lib/apiClient', () => ({ apiClient: {} }))
jest.mock('../lib/socketClient', () => ({}))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false) }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

const NAMES = ['Asha Menon', 'Rohan Iyer', 'Meera Krishnan', 'Aarav Gupta', 'Ananya Bose', 'Arjun Nair', 'Divya Rao', 'Dev Malhotra']
const people = (n: number): FriendHere[] =>
  NAMES.slice(0, n).map((name, i) => ({ userId: `u${i}`, name, photo: i % 2 ? null : `https://example.com/${i}.jpg` }))

const draw = (props: Partial<React.ComponentProps<typeof FriendsHere>> = {}) =>
  render(
    <HueProvider value="rose">
      <FriendsHere friends={people(4)} total={4} opening={null} offline={false} appearances={0} onMessage={jest.fn()} onSeeAll={jest.fn()} {...props} />
    </HueProvider>
  )
const HIDDEN = { includeHiddenElements: true }

describe('<FriendsHere>', () => {
  it('none: nothing at all, no header, no gap', async () => {
    await draw({ friends: [], total: 0 })
    expect(screen.queryByTestId('friends-here', HIDDEN)).toBeNull()
    expect(screen.queryByText('Friends here')).toBeNull()
  })

  it('a total with no page yet draws nothing (never an empty card)', async () => {
    await draw({ friends: [], total: 3 })
    expect(screen.queryByTestId('friends-here', HIDDEN)).toBeNull()
  })

  it('one: the header with no count, one row, Message', async () => {
    await draw({ friends: people(1), total: 1 })
    expect(screen.getByText('Friends here')).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Friends here' })).toBeTruthy()
    expect(screen.getByText('Asha Menon')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Message Asha Menon' })).toBeTruthy()
    expect(screen.queryByText('See all')).toBeNull()
    expect(screen.queryByTestId('friends-here-more', HIDDEN)).toBeNull()
  })

  it('three: the count, three rows, no overflow, no See all', async () => {
    await draw({ friends: people(3), total: 3 })
    expect(screen.getByRole('header', { name: 'Friends here, 3' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^Message / })).toHaveLength(3)
    expect(screen.queryByText('See all')).toBeNull()
    expect(screen.queryByTestId('friends-here-more', HIDDEN)).toBeNull()
  })

  it('four: three rows, "1 more here" and See all; both open the list', async () => {
    const onSeeAll = jest.fn()
    await draw({ onSeeAll })
    expect(screen.getAllByRole('button', { name: /^Message / })).toHaveLength(3)
    expect(screen.queryByText('Aarav Gupta')).toBeNull()
    expect(screen.getByText('1 more here')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'See all 4 friends here' }))
    await fireEvent.press(screen.getByText('See all'))
    expect(onSeeAll).toHaveBeenCalledTimes(2)
  })

  it('sixty and five thousand: the first page is eight, the count is the truth', async () => {
    await draw({ friends: people(8), total: 60 })
    expect(screen.getByText('57 more here')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'See all 60 friends here' })).toBeTruthy()
    await draw({ friends: people(8), total: 1204 })
    expect(screen.getByText('1201 more here')).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Friends here, 1204' })).toBeTruthy()
  })

  it('Message opens that friend’s chat', async () => {
    const onMessage = jest.fn()
    await draw({ onMessage })
    await fireEvent.press(screen.getByRole('button', { name: 'Message Rohan Iyer' }))
    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', name: 'Rohan Iyer' }))
  })

  it('offline: the rows stay and Message is disabled', async () => {
    const onMessage = jest.fn()
    await draw({ offline: true, onMessage })
    expect(screen.getByText('Asha Menon')).toBeTruthy()
    const button = screen.getByRole('button', { name: 'Message Asha Menon' })
    expect(button.props.accessibilityState).toMatchObject({ disabled: true })
    await fireEvent.press(button)
    expect(onMessage).not.toHaveBeenCalled()
  })

  it('busy: only that row’s Message is busy; the others stay enabled', async () => {
    await draw({ opening: 'u1' })
    expect(screen.getByRole('button', { name: 'Message Rohan Iyer' }).props.accessibilityState).toMatchObject({ busy: true })
    expect(screen.getByRole('button', { name: 'Message Asha Menon' }).props.accessibilityState?.disabled).toBeFalsy()
  })

  it('a very long name stays one line and keeps its Message', async () => {
    const long = { userId: 'x', name: 'Karthik Subramaniam Venkataraman', photo: null }
    await draw({ friends: [long], total: 1 })
    expect(screen.getByText(long.name).props.numberOfLines).toBe(1)
    expect(screen.getByRole('button', { name: `Message ${long.name}` })).toBeTruthy()
  })

  it('announces "A friend is here" once, only for an arrival after first paint', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => {})
    const { rerender } = await draw({ appearances: 0 })
    expect(announce).not.toHaveBeenCalled()
    await rerender(
      <HueProvider value="rose">
        <FriendsHere friends={people(4)} total={4} opening={null} offline={false} appearances={1} onMessage={jest.fn()} onSeeAll={jest.fn()} />
      </HueProvider>
    )
    await act(async () => {})
    expect(announce).toHaveBeenCalledWith('A friend is here', { queue: true })
    expect(announce).toHaveBeenCalledTimes(1)
  })

  it('Reduce Motion: the section fades in place, with no rise', async () => {
    const reduce = Reanimated.useReducedMotion as jest.Mock
    await draw()
    const lively = screen.getByTestId('friends-here', HIDDEN).props.entering
    expect(typeof lively).toBe('function')
    reduce.mockReturnValue(true)
    await draw()
    expect(typeof screen.getAllByTestId('friends-here', HIDDEN).at(-1)!.props.entering).not.toBe('function')
    reduce.mockReturnValue(false)
  })
})
