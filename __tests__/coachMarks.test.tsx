/**
 * Coach marks (`lib/coachMarks.ts`, docs/NAVIGATION.md "Coach marks"): once
 * ever per account per mark; using the thing first means never; one new mark a
 * launch, and so one on screen at a time; never before the screen says ready,
 * never signed out; leaving the screen ends it.
 *
 * Each test signs in its own account. The launch's state is per account, so no
 * test inherits another's, and a second account in one test is a real check
 * that it stays that way.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import React from 'react'
import { act, renderHook } from '@testing-library/react-native'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
let mockUser: { id: string } | null = null
let mockFocused = true
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }))
jest.mock('../lib/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
  currentUserId: () => mockUser?.id ?? null,
}))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

/* eslint-disable import/first */
import { markCoachUsed, useCoachMark, type CoachMarkId } from '../lib/coachMarks'
/* eslint-enable import/first */

const PULSE: CoachMarkId = 'events_preview_hint'
const OTHER: CoachMarkId = 'room_reveal'

let accounts = 0
function signIn() {
  accounts += 1
  mockUser = { id: `u${accounts}` }
  return mockUser.id
}
const stored = (id: CoachMarkId, userId: string) => AsyncStorage.getItem(`${id}_seen_${userId}`)

async function mount(id: CoachMarkId, ready = true) {
  const hook = await renderHook((p: { ready: boolean }) => useCoachMark(id, p), { initialProps: { ready } })
  // The stored flag is read once, asynchronously.
  await act(async () => {})
  return hook
}

beforeEach(async () => {
  mockFocused = true
  await AsyncStorage.clear()
})

describe('useCoachMark', () => {
  it('waits for ready, appears once, and is written as seen the moment it does', async () => {
    const userId = signIn()
    const hook = await mount(PULSE, false)
    expect(hook.result.current.visible).toBe(false)
    expect(await stored(PULSE, userId)).toBeNull()

    await hook.rerender({ ready: true })
    expect(hook.result.current.visible).toBe(true)
    expect(await stored(PULSE, userId)).toBe('1')
  })

  it('Got it ends it for good: not on this screen again, nor on a remount', async () => {
    signIn()
    const hook = await mount(PULSE)
    await act(async () => hook.result.current.dismiss())
    expect(hook.result.current.visible).toBe(false)
    await hook.unmount()

    expect((await mount(PULSE)).result.current.visible).toBe(false)
  })

  it('shown once, it is not shown in a later launch: the stored flag decides, not memory', async () => {
    const userId = signIn()
    const first = await mount(PULSE)
    expect(first.result.current.visible).toBe(true)
    // The app is killed while it shows: no Got it, no use.
    await first.unmount()

    // A new launch: a fresh module, nothing in memory, the same phone storage.
    let relaunched!: typeof import('../lib/coachMarks')
    jest.isolateModules(() => {
      jest.doMock('react', () => React)
      jest.doMock('@react-native-async-storage/async-storage', () => AsyncStorage)
      relaunched = require('../lib/coachMarks')
    })
    const again = await renderHook(() => relaunched.useCoachMark(PULSE, { ready: true }))
    await act(async () => {})
    expect(again.result.current.visible).toBe(false)
    expect(await stored(PULSE, userId)).toBe('1')
  })

  it('a mark this account has seen on this phone never appears (the old banner’s key counts)', async () => {
    const userId = signIn()
    await AsyncStorage.setItem(`events_preview_hint_seen_${userId}`, '1')
    expect((await mount(PULSE)).result.current.visible).toBe(false)
  })

  it('used before it was ever shown, it never appears, and that is remembered', async () => {
    const userId = signIn()
    markCoachUsed(PULSE)
    expect((await mount(PULSE)).result.current.visible).toBe(false)
    await act(async () => {})
    expect(await stored(PULSE, userId)).toBe('1')
  })

  it('used while it is showing, it goes', async () => {
    signIn()
    const hook = await mount(PULSE)
    expect(hook.result.current.visible).toBe(true)
    await act(async () => markCoachUsed(PULSE))
    expect(hook.result.current.visible).toBe(false)
  })

  it('leaving the screen ends it; coming back does not bring it back', async () => {
    signIn()
    const hook = await mount(PULSE)
    expect(hook.result.current.visible).toBe(true)

    mockFocused = false
    await hook.rerender({ ready: true })
    expect(hook.result.current.visible).toBe(false)

    mockFocused = true
    await hook.rerender({ ready: true })
    expect(hook.result.current.visible).toBe(false)
  })

  it('the screen going away ends it too', async () => {
    signIn()
    const hook = await mount(PULSE)
    expect(hook.result.current.visible).toBe(true)
    await hook.unmount()
    expect((await mount(PULSE)).result.current.visible).toBe(false)
  })

  it('not ready for a moment (a sheet over it) hides it, and it comes back while you stay', async () => {
    signIn()
    const hook = await mount(PULSE)
    await hook.rerender({ ready: false })
    expect(hook.result.current.visible).toBe(false)
    await hook.rerender({ ready: true })
    expect(hook.result.current.visible).toBe(true)
  })

  it('one at a time: two marks ready together, one appears', async () => {
    signIn()
    const a = await mount(PULSE)
    const b = await mount(OTHER)
    expect([a.result.current.visible, b.result.current.visible]).toEqual([true, false])
  })

  it('one new mark a launch: after one is dismissed, the next waits for the next launch', async () => {
    const userId = signIn()
    const a = await mount(PULSE)
    await act(async () => a.result.current.dismiss())
    const b = await mount(OTHER)
    expect(b.result.current.visible).toBe(false)
    // Not burned: it was never shown, so a later launch still teaches it.
    expect(await stored(OTHER, userId)).toBeNull()
  })

  it('per account: one account seeing it does not spend another’s', async () => {
    signIn()
    const a = await mount(PULSE)
    await act(async () => a.result.current.dismiss())
    await a.unmount()

    const second = signIn()
    const b = await mount(PULSE)
    expect(b.result.current.visible).toBe(true)
    expect(await stored(PULSE, second)).toBe('1')
  })

  it('signed out shows nothing and records nothing', async () => {
    mockUser = null
    const hook = await mount(PULSE)
    expect(hook.result.current.visible).toBe(false)
    markCoachUsed(PULSE)
    await act(async () => {})
    expect(await AsyncStorage.getAllKeys()).toEqual([])
  })

  it('a flag that cannot be read is treated as seen: a broken store never loops a mark', async () => {
    signIn()
    const read = jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'))
    expect((await mount(PULSE)).result.current.visible).toBe(false)
    read.mockRestore()
  })
})
