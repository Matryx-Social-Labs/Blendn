/*
 * A Banter row inside a SwipeRow is drawn, not read: the SwipeRow is the one element (its label, its actions). On
 * Android a bare Pressable is focusable by default, so TalkBack stopped twice on every swipeable row (be2 drive,
 * 2026-11-20: the Rooms rows, then every People and Crews row).
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)

/* eslint-disable import/first */
import { BanterRow, RequestCard } from '../components/banter/BanterParts'
/* eslint-enable import/first */

const line = { kind: 'text', text: 'Leaving in 10' } as const
const face = { kind: 'glyph', icon: 'car' } as const

describe('the Banter row as a screen reader meets it', () => {
  it('with no label (a SwipeRow is the element) it is no stop at all, on either platform', async () => {
    await render(<BanterRow face={face} title="Your ride" line={line} time="10m" unread={false} muted={false} testID="row" />)
    const row = screen.getByTestId('row', { includeHiddenElements: true })
    expect(row.props.accessible).toBe(false)
    expect(row.props.focusable).toBe(false)
    expect(row.props.importantForAccessibility).toBe('no')
  })

  it('with a label it is the one button', async () => {
    await render(<BanterRow face={face} title="Your ride" line={line} time="10m" unread={false} muted={false} onPress={jest.fn()} accessibilityLabel="Your ride, Leaving in 10, 10m" testID="row" />)
    const row = screen.getByTestId('row')
    expect(row.props.accessible).toBe(true)
    expect(row.props.focusable).not.toBe(false)
    expect(row.props.importantForAccessibility).not.toBe('no')
    expect(screen.getByRole('button', { name: 'Your ride, Leaving in 10, 10m' })).toBeTruthy()
  })
})

describe('a request card as a screen reader meets it', () => {
  it('reads its time in the card, and the tag beside it is no stop of its own', async () => {
    await render(
      <RequestCard face={null} name="Aanya Nair" met="Met in the Lobby · Your ride" note="Still leaving at 4?" time="43m" onAccept={jest.fn()} onDecline={jest.fn()} onOpen={jest.fn()} />
    )
    expect(screen.getByLabelText('Aanya Nair. Met in the Lobby · Your ride. Still leaving at 4?. 43m')).toBeTruthy()
    expect(screen.queryByText('43m')).toBeNull()
    expect(screen.getByText('43m', { includeHiddenElements: true })).toBeTruthy()
  })
})
