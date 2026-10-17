/**
 * The Pulse's search gives up focus when the keyboard goes (drive 2, Android):
 * Back closed the keyboard and left the field focused, so the next tap opened
 * no keyboard. Blurred, the next tap is a fresh focus; the text stays.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Keyboard, TextInput } from 'react-native'

import { PulseHeader } from '../components/pulse/PulseHeader'

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }))

it('the keyboard hiding (Android Back) blurs the focused search, and keeps its text', async () => {
  const hide: (() => void)[] = []
  const add = jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, fn: () => void) => {
    if (event === 'keyboardDidHide') hide.push(fn)
    return { remove: jest.fn() }
  }) as never)
  await render(
    <PulseHeader title="The " titleAccent="Pulse" city="Bengaluru" onPressCity={jest.fn()} query="jazz" onChangeQuery={jest.fn()} onPressFilter={jest.fn()} />
  )
  const field = screen.getByLabelText('Search events')
  // The jest preset's TextInput carries its native methods on the prototype.
  const blur = (TextInput as unknown as { prototype: { blur: jest.Mock } }).prototype.blur
  blur.mockClear()

  expect(hide).toHaveLength(0)
  await act(async () => fireEvent(field, 'focus'))
  expect(hide).toHaveLength(1)
  await act(async () => hide[0]())
  expect(blur).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText('Search events').props.value).toBe('jazz')
  add.mockRestore()
})
