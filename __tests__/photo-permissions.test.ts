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
 * decision — which prompt, which alert, which fallback — and a structural pin
 * on "calls requestCameraPermissionsAsync" would pass the old code too.
 */
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}))
const platform = { OS: 'ios' as 'ios' | 'android' }
jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Linking: { openSettings: jest.fn() },
  Platform: platform,
}))
jest.mock('../lib/queryCache', () => ({ queryCache: { invalidate: jest.fn() } }))
jest.mock('../lib/useAuth', () => ({ refreshAuthUser: jest.fn() }))
jest.mock('@react-native-async-storage/async-storage', () => ({}))
jest.mock('expo-file-system', () => ({}))
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { JPEG: 'jpeg' } }))
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))
jest.mock('../lib/logger', () => ({
  Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

import * as ImagePicker from 'expo-image-picker'
import { Alert, Linking } from 'react-native'
import { pickImage } from '../lib/photoUtils'

const picker = ImagePicker as jest.Mocked<typeof ImagePicker>
const alert = Alert.alert as jest.Mock
const picked = { canceled: false, assets: [{ uri: 'file:///p.jpg', width: 800, height: 800 }] }

/** Press the alert button whose label matches, as a person would. */
function pressAlertButton(label: string) {
  const buttons = alert.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[]
  const b = buttons.find((x) => x.text === label)
  if (!b) throw new Error(`no button ${label} in ${buttons.map((x) => x.text).join(', ')}`)
  b.onPress?.()
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
    expect(alert).not.toHaveBeenCalled()
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
    expect(alert).not.toHaveBeenCalled()
  })

  it('denied → offers the library, and "Choose from photos" opens it', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never)
    const p = pickImage('camera')
    await Promise.resolve()
    await Promise.resolve()
    expect(alert).toHaveBeenCalledWith('Camera access is off', expect.any(String), expect.any(Array))
    // The OS will ask again next time, so Settings is NOT offered here.
    expect((alert.mock.calls[0][2] as { text: string }[]).map((b) => b.text)).toEqual([
      'Choose from photos',
      'Cancel',
    ])
    pressAlertButton('Choose from photos')
    await expect(p).resolves.toBe(picked)
    expect(picker.launchImageLibraryAsync).toHaveBeenCalled()
  })

  it('blocked ("don\'t ask again") → offers Settings as well, and opens them', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false } as never)
    const p = pickImage('camera')
    await Promise.resolve()
    await Promise.resolve()
    expect((alert.mock.calls[0][2] as { text: string }[]).map((b) => b.text)).toEqual([
      'Open Settings',
      'Choose from photos',
      'Cancel',
    ])
    pressAlertButton('Open Settings')
    await expect(p).resolves.toBeNull()
    expect(Linking.openSettings).toHaveBeenCalled()
  })

  it('no camera on the device → the library is offered, not "Failed to pick image"', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true } as never)
    picker.launchCameraAsync.mockRejectedValue(new Error('MissingActivityToHandleIntent'))
    const p = pickImage('camera')
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(alert).toHaveBeenCalledWith('No camera here', expect.any(String), expect.any(Array))
    pressAlertButton('Choose from photos')
    await expect(p).resolves.toBe(picked)
  })

  it('cancelling the offer is a cancel, not an error', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never)
    const p = pickImage('camera')
    await Promise.resolve()
    await Promise.resolve()
    pressAlertButton('Cancel')
    await expect(p).resolves.toBeNull()
    expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled()
    expect(alert).toHaveBeenCalledTimes(1)
  })
})

describe('button order follows the platform that draws it', () => {
  /*
   * Android maps index 0 → neutral, 1 → negative, 2 → positive (bold, far
   * right) and ignores `style: 'cancel'`, so the iOS order
   * [action, action, Cancel] renders on Android with CANCEL as the bold
   * primary and the two actions swapped. Verified against
   * react-native/Libraries/Alert/Alert.js by the react pass.
   */
  afterEach(() => {
    platform.OS = 'ios'
  })

  it('on Android, Cancel is first (neutral) and the main action is last (positive)', async () => {
    platform.OS = 'android'
    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false } as never)
    const p = pickImage('camera')
    await Promise.resolve()
    await Promise.resolve()
    expect((alert.mock.calls[0][2] as { text: string }[]).map((b) => b.text)).toEqual([
      'Cancel',
      'Open Settings',
      'Choose from photos',
    ])
    pressAlertButton('Cancel')
    await expect(p).resolves.toBeNull()
  })

  it('on iOS, Cancel stays last', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false } as never)
    const p = pickImage('camera')
    await Promise.resolve()
    await Promise.resolve()
    expect((alert.mock.calls[0][2] as { text: string }[]).at(-1)?.text).toBe('Cancel')
    pressAlertButton('Cancel')
    await expect(p).resolves.toBeNull()
  })
})
