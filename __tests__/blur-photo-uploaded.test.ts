/**
 * A new primary photo goes up with its blurred copy (SCRUM-478).
 *
 * `createBlurDerivative` had no caller, so `blur_photo` was never sent and
 * `blurPhoto` was null for every real account: a viewer who has not identified
 * someone saw no picture where the design shows a blur. The server clears the
 * blur whenever `photos[0]` changes without a new one (SCRUM-476), so every
 * change of primary has to send one; a save that keeps the primary must not.
 */
jest.mock('expo-image-picker', () => ({}))
jest.mock('react-native', () => ({ Alert: { alert: jest.fn() }, Linking: {}, Platform: { OS: 'ios' } }))
jest.mock('@react-native-async-storage/async-storage', () => ({}))
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  FileSystemUploadType: { BINARY_CONTENT: 0 },
  downloadAsync: jest.fn(async (_url: string, to: string) => ({ uri: to, status: 200 })),
  uploadAsync: jest.fn(async () => ({ status: 200, body: '' })),
}))
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  manipulateAsync: jest.fn().mockResolvedValue({ uri: 'file:///blur.jpg' }),
}))
const BLUR_URL = 'https://blendn-media.fly.storage.tigris.dev/profile/u1/1-a-profile_blur.jpg'
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getPresignedUploadUrl: jest.fn(async () => ({
      success: true,
      data: { uploadUrl: 'https://upload.example/signed', publicUrl: BLUR_URL, key: 'profile/u1/1-a-profile_blur.jpg' },
    })),
    updateProfile: jest.fn(async () => ({ success: true })),
  },
}))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
jest.mock('../lib/queryCache', () => ({ queryCache: { invalidate: jest.fn() } }))
jest.mock('../lib/useAuth', () => ({ refreshAuthUser: jest.fn() }))

import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import { readFileSync } from 'fs'
import { join } from 'path'
import { apiClient } from '../lib/apiClient'
import { reorderPhotos } from '../lib/photoUtils'

const updateProfile = apiClient.updateProfile as jest.Mock
const download = FileSystem.downloadAsync as jest.Mock
const manipulate = ImageManipulator.manipulateAsync as jest.Mock

const OLD = 'https://blendn-media.fly.storage.tigris.dev/profile/u1/1-a-sealed'
const NEW = 'https://blendn-media.fly.storage.tigris.dev/profile/u1/2-b-profile_2.jpg'

beforeEach(() => jest.clearAllMocks())

it('a new primary is saved with the blurred copy made from it', async () => {
  expect(await reorderPhotos('u1', [NEW, OLD], OLD)).toEqual({ ok: true })

  expect(download).toHaveBeenCalledWith(NEW, expect.stringMatching(/^file:\/\/\/cache\//))
  // 40 px wide, the derivative the server's 4 KB ceiling is sized for.
  expect(manipulate.mock.calls[0][1]).toEqual([{ resize: { width: 40 } }])
  expect(updateProfile).toHaveBeenCalledWith('u1', { photos: [NEW, OLD], blur_photo: BLUR_URL })
})

it('the first photo of all is a new primary too', async () => {
  await reorderPhotos('u1', [NEW], null)
  expect(updateProfile).toHaveBeenCalledWith('u1', { photos: [NEW], blur_photo: BLUR_URL })
})

it('a save that keeps the primary sends no blur, and makes none', async () => {
  await reorderPhotos('u1', [OLD, NEW], OLD)
  expect(download).not.toHaveBeenCalled()
  expect(updateProfile).toHaveBeenCalledWith('u1', { photos: [OLD, NEW] })
})

it('removing the last photo sends no blur', async () => {
  await reorderPhotos('u1', [], OLD)
  expect(updateProfile).toHaveBeenCalledWith('u1', { photos: [] })
})

it('a blur that cannot be made does not stop the photos saving; the server then clears the old one', async () => {
  manipulate.mockRejectedValueOnce(new Error('decode failed'))
  expect(await reorderPhotos('u1', [NEW, OLD], OLD)).toEqual({ ok: true })
  expect(updateProfile).toHaveBeenCalledWith('u1', { photos: [NEW, OLD] })
})

it('a save hands back the URLs the server stored, which PhotoManager keeps (SCRUM-489)', async () => {
  const stored = ['https://blendn-media.fly.storage.tigris.dev/profile/u1/9-z-sealed', OLD]
  updateProfile.mockResolvedValueOnce({ success: true, data: { profile: { photos: stored } } })
  expect(await reorderPhotos('u1', [OLD, NEW], OLD)).toEqual({ ok: true, photos: stored })
  const manager = readFileSync(join(__dirname, '../components/PhotoManager.tsx'), 'utf8')
  // add, make main, remove: each success takes the stored list.
  expect(manager.match(/adoptStoredUrls\(prev, saved\.photos\)/g)).toHaveLength(3)
})

it('every PhotoManager save says what the primary was, and onboarding blurs its first photo', () => {
  const manager = readFileSync(join(__dirname, '../components/PhotoManager.tsx'), 'utf8')
  const calls = manager.split('\n').filter((l) => l.includes('reorderPhotos('))
  expect(calls.length).toBeGreaterThan(0)
  for (const line of calls) expect(line).toMatch(/photos\[0\]\?\.url\)\s*$/)
  const onboarding = readFileSync(join(__dirname, '../lib/useOnboarding.ts'), 'utf8')
  expect(onboarding).toContain('withBlurForPrimary(')
})
