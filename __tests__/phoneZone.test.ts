/*
 * A running app follows the phone to a new zone (R6-7, Android kept the old one until relaunch): on AppState active the
 * zone is re-read, and when it moved the cached formatters go and the clocks (`useNow`) re-render. Jest's `process.env.TZ`
 * does not reach the engine, so the move is the phone's offset changing under the app.
 */
import { createElement } from 'react'
import { act, render } from '@testing-library/react-native'

import { refreshPhoneZone } from '../lib/time'
import { useNow } from '../lib/useNow'

type Time = typeof import('../lib/time')

/** A fresh lib/time: its zone and its formatter caches are module state. */
function freshTime(): { time: Time } {
  let time!: Time
  jest.isolateModules(() => {
    time = require('../lib/time') as Time
  })
  return { time }
}

/** The phone flies to Bengaluru: +5:30. */
const flyToBengaluru = () => jest.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-330)

afterEach(() => {
  jest.restoreAllMocks()
})

it('a zone that did not move is not news; one that did clears the caches and tells the listeners', () => {
  const { time } = freshTime()
  const heard = jest.fn()
  const unsubscribe = time.subscribePhoneZone(heard)
  expect(time.refreshPhoneZone()).toBe(false)
  expect(heard).not.toHaveBeenCalled()

  // Fill the cache, then move.
  time.eventClock('2026-10-24T03:30:00.000Z', 'Asia/Kathmandu')
  flyToBengaluru()
  const built = jest.spyOn(Intl, 'DateTimeFormat')
  expect(time.refreshPhoneZone()).toBe(true)
  expect(heard).toHaveBeenCalledTimes(1)
  // Not news twice.
  expect(time.refreshPhoneZone()).toBe(false)
  // The zone's formatters are built again: the cache was cleared.
  time.eventClock('2026-10-24T03:30:00.000Z', 'Asia/Kathmandu')
  expect(built.mock.calls.some(([, options]) => options?.timeZone === 'Asia/Kathmandu')).toBe(true)

  unsubscribe()
  jest.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(240)
  expect(time.refreshPhoneZone()).toBe(true)
  expect(heard).toHaveBeenCalledTimes(1)
})

it('useNow re-renders the moment the zone moves, not at its next tick', async () => {
  const renders = jest.fn()
  function Probe() {
    renders(useNow(24 * 60 * 60_000))
    return null
  }
  await render(createElement(Probe))
  const before = renders.mock.calls.length
  flyToBengaluru()
  await act(async () => {
    refreshPhoneZone()
  })
  expect(renders.mock.calls.length).toBeGreaterThan(before)
})
