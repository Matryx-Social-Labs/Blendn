/**
 * Focus moves to what arrived (motion audit M5): opening Blend'n moved no focus (the disc that was tapped was hidden
 * under the overlay), and Rate swapped the whole form on Submit with nothing said. `useFocusWhen` sends focus to a
 * heading each time its key changes to a value, once the arrival has settled.
 */
import { act, render } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'
import { useRef } from 'react'
import { AccessibilityInfo, Text } from 'react-native'

import { FOCUS_SETTLE_MS, useFocusWhen } from '../lib/focusReturn'

function Heading({ k }: { k: unknown }) {
  const ref = useRef<Text>(null)
  useFocusWhen(ref, k)
  return <Text ref={ref}>Tonight</Text>
}

beforeEach(() => jest.useFakeTimers())
afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

it('focuses once the arrival settles, again for each new key, never for none', async () => {
  const send = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {})
  const r = await render(<Heading k={null} />)
  await act(async () => jest.advanceTimersByTime(FOCUS_SETTLE_MS))
  expect(send).not.toHaveBeenCalled()
  await r.rerender(<Heading k="tonight" />)
  await act(async () => jest.advanceTimersByTime(FOCUS_SETTLE_MS - 1))
  expect(send).not.toHaveBeenCalled()
  await act(async () => jest.advanceTimersByTime(1))
  expect(send).toHaveBeenCalledTimes(1)
  expect(send.mock.calls[0][1]).toBe('focus')
  await r.rerender(<Heading k="tonight" />)
  await act(async () => jest.advanceTimersByTime(FOCUS_SETTLE_MS))
  expect(send).toHaveBeenCalledTimes(1)
  await r.rerender(<Heading k={2} />)
  await act(async () => jest.advanceTimersByTime(FOCUS_SETTLE_MS))
  expect(send).toHaveBeenCalledTimes(2)
})

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

it('Tonight, the Room and each person on Rate take focus as they arrive', () => {
  expect(src('components/blendn/TonightView.tsx')).toMatch(/useFocusWhen\(headingRef, active \? 'tonight' : null\)/)
  expect(src('components/blendn/BlendnScreen.tsx')).toMatch(/<TonightView[\s\S]{0,80}active=\{mode === 'tonight'\}/)
  expect(src('components/blendn/RoomSections.tsx')).toMatch(/useFocusWhen\(titleRef, active \? title : null\)/)
  expect(src('components/blendn/RoomView.tsx')).toMatch(/<RoomHero[\s\S]{0,60}active=\{!hidden\}/)
  // The person, with the progress the bar shows, read on every Submit and Skip.
  expect(src('app/rate/[eventId].tsx')).toMatch(/useFocusWhen\(personRef, person \? index : null\)/)
  expect(src('app/rate/[eventId].tsx')).toContain('accessibilityLabel={`${person.name}, ${index + 1} of ${people.length}`}')
})
