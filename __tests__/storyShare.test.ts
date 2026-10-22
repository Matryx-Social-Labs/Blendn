/*
 * Getting a Story to Instagram (Flow 16 · 16.3): the link is copied first, then the picture goes to the share sheet;
 * a build without the capture module degrades to Instagram's camera with the link copied, never to a crash.
 */
const mockSetString = jest.fn()
const mockToast = jest.fn()
const mockOpenURL = jest.fn()
const mockShareAsync = jest.fn()
const mockIsAvailable = jest.fn()
const mockCaptureRef = jest.fn()
jest.mock('expo-clipboard', () => ({ setStringAsync: (...a: unknown[]) => mockSetString(...a) }))
jest.mock('expo-image', () => ({ Image: { prefetch: jest.fn(async () => true) } }))
jest.mock('expo-sharing', () => ({ isAvailableAsync: () => mockIsAvailable(), shareAsync: (...a: unknown[]) => mockShareAsync(...a) }))
jest.mock('react-native-view-shot', () => ({ captureRef: (...a: unknown[]) => mockCaptureRef(...a) }))
jest.mock('../lib/toast', () => ({ toast: (...a: unknown[]) => mockToast(...a) }))
jest.mock('../lib/logger', () => ({ Logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn(), info: jest.fn() } }))

import { Linking, PixelRatio, Platform } from 'react-native'

import { coverReady, shareStory, STORY_LINK_COPIED, storyCaptureWidth } from '../lib/storyShare'

const URL = 'https://www.blendn.app/e/abc'

beforeEach(() => {
  jest.restoreAllMocks()
  mockSetString.mockReset().mockResolvedValue(true)
  mockToast.mockReset()
  mockShareAsync.mockReset().mockResolvedValue(undefined)
  mockIsAvailable.mockReset().mockResolvedValue(true)
  mockCaptureRef.mockReset().mockResolvedValue('file:///cache/story.png')
  mockOpenURL.mockReset().mockResolvedValue(undefined)
  jest.spyOn(Linking, 'openURL').mockImplementation(mockOpenURL)
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
})

describe('the picture', () => {
  it('is exactly 1080 device pixels across, whatever the phone', () => {
    jest.spyOn(PixelRatio, 'get').mockReturnValue(3)
    expect(storyCaptureWidth()).toBe(360)
    jest.spyOn(PixelRatio, 'get').mockReturnValue(2.625)
    expect(storyCaptureWidth() * 2.625).toBeCloseTo(1080)
  })

  it('waits for the cover to be cached and painted, and for nothing when there is none', async () => {
    jest.useFakeTimers()
    const done = jest.fn()
    void coverReady('https://img/c.jpg').then(done)
    await jest.advanceTimersByTimeAsync(300)
    expect(done).toHaveBeenCalled()
    const none = jest.fn()
    void coverReady(null).then(none)
    await jest.advanceTimersByTimeAsync(0)
    expect(none).toHaveBeenCalled()
    jest.useRealTimers()
  })
})

describe('sharing a Story', () => {
  it('copies the link first, says so, then hands the picture to the share sheet as a PNG', async () => {
    const capture = jest.fn().mockResolvedValue('file:///cache/story.png')
    await expect(shareStory({ url: URL, capture })).resolves.toBe('image')
    expect(mockSetString).toHaveBeenCalledWith(URL)
    expect(mockToast).toHaveBeenCalledWith(STORY_LINK_COPIED, 'success')
    expect(mockSetString.mock.invocationCallOrder[0]).toBeLessThan(capture.mock.invocationCallOrder[0])
    expect(mockShareAsync).toHaveBeenCalledWith('file:///cache/story.png', expect.objectContaining({ mimeType: 'image/png' }))
  })

  it('has no link to copy for the recap, and shares the picture all the same', async () => {
    await expect(shareStory({ capture: async () => 'file:///r.png' })).resolves.toBe('image')
    expect(mockSetString).not.toHaveBeenCalled()
    expect(mockToast).not.toHaveBeenCalled()
  })

  it('stops, and says so, when the link cannot be copied: no picture goes out without its link', async () => {
    mockSetString.mockRejectedValue(new Error('no clipboard'))
    const capture = jest.fn()
    await expect(shareStory({ url: URL, capture })).resolves.toBe('failed')
    expect(capture).not.toHaveBeenCalled()
    expect(mockToast).toHaveBeenCalledWith("Couldn't copy the link. Try again.", 'error')
  })

  it("opens Instagram's Story camera with the link copied when the picture cannot be made", async () => {
    await expect(shareStory({ url: URL, capture: async () => Promise.reject(new Error('no module')) })).resolves.toBe('link')
    expect(mockOpenURL).toHaveBeenCalledWith('instagram-stories://share')
    expect(mockToast).toHaveBeenLastCalledWith("Couldn't make the picture. The link is copied; add it with the Link sticker.", 'info')
  })

  it('does the same when the share sheet is not available, and uses the Android camera link there', async () => {
    mockIsAvailable.mockResolvedValue(false)
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
    await expect(shareStory({ url: URL, capture: async () => 'file:///x.png' })).resolves.toBe('link')
    expect(mockOpenURL).toHaveBeenCalledWith('instagram://story-camera')
  })

  it('says Instagram did not open when neither the picture nor the camera could', async () => {
    mockOpenURL.mockRejectedValue(new Error('no instagram'))
    await expect(shareStory({ url: URL, capture: async () => Promise.reject(new Error('x')) })).resolves.toBe('failed')
    expect(mockToast).toHaveBeenLastCalledWith("Instagram didn't open. The link is copied.", 'error')
  })
})
