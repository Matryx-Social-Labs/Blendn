/**
 * How this phone signed the account in: remembered at sign-in, read by Settings' Account card, forgotten with the
 * session, and anything that is not one of the three is "unknown" rather than a guess.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

import AsyncStorage from '@react-native-async-storage/async-storage'
import { renderHook, waitFor } from '@testing-library/react-native'
import { forgetAuthMethod, isAuthMethod, readAuthMethod, rememberAuthMethod, useAuthMethod } from '../lib/authMethod'

beforeEach(async () => AsyncStorage.clear())

it('reads back what was remembered, per method', async () => {
  for (const method of ['password', 'google', 'apple'] as const) {
    await rememberAuthMethod(method)
    expect(await readAuthMethod()).toBe(method)
  }
})

it('a session that predates the record is unknown, not password', async () => {
  expect(await readAuthMethod()).toBeNull()
})

it('forgets with the session', async () => {
  await rememberAuthMethod('google')
  await forgetAuthMethod()
  expect(await readAuthMethod()).toBeNull()
})

it('a stored value that is not a method reads as unknown', async () => {
  await AsyncStorage.setItem('blendn.auth.method', 'facebook')
  expect(await readAuthMethod()).toBeNull()
  expect(isAuthMethod('facebook')).toBe(false)
})

it('sign-in remembers the method it used, and clearing the session forgets it (source shape of lib/useAuth)', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'lib', 'useAuth.ts'), 'utf8') as string
  expect(src.match(/rememberAuthMethod\('password'\)/g)).toHaveLength(2)
  expect(src).toContain("rememberAuthMethod('google')")
  expect(src).toContain("rememberAuthMethod('apple')")
  expect(src.slice(src.indexOf('const clearAuthState'), src.indexOf('const clearAuthState') + 200)).toContain('forgetAuthMethod()')
})

describe('useAuthMethod (SCRUM-742: the server answers for the account)', () => {
  it("an upgrader's session with no remembered method gets the Password row from the server's answer", async () => {
    const { result } = await renderHook(() => useAuthMethod('password'))
    expect(result.current).toBe('password')
  })

  it("the server's answer beats what this phone remembered (a password added since)", async () => {
    await rememberAuthMethod('google')
    const { result } = await renderHook(() => useAuthMethod('password'))
    expect(result.current).toBe('password')
  })

  it('without a server answer it falls back to what the phone remembered', async () => {
    await rememberAuthMethod('apple')
    const { result } = await renderHook(() => useAuthMethod(undefined))
    await waitFor(() => expect(result.current).toBe('apple'))
  })

  it('an answer that is not a method is ignored, never trusted', async () => {
    const { result } = await renderHook(() => useAuthMethod('facebook'))
    expect(result.current).toBeNull()
  })
})
