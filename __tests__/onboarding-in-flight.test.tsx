/**
 * One onboarding move at a time.
 *
 * A double-tapped Continue pushed the next step twice, and Skip tapped while a
 * save was in flight navigated once for the skip and again when the save
 * landed. `useOnboarding` now refuses a second commit, skip or finish while
 * one is running.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native'

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) } }))
jest.mock('../lib/logger', () => ({
  Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))
const mockUser = { id: 'u_1' }
jest.mock('../lib/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
  clearNewAccountFlag: jest.fn(),
  refreshAuthUser: jest.fn(),
}))
jest.mock('../lib/apiClient', () => ({ apiClient: { updateProfile: jest.fn() } }))
jest.mock('../lib/onboardingStorage', () => ({
  readOnboarding: jest.fn(async () => null),
  writeOnboarding: jest.fn(async () => undefined),
  clearOnboarding: jest.fn(async () => undefined),
}))
const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))

import { router } from 'expo-router'
import { apiClient } from '../lib/apiClient'
import { useOnboarding } from '../lib/useOnboarding'

const update = apiClient.updateProfile as jest.Mock

/** A save the test settles by hand, so a second tap can land while it is open. */
function deferred() {
  let resolve!: (value: { success: boolean }) => void
  const promise = new Promise<{ success: boolean }>((r) => (resolve = r))
  return { promise, resolve }
}

beforeEach(() => {
  jest.clearAllMocks()
  update.mockReset()
})

async function mounted(step: Parameters<typeof useOnboarding>[0]) {
  const hook = await renderHook(() => useOnboarding(step))
  await waitFor(() => expect(hook.result.current.loaded).toBe(true))
  return hook
}

it('pushes the next step once for a double-tapped Continue', async () => {
  const save = deferred()
  update.mockReturnValueOnce(save.promise)
  const { result } = await mounted('journey')

  let first!: Promise<boolean>
  let second!: Promise<boolean>
  await act(async () => {
    first = result.current.commit({ occupation: 'Designer' })
    second = result.current.commit({ occupation: 'Designer' })
  })
  expect(await second).toBe(false)

  await act(async () => {
    save.resolve({ success: true })
    await first
  })
  expect(await first).toBe(true)
  expect(update).toHaveBeenCalledTimes(1)
  expect(router.push).toHaveBeenCalledTimes(1)
})

it('ignores Skip while a save is in flight', async () => {
  const save = deferred()
  update.mockReturnValueOnce(save.promise)
  const { result } = await mounted('journey')

  let saving!: Promise<boolean>
  await act(async () => {
    saving = result.current.commit({ occupation: 'Designer' })
    await result.current.skip()
  })
  expect(router.push).not.toHaveBeenCalled()

  await act(async () => {
    save.resolve({ success: true })
    await saving
  })
  expect(router.push).toHaveBeenCalledTimes(1)
})

it('lets a failed save be retried', async () => {
  update.mockResolvedValueOnce({ success: false, error: 'Bad city' }).mockResolvedValueOnce({ success: true })
  const { result } = await mounted('journey')

  let outcome!: boolean
  await act(async () => {
    outcome = await result.current.commit({ occupation: 'Designer' })
  })
  expect(outcome).toBe(false)
  expect(mockShowToast).toHaveBeenCalledWith('Bad city', 'error')

  await act(async () => {
    outcome = await result.current.commit({ occupation: 'Designer' })
  })
  expect(outcome).toBe(true)
  expect(router.push).toHaveBeenCalledTimes(1)
})

it('finishes once, and stops spinning when the final save throws', async () => {
  update.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ success: true })
  const { result } = await mounted('ready')

  let outcome!: boolean
  await act(async () => {
    outcome = await result.current.finish()
  })
  expect(outcome).toBe(false)
  expect(result.current.saving).toBe(false)

  let a!: Promise<boolean>
  let b!: Promise<boolean>
  await act(async () => {
    a = result.current.finish()
    b = result.current.finish()
    await a
  })
  expect(await a).toBe(true)
  expect(await b).toBe(false)
  expect(update).toHaveBeenCalledTimes(2)
})
