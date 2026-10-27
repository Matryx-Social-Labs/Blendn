/**
 * Audit L7, L8, L10 (a11y-motion 2026-10-24): the small names and roles a screen reader needs.
 * L7: the crew overflow menu's backdrop is a button ("Close menu"), not a nameless tappable.
 * L8: an empty photo slot after the first is out of TalkBack's reach too (`importantForAccessibility="no"`), not only
 * `accessible={false}`, which TalkBack still landed on and read with no name.
 * L10: the hold's screen-reader button, with no `srLabel`, says the verb ("Blend in"), not "Hold to blend in".
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo } from 'react-native'

import { OverflowMenu } from '../components/crews/OverflowMenu'
import { HoldToConfirm, spokenVerb } from '../components/ds/HoldToConfirm'
import { AddFace } from '../components/profile/PhotoGridTile'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false) }
})

it('L7: the menu’s backdrop is a button named Close menu', async () => {
  await render(<OverflowMenu visible onClose={jest.fn()} items={[{ icon: 'log-out', label: 'Leave crew', onPress: jest.fn() }]} />)
  expect(screen.getByRole('button', { name: 'Close menu' })).toBeTruthy()
})

it('L8: an empty slot kept out of the reading order is out of it on Android too; the first stays the one Add', async () => {
  await render(
    <>
      <AddFace onPress={jest.fn()} disabled={false} busy={false} label="Add a photo" />
      <AddFace onPress={jest.fn()} disabled={false} busy={false} accessible={false} />
    </>
  )
  type Node = { props?: { importantForAccessibility?: string; accessible?: boolean }; children?: (Node | string)[] | null }
  const slots: Node[] = []
  const walk = (n: Node | string | null) => {
    if (!n || typeof n === 'string') return
    if (n.props?.accessible !== undefined) slots.push(n)
    else (n.children ?? []).forEach(walk)
  }
  const root = screen.toJSON() as Node | Node[] | null
  ;(Array.isArray(root) ? root : [root]).forEach(walk)
  expect(slots.map((n) => n.props?.importantForAccessibility)).toEqual(['auto', 'no'])
  expect(screen.getAllByRole('button')).toHaveLength(1)
})

describe('L10: the hold for a screen reader', () => {
  it('says the verb when the caller names nothing', () => {
    expect(spokenVerb('Hold to blend in')).toBe('Blend in')
    expect(spokenVerb('Hold to go live')).toBe('Go live')
    expect(spokenVerb('Check in')).toBe('Check in')
  })

  it('a double-tap button named "Blend in"', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true)
    await render(<HoldToConfirm label="Hold to blend in" onConfirm={jest.fn()} testID="h" />)
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Blend in' })).toBeTruthy()
  })
})
