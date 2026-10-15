/*
 * <CoachMark> (guidelines/components/CoachMark.html): a surface card with a
 * caret at what it names, one sentence, "Got it"; announced once, never takes
 * focus; no haptic; it pops in, and under Reduce Motion it appears.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { CoachMark } from '../components/ds/CoachMark'
import { COLOR, SPRING } from '../lib/design/tokens'
import { H } from '../lib/haptics'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false), withSpring: jest.fn(actual.withSpring) }
})

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const withSpring = Reanimated.withSpring as jest.Mock
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style)
const TEXT = 'Hold the button when you’re at the event. It checks you in.'

beforeEach(() => {
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
  reduceMotion.mockReturnValue(false)
})

describe('<CoachMark>', () => {
  it('a surface card; “Got it” dismisses; announced once; nothing plays', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
    const spies = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
    const onDismiss = jest.fn()
    await render(<CoachMark text={TEXT} onDismiss={onDismiss} testID="c" />)
    expect(flat('c-card').backgroundColor).toBe(COLOR.surface)
    expect(announce).toHaveBeenCalledWith(`${TEXT} Got it, button.`)
    await fireEvent.press(screen.getByRole('button', { name: 'Got it' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(announce).toHaveBeenCalledTimes(1)
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('the caret sits on the side it points from, at its offset', async () => {
    await render(<CoachMark text={TEXT} onDismiss={jest.fn()} caret="bottom" caretOffset={40} testID="c" />)
    expect(flat('c-caret')).toMatchObject({ left: 40, bottom: expect.any(Number) })
  })

  it('without an action: no button (it goes when the thing is used)', async () => {
    await render(<CoachMark text="Tap a face to see who’s here." action={false} onDismiss={jest.fn()} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('pops in on M.pop; under Reduce Motion it appears without the pop', async () => {
    await render(<CoachMark text={TEXT} onDismiss={jest.fn()} />)
    expect(withSpring).toHaveBeenCalledWith(1, expect.objectContaining({ stiffness: SPRING.pop.stiffness }))
    withSpring.mockClear()
    reduceMotion.mockReturnValue(true)
    await render(<CoachMark text={TEXT} onDismiss={jest.fn()} />)
    expect(withSpring).not.toHaveBeenCalled()
  })
})
