/*
 * A state's actions by default (rc7 D4, PLAN-buttons L3): the first is the lit recovery, the rest are quiet. "Try again"
 * was a gradient on Banter, Going, Notifications and the Pulse offline because the default was `primary`. A screen whose
 * one CTA it is says so (`primary`), and a caller's kind is kept.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'

import { StateScreen } from '../components/ds/StateScreen'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('../components/ds/Button', () => {
  const { Text } = jest.requireActual('react-native')
  return { Button: ({ label, kind, size }: { label: string; kind: string; size?: string }) => <Text testID={`btn-${label}`}>{`${kind}|${size ?? 'default'}`}</Text> }
})

const kindOf = (label: string) => screen.getByTestId(`btn-${label}`).props.children as string

it('the first action is lit at 48, the rest secondary, when the caller names no kind', async () => {
  await render(<StateScreen icon="cloud-off" title="Couldn’t load your chats" actions={[{ label: 'Try again', onPress: jest.fn() }, { label: 'Go back', onPress: jest.fn() }]} />)
  expect(kindOf('Try again')).toBe('lit|md')
  expect(kindOf('Go back')).toBe('secondary|md')
})

it('keeps a kind the caller names: a screen’s one CTA stays the gradient', async () => {
  await render(<StateScreen icon="users" title="No crews yet" actions={[{ label: 'Make a crew', kind: 'primary', onPress: jest.fn() }]} />)
  expect(kindOf('Make a crew')).toBe('primary|default')
})
