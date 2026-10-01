/**
 * Onboarding finishes when someone added a photo (SCRUM-491), and says so
 * where it can be seen when it does not (SCRUM-492).
 *
 * The photos step sent the upload's URL; the server stored its own sealed copy
 * and deleted the upload (SCRUM-425). The draft kept the upload's URL, and
 * `finish()` re-sends the draft — so the last write named a photo that no
 * longer existed, the server refused it, and "Start Blend'n" did nothing.
 * Driven on the iOS sim against staging, 2026-10-01: qa.sk0924a.45 could not
 * finish; `profiles.onboarded` stayed false.
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
// The photos step's blur needs native image modules; what it adds is pinned in blur-photo-uploaded.
jest.mock('../lib/photoUtils', () => ({ withBlurForPrimary: jest.fn(async (body: object) => body) }))
jest.mock('../lib/onboardingStorage', () => ({
  readOnboarding: jest.fn(async () => null),
  writeOnboarding: jest.fn(async () => undefined),
  clearOnboarding: jest.fn(async () => undefined),
}))
const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))

import { apiClient } from '../lib/apiClient'
import type { OnboardingStep } from '../lib/onboarding'
import { clearOnboarding, readOnboarding, writeOnboarding } from '../lib/onboardingStorage'
import { useOnboarding } from '../lib/useOnboarding'

const update = apiClient.updateProfile as jest.Mock
const read = readOnboarding as jest.Mock
const write = writeOnboarding as jest.Mock

const UPLOAD = 'https://media.example/profile/u_1/1790846575859-7w473i-profile_1.jpg'
const UPLOAD_2 = 'https://media.example/profile/u_1/1790846575999-k2p1aa-profile_2.jpg'
const SEALED = 'https://media.example/profile/u_1/1790846661493-rbjp8j-sealed'
const SEALED_2 = 'https://media.example/profile/u_1/1790846661600-q8c0zz-sealed'
const ALL_BEFORE_READY: OnboardingStep[] = ['basics', 'notifications', 'location', 'preferences', 'journey', 'details', 'media']

beforeEach(() => {
  jest.clearAllMocks()
  update.mockReset()
  read.mockResolvedValue(null)
})

async function mounted(step: OnboardingStep) {
  const hook = await renderHook(() => useOnboarding(step))
  await waitFor(() => expect(hook.result.current.loaded).toBe(true))
  return hook
}

describe('the photos step keeps what the server stored', () => {
  it('takes the stored list in place of the uploads it sealed and deleted', async () => {
    update.mockResolvedValueOnce({ success: true, data: { profile: { photos: [SEALED, SEALED_2] } } })
    const { result } = await mounted('media')

    await act(async () => {
      await result.current.commit({ photos: [SEALED, UPLOAD_2] })
    })

    expect(update).toHaveBeenCalledWith('u_1', { photos: [SEALED, UPLOAD_2] })
    expect(result.current.draft.photos).toEqual([SEALED, SEALED_2])
    // What the next launch, and the ready step, read back.
    expect(write.mock.calls.at(-1)?.[1].draft.photos).toEqual([SEALED, SEALED_2])
  })

  it('keeps what it sent when the reply carries no stored list', async () => {
    update.mockResolvedValueOnce({ success: true })
    const { result } = await mounted('media')

    await act(async () => {
      await result.current.commit({ photos: [UPLOAD] })
    })

    expect(result.current.draft.photos).toEqual([UPLOAD])
  })

  it('leaves the photos alone on a step that did not send them', async () => {
    // Every PUT answers with the whole profile; only the photos step's answer is about photos.
    read.mockResolvedValue({ progress: { step: 'basics', completed: [] }, draft: { photos: [UPLOAD] } })
    update.mockResolvedValueOnce({ success: true, data: { profile: { photos: [] } } })
    const { result } = await mounted('basics')

    await act(async () => {
      await result.current.commit({ name: 'Qa Fortyfive' })
    })

    expect(result.current.draft.photos).toEqual([UPLOAD])
  })
})

describe('finishing', () => {
  it('sends the stored photos it saved, and finishes', async () => {
    update
      .mockResolvedValueOnce({ success: true, data: { profile: { photos: [SEALED] } } })
      .mockResolvedValueOnce({ success: true })
    const media = await mounted('media')
    await act(async () => {
      await media.result.current.commit({ photos: [UPLOAD] })
    })

    const saved = write.mock.calls.at(-1)?.[1]
    read.mockResolvedValue(saved)
    const ready = await mounted('ready')
    let outcome!: boolean
    await act(async () => {
      outcome = await ready.result.current.finish()
    })

    expect(outcome).toBe(true)
    expect(update.mock.calls[1][1]).toMatchObject({ photos: [SEALED], onboarded: true })
  })

  it('still sends photos whose save failed and were skipped past', async () => {
    // Skip marks the step completed too, so "completed" is not "saved":
    // finish is the backstop for exactly this.
    read.mockResolvedValue({ progress: { step: 'ready', completed: ALL_BEFORE_READY }, draft: { photos: [UPLOAD] } })
    update.mockResolvedValueOnce({ success: true })
    const { result } = await mounted('ready')

    await act(async () => {
      await result.current.finish()
    })

    expect(update.mock.calls[0][1]).toMatchObject({ photos: [UPLOAD], onboarded: true })
  })

  it('says why it failed, in a toast, with the server sentence, and stays', async () => {
    update.mockResolvedValueOnce({ success: false, error: 'That photo did not finish uploading' })
    const { result } = await mounted('ready')

    let outcome!: boolean
    await act(async () => {
      outcome = await result.current.finish()
    })

    expect(outcome).toBe(false)
    expect(mockShowToast).toHaveBeenCalledWith('That photo did not finish uploading', 'error')
    expect(clearOnboarding).not.toHaveBeenCalled()
  })

  it('says it in its own words when the server gave none', async () => {
    update.mockResolvedValueOnce({ success: false })
    const { result } = await mounted('ready')

    await act(async () => {
      await result.current.finish()
    })

    expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/could not finish setting up your profile/i), 'error')
  })

  it('says so when it throws, and not for a second tap that was refused', async () => {
    let fail!: (error: Error) => void
    update.mockReturnValueOnce(new Promise((_, reject) => (fail = reject)))
    const { result } = await mounted('ready')

    let first!: Promise<boolean>
    await act(async () => {
      first = result.current.finish()
      expect(await result.current.finish()).toBe(false)
    })
    expect(mockShowToast).not.toHaveBeenCalled()

    await act(async () => {
      fail(new Error('offline'))
      await first
    })
    expect(await first).toBe(false)
    expect(mockShowToast).toHaveBeenCalledTimes(1)
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/could not finish setting up your profile/i), 'error')
  })
})
