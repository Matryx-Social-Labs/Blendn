/*
 * Friends here (plans/friends-in-room.md, C1; Flow 5 R-A `friendsHere`): one row in People for the friends who let
 * friends see them. Nothing with none; "Asha Menon is here" for one, "4 friends here" past that, three faces at most,
 * and the count tells the truth at 5,000. The row opens the Friends here screen, where each has Message.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
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
      <FriendsHere friends={people(4)} total={4} onSeeAll={jest.fn()} {...props} />
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

  it('one: their name, "is here", one face; the row opens Friends here', async () => {
    const onSeeAll = jest.fn()
    await draw({ friends: people(1), total: 1, onSeeAll })
    expect(screen.getByText('Asha Menon is here')).toBeTruthy()
    expect(screen.getByTestId('friends-here-face-0', HIDDEN)).toBeTruthy()
    expect(screen.queryByTestId('friends-here-face-1', HIDDEN)).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Asha Menon is here' }))
    expect(onSeeAll).toHaveBeenCalledTimes(1)
  })

  it('four: "4 friends here" and three faces, never a fourth', async () => {
    await draw()
    expect(screen.getByText('4 friends here')).toBeTruthy()
    expect(screen.getByTestId('friends-here-face-2', HIDDEN)).toBeTruthy()
    expect(screen.queryByTestId('friends-here-face-3', HIDDEN)).toBeNull()
  })

  it('five thousand: the count is the truth, grouped, with the first page’s faces', async () => {
    await draw({ friends: people(8), total: 5000 })
    expect(screen.getByText('5,000 friends here')).toBeTruthy()
  })

  it('a very long name stays on the row’s one line (60 pt, ellipsised)', async () => {
    const long = { userId: 'x', name: 'Karthik Subramaniam Venkataraman', photo: null }
    await draw({ friends: [long], total: 1 })
    expect(screen.getByText(`${long.name} is here`).props.numberOfLines).toBe(1)
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
