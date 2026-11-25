import React, { useRef } from 'react'
import { AccessibilityInfo, View } from 'react-native'
import { render } from '@testing-library/react-native'

import { FOCUS_SETTLE_MS, useFocusWhen } from '../lib/focusReturn'

/**
 * `useFocusWhen`'s settle timer never outlives its view or its key (SCRUM-1043). A timer left running after an unmount
 * fired in the next test file, after its environment was torn down, and failed whichever suite ran there.
 */
function Heading({ k }: { k: unknown }) {
  const ref = useRef<View>(null)
  useFocusWhen(ref, k)
  return <View ref={ref} accessible />
}

let focus: jest.SpyInstance
let set: jest.SpyInstance
let clear: jest.SpyInstance
beforeEach(() => {
  jest.useFakeTimers()
  focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {})
  set = jest.spyOn(global, 'setTimeout')
  clear = jest.spyOn(global, 'clearTimeout')
})
afterEach(() => jest.useRealTimers())

/** The hook's own timers (React schedules its own too): the ones set for the settle time. */
const settleTimers = () => set.mock.calls.flatMap((call, i) => (call[1] === FOCUS_SETTLE_MS ? [set.mock.results[i].value] : []))
/** Of those, the ones still pending: never cleared and not yet fired. */
const pending = () => settleTimers().filter((t) => !clear.mock.calls.some(([c]) => c === t))

it('control: focus lands once the arrival has settled', async () => {
  await render(<Heading k="a" />)
  expect(focus).not.toHaveBeenCalled()
  jest.advanceTimersByTime(FOCUS_SETTLE_MS)
  expect(focus).toHaveBeenCalledTimes(1)
  expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus')
})

it('unmounted before it settles: no focus, and no timer left behind', async () => {
  const view = await render(<Heading k="a" />)
  expect(pending()).toHaveLength(1)
  await view.unmount()
  expect(pending()).toHaveLength(0)
  jest.advanceTimersByTime(FOCUS_SETTLE_MS * 2)
  expect(focus).not.toHaveBeenCalled()
})

it('a new key before it settles replaces the timer: one focus, for the new key', async () => {
  const view = await render(<Heading k="a" />)
  await view.rerender(<Heading k="b" />)
  expect(settleTimers()).toHaveLength(2)
  expect(pending()).toHaveLength(1)
  jest.advanceTimersByTime(FOCUS_SETTLE_MS)
  expect(focus).toHaveBeenCalledTimes(1)
})

it('no key yet: no timer at all', async () => {
  await render(<Heading k={null} />)
  expect(settleTimers()).toHaveLength(0)
})
