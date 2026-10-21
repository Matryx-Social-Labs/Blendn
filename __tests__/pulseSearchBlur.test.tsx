/**
 * The Pulse's search and the keyboard.
 *
 * Drive 2, Android: Back closed the keyboard and left the field focused, so the
 * next tap opened no keyboard; a keyboard that actually left now blurs it.
 * Drive 3, iOS: blurring on every hide closed the keyboard after the first
 * typed character (iOS reports a hide on a frame change as you type). Typing
 * must never blur; only an Android hide that leaves the screen does.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React, { useState } from 'react'
import { Dimensions, Keyboard, Platform, TextInput } from 'react-native'

import { PulseSearch } from '../components/pulse/PulseHeader'
import { keyboardLeft } from '../lib/home'


type HideEvent = { endCoordinates: { screenY: number; height: number } }
const HEIGHT = Dimensions.get('screen').height
const LEFT: HideEvent = { endCoordinates: { screenY: HEIGHT, height: 0 } }
/** iOS mid-typing: a "hide" whose end frame is still on screen. */
const FRAME_CHANGE: HideEvent = { endCoordinates: { screenY: HEIGHT - 336, height: 336 } }

// The jest preset's TextInput carries its native methods on the prototype.
const blur = (TextInput as unknown as { prototype: { blur: jest.Mock } }).prototype.blur

let hides: ((e: HideEvent) => void)[] = []
let add: jest.SpyInstance
beforeEach(() => {
  hides = []
  blur.mockClear()
  add = jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, fn: (e: HideEvent) => void) => {
    if (event === 'keyboardDidHide') hides.push(fn)
    return { remove: jest.fn() }
  }) as never)
})
afterEach(() => {
  add.mockRestore()
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
})

function Search() {
  const [query, setQuery] = useState('')
  return <PulseSearch query={query} onChangeQuery={setQuery} onPressFilter={jest.fn()} />
}

async function typeInFocusedSearch(platform: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { value: platform, configurable: true })
  const dismiss = jest.spyOn(Keyboard, 'dismiss')
  await render(<Search />)
  await act(async () => fireEvent(screen.getByLabelText('Search events'), 'focus'))
  for (const q of ['q', 'qu', 'qui', 'quiz']) {
    await act(async () => fireEvent.changeText(screen.getByLabelText('Search events'), q))
    // What iOS sends between characters.
    await act(async () => hides.forEach((h) => h(FRAME_CHANGE)))
  }
  return dismiss
}

it.each(['ios', 'android'] as const)('%s: typing several characters while focused never blurs or dismisses', async (platform) => {
  const dismiss = await typeInFocusedSearch(platform)
  expect(blur).not.toHaveBeenCalled()
  expect(dismiss).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Search events').props.value).toBe('quiz')
  dismiss.mockRestore()
})

it('Android: the keyboard leaving (Back) blurs the focused search, and keeps its text', async () => {
  await typeInFocusedSearch('android')
  await act(async () => hides.forEach((h) => h(LEFT)))
  expect(blur).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText('Search events').props.value).toBe('quiz')
})

it('iOS: not even a real hide blurs (iOS blurs on its own when it means to)', async () => {
  await typeInFocusedSearch('ios')
  expect(hides).toHaveLength(0)
  expect(blur).not.toHaveBeenCalled()
})

it('keyboardLeft: off screen or zero height is a hide; a frame still on screen is not', () => {
  expect(keyboardLeft(LEFT, HEIGHT)).toBe(true)
  expect(keyboardLeft({ endCoordinates: { screenY: HEIGHT, height: 336 } }, HEIGHT)).toBe(true)
  expect(keyboardLeft(FRAME_CHANGE, HEIGHT)).toBe(false)
  expect(keyboardLeft(undefined, HEIGHT)).toBe(true)
})
