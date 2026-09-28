/**
 * Only the permission the source needs — and the library needs none.
 *
 * Testers on Android: choosing "Photo Library" asked for the CAMERA, and
 * declining it meant no photo could be added at all. The helper asked for both
 * permissions for either source and refused on `||`. On Android 13+ the
 * library permission set is empty and on iOS the picker has no permission
 * guard, so the camera prompt was the only prompt a library pick produced.
 *
 * Behavioural against a mocked picker, because every branch here is a
 * decision — which prompt, which sheet, which fallback — and a structural pin
 * on "calls requestCameraPermissionsAsync" would pass the old code too.
 *
 * The choices are the app's own sheet (`lib/sheet.ts`), not `Alert.alert`:
 * the sheet draws every option in the order given on both platforms, so the
 * per-platform button ordering these tests used to pin is gone with it.
 */
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}))
jest.mock('react-native', () => ({
  Linking: { openSettings: jest.fn() },
  Platform: { OS: 'ios' },
}))
jest.mock('../lib/sheet', () => ({
  showSheet: jest.fn(),
  // Resolves at once here; on a phone it waits out the sheet's fade.
  sheetClosed: jest.fn(async () => undefined),
}))
jest.mock('../lib/toast', () => ({ toast: jest.fn() }))
jest.mock('../lib/queryCache', () => ({ queryCache: { invalidate: jest.fn() } }))
jest.mock('../lib/useAuth', () => ({ refreshAuthUser: jest.fn() }))
jest.mock('@react-native-async-storage/async-storage', () => ({}))
jest.mock('expo-file-system/legacy', () => ({}))
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { JPEG: 'jpeg' } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { updateProfile: jest.fn() } }))
jest.mock('../lib/logger', () => ({
  Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

import * as ImagePicker from 'expo-image-picker'
import { Linking } from 'react-native'
import { pickImage, reorderPhotos, showPhotoSourceActionSheet } from '../lib/photoUtils'
import { apiClient } from '../lib/apiClient'
import { queryCache } from '../lib/queryCache'
import { showSheet, type ActionSheet } from '../lib/sheet'
import { toast } from '../lib/toast'
import { refreshAuthUser } from '../lib/useAuth'

const picker = ImagePicker as jest.Mocked<typeof ImagePicker>
const sheet = showSheet as jest.Mock
const picked = { canceled: false, assets: [{ uri: 'file:///p.jpg', width: 800, height: 800 }] }

const lastSheet = () => sheet.mock.calls.at(-1)?.[0] as ActionSheet
const labels = () => lastSheet().actions.map((a) => a.label)
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

/** Tap the sheet's button whose label matches, as a person would. */
function press(label: string) {
  const action = lastSheet().actions.find((a) => a.label === label)
  if (!action) throw new Error(`no button ${label} in ${labels().join(', ')}`)
  if ('then' in action) action.then()
  else if ('cancel' in action) lastSheet().onDismiss?.()
}

beforeEach(() => {
  jest.clearAllMocks()
  picker.launchImageLibraryAsync.mockResolvedValue(picked as never)
  picker.launchCameraAsync.mockResolvedValue(picked as never)
})

describe('the library never asks for a permission', () => {
  it('opens the picker directly, prompting for nothing', async () => {
    await expect(pickImage('library')).resolves.toBe(picked)
    expect(picker.requestCameraPermissionsAsync).not.toHaveBeenCalled()
    expect(picker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled()
    expect(sheet).not.toHaveBeenCalled()
  })

  it('asks the picker for images by the non-deprecated name, with no OS-level crop', async () => {
    /*
     * `allowsEditing: true` + `aspect: [1,1]` was two products: a full-screen
     * cropper on Android, the legacy picker's small "Move and Scale" on iOS
     * (which also dropped the privacy picker). And the square it forced is
     * the wrong shape for the tall profile hero. Cropping is per surface at
     * render, via contentFit="cover"; the picker just picks.
     */
    await pickImage('library')
    const opts = picker.launchImageLibraryAsync.mock.calls[0][0] as Record<string, unknown>
    expect(opts.mediaTypes).toEqual(['images'])
    expect(opts.allowsEditing).toBe(false)
    expect(opts).not.toHaveProperty('aspect')
  })
})

describe('the camera asks for the camera and nothing else', () => {
  it('granted → the camera opens, no library prompt', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true } as never)
    await expect(pickImage('camera')).resolves.toBe(picked)
    expect(picker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled()
    expect(sheet).not.toHaveBeenCalled()
  })

  it('denied → offers the library, and "Choose from photos" opens it', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never)
    const p = pickImage('camera')
    await flush()
    expect(lastSheet().title).toBe('Camera access is off')
    // The OS will ask again next time, so Settings is NOT offered here.
    expect(labels()).toEqual(['Choose from photos', 'Cancel'])
    // The library is the sheet's one primary: it is what they came for.
    expect(lastSheet().actions[0].variant).toBe('primary')
    press('Choose from photos')
    await expect(p).resolves.toBe(picked)
    expect(picker.launchImageLibraryAsync).toHaveBeenCalled()
  })

  it('blocked ("don\'t ask again") → offers Settings as well, and opens them', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false } as never)
    const p = pickImage('camera')
    await flush()
    expect(labels()).toEqual(['Choose from photos', 'Open Settings', 'Cancel'])
    press('Open Settings')
    await expect(p).resolves.toBeNull()
    expect(Linking.openSettings).toHaveBeenCalled()
  })

  it('no camera on the device → the library is offered, not "Failed to pick image"', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true } as never)
    picker.launchCameraAsync.mockRejectedValue(new Error('MissingActivityToHandleIntent'))
    const p = pickImage('camera')
    await flush()
    expect(lastSheet().title).toBe('No camera here')
    press('Choose from photos')
    await expect(p).resolves.toBe(picked)
  })

  it('cancelling the offer is a cancel, not an error', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never)
    const p = pickImage('camera')
    await flush()
    press('Cancel')
    await expect(p).resolves.toBeNull()
    expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled()
    expect(sheet).toHaveBeenCalledTimes(1)
  })

  it('swiping the sheet away is a cancel too, not a promise left pending', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never)
    const p = pickImage('camera')
    await flush()
    lastSheet().onDismiss?.()
    await expect(p).resolves.toBeNull()
  })
})

describe('the source sheet', () => {
  it('offers the camera and the library, and resolves to the choice', async () => {
    const p = showPhotoSourceActionSheet()
    expect(lastSheet().title).toBe('Add a photo')
    expect(labels()).toEqual(['Take a photo', 'Choose from library', 'Cancel'])
    press('Choose from library')
    await expect(p).resolves.toBe('library')
  })

  it('Cancel resolves null', async () => {
    const p = showPhotoSourceActionSheet()
    press('Cancel')
    await expect(p).resolves.toBeNull()
  })
})

describe('a library that will not open', () => {
  it('says so in a toast, not an alert', async () => {
    picker.launchImageLibraryAsync.mockRejectedValue(new Error('boom'))
    await expect(pickImage('library')).resolves.toBeNull()
    expect(toast).toHaveBeenCalledWith("Your photos didn't open. Try again.", 'error')
  })
})



describe('reorderPhotos tells the rest of the app the photos changed', () => {
  /*
   * The Me tab caches its view model under `profile_<id>` and refetches on
   * focus only when it is gone, and `user.image` mirrors photos[0]. Both
   * followed the write once; the make-primary bug was that neither did.
   */
  const api = apiClient as jest.Mocked<typeof apiClient>

  it('on success: invalidates the profile cache and refreshes the auth user', async () => {
    api.updateProfile.mockResolvedValue({ success: true, data: {} } as never)
    await expect(reorderPhotos('u1', ['https://cdn/b.jpg', 'https://cdn/a.jpg'])).resolves.toEqual({ ok: true })
    expect(queryCache.invalidate).toHaveBeenCalledWith('profile_u1')
    expect(refreshAuthUser).toHaveBeenCalledTimes(1)
  })

  it("on refusal: returns the server's sentence and touches neither", async () => {
    api.updateProfile.mockResolvedValue({ success: false, error: 'That looks like a blank image.' } as never)
    await expect(reorderPhotos('u1', ['https://cdn/x.jpg'])).resolves.toEqual({ ok: false, error: 'That looks like a blank image.' })
    expect(queryCache.invalidate).not.toHaveBeenCalled()
    expect(refreshAuthUser).not.toHaveBeenCalled()
  })
})
