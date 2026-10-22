/**
 * The photo path with its reposition step (Flow 6 · 6.3 #08): source sheet, picker, size check, then drag and pinch, then
 * crop. Against a mocked picker and manipulator, because every branch is a decision: Use photo crops what the frame
 * holds, Choose another is the source sheet again, closing is a cancel, and a screen with nowhere to ask carries on with the
 * photo as it was picked.
 */
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}))
jest.mock('react-native', () => ({ Linking: { openSettings: jest.fn() }, Platform: { OS: 'ios' } }))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn(), sheetClosed: jest.fn(async () => undefined) }))
jest.mock('../lib/toast', () => ({ toast: jest.fn() }))
jest.mock('../lib/queryCache', () => ({ queryCache: { invalidate: jest.fn() } }))
jest.mock('../lib/useAuth', () => ({ refreshAuthUser: jest.fn() }))
jest.mock('@react-native-async-storage/async-storage', () => ({}))
jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: jest.fn(async () => ({ exists: true, size: 900000 })), deleteAsync: jest.fn(async () => undefined) }))
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { JPEG: 'jpeg' }, manipulateAsync: jest.fn() }))
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { FIT_LONG_SIDE, fitResize, selectPhoto, validatePhoto } from '../lib/photoUtils'
import { renderHook, waitFor } from '@testing-library/react-native'
import { mountRepositionHost, requestReposition, settleReposition, usePendingReposition } from '../lib/photoReposition'
import { showSheet, type ActionSheet } from '../lib/sheet'

const picker = ImagePicker as jest.Mocked<typeof ImagePicker>
const manipulate = ImageManipulator.manipulateAsync as jest.Mock
const sheet = showSheet as jest.Mock

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}
/** The source sheet, answered "Choose from library". */
const chooseLibrary = async () => {
  await flush()
  const s = sheet.mock.calls.at(-1)?.[0] as ActionSheet
  const action = s.actions.find((a) => a.label === 'Choose from library')
  if (!action || !('then' in action)) throw new Error('no library button')
  action.then()
  await flush()
}
const picked = { canceled: false, assets: [{ uri: 'file:///picked.jpg', width: 4000, height: 3000 }] }
const RECT = { originX: 100, originY: 0, width: 2300, height: 3000 }

beforeEach(() => {
  jest.clearAllMocks()
  picker.launchImageLibraryAsync.mockResolvedValue(picked as never)
  manipulate.mockImplementation(async (uri: string, actions: { crop?: unknown }[]) =>
    actions.some((a) => a.crop) ? { uri: 'file:///cropped.jpg', width: 2300, height: 3000 } : { uri: 'file:///fitted.jpg', width: 4000, height: 3000 }
  )
})

describe('Use photo', () => {
  it('crops the re-encoded file to what the frame held, and goes on with the crop', async () => {
    const unmount = mountRepositionHost()
    const selecting = selectPhoto()
    await chooseLibrary()
    // The step was asked, about the file the manipulator decoded (its size, not the picker's).
    settleReposition({ kind: 'use', rect: RECT })
    await expect(selecting).resolves.toEqual({ ok: true, uri: 'file:///cropped.jpg' })
    // 4000 × 3000 is over the cap on its long side: the copy the step works on is brought down, ratio kept.
    expect(manipulate).toHaveBeenNthCalledWith(1, 'file:///picked.jpg', [{ resize: { width: FIT_LONG_SIDE } }], expect.objectContaining({ format: 'jpeg' }))
    expect(manipulate).toHaveBeenNthCalledWith(2, 'file:///fitted.jpg', [{ crop: RECT }], expect.objectContaining({ format: 'jpeg' }))
    unmount()
  })

  it('a crop that fails goes on with the re-encoded photo, never stops the add', async () => {
    const unmount = mountRepositionHost()
    const selecting = selectPhoto()
    await chooseLibrary()
    manipulate.mockRejectedValueOnce(new Error('crop failed'))
    settleReposition({ kind: 'use', rect: RECT })
    await expect(selecting).resolves.toEqual({ ok: true, uri: 'file:///fitted.jpg' })
    unmount()
  })
})

describe('the copy the step works on (M1)', () => {
  it('is at most 2560 on its long side: a 48 MP original is not decoded at full size', () => {
    expect(fitResize(8000, 6000)).toEqual([{ resize: { width: 2560 } }])
    expect(fitResize(6000, 8000)).toEqual([{ resize: { height: 2560 } }])
  })

  it('a photo already inside it is re-encoded as it is (no resize, no upscale)', () => {
    expect(fitResize(2560, 1920)).toEqual([])
    expect(fitResize(1080, 1440)).toEqual([])
  })
})

describe('the temporary copy (LOW)', () => {
  const deleted = () => (FileSystem.deleteAsync as jest.Mock).mock.calls.map((c) => c[0])

  it('is deleted once the crop is made, and the crop (which goes on to be uploaded) is not', async () => {
    const unmount = mountRepositionHost()
    const selecting = selectPhoto()
    await chooseLibrary()
    settleReposition({ kind: 'use', rect: RECT })
    await selecting
    expect(deleted()).toEqual(['file:///fitted.jpg'])
    unmount()
  })

  it.each(['cancel', 'again'] as const)('is deleted when the person chooses %s', async (kind) => {
    const unmount = mountRepositionHost()
    const selecting = selectPhoto()
    await chooseLibrary()
    settleReposition({ kind })
    if (kind === 'again') {
      await chooseLibrary()
      settleReposition({ kind: 'cancel' })
    }
    await selecting
    expect(deleted()).toContain('file:///fitted.jpg')
    unmount()
  })

  it('stays when the crop failed: it is the file that goes on', async () => {
    const unmount = mountRepositionHost()
    const selecting = selectPhoto()
    await chooseLibrary()
    manipulate.mockRejectedValueOnce(new Error('crop failed'))
    settleReposition({ kind: 'use', rect: RECT })
    await selecting
    expect(deleted()).toEqual([])
    unmount()
  })
})

describe('which photo is the main one (LOW)', () => {
  it.each([[true], [false]])('the step is told main=%s by the screen adding the photo', async (main) => {
    const unmount = mountRepositionHost()
    const { result } = await renderHook(() => usePendingReposition())
    const selecting = selectPhoto({ main })
    await chooseLibrary()
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current?.main).toBe(main)
    settleReposition({ kind: 'cancel' })
    await selecting
    unmount()
  })

  it('a photo added without saying is the main one: the caption claims nothing less', async () => {
    const unmount = mountRepositionHost()
    const { result } = await renderHook(() => usePendingReposition())
    const selecting = selectPhoto()
    await chooseLibrary()
    await waitFor(() => expect(result.current?.main).toBe(true))
    settleReposition({ kind: 'cancel' })
    await selecting
    unmount()
  })
})

describe('Choose another', () => {
  it('is the source sheet again, and the next photo goes through the step too', async () => {
    const unmount = mountRepositionHost()
    const selecting = selectPhoto()
    await chooseLibrary()
    settleReposition({ kind: 'again' })
    await chooseLibrary()
    expect(sheet).toHaveBeenCalledTimes(2)
    settleReposition({ kind: 'use', rect: RECT })
    await expect(selecting).resolves.toEqual({ ok: true, uri: 'file:///cropped.jpg' })
    unmount()
  })
})

describe('closing the step', () => {
  it('is a cancel, not an error: nothing is said to the person', async () => {
    const unmount = mountRepositionHost()
    const selecting = selectPhoto()
    await chooseLibrary()
    settleReposition({ kind: 'cancel' })
    await expect(selecting).resolves.toEqual({ ok: false, cancelled: true, error: 'No image selected' })
    unmount()
  })
})

describe('a screen with nowhere to ask', () => {
  it('carries on with the photo as picked, and re-encodes nothing', async () => {
    const selecting = selectPhoto()
    await chooseLibrary()
    await expect(selecting).resolves.toEqual({ ok: true, uri: 'file:///picked.jpg' })
    expect(manipulate).not.toHaveBeenCalled()
  })

  it('a photo that cannot be re-encoded is added as picked, the step never blocks it', async () => {
    const unmount = mountRepositionHost()
    manipulate.mockRejectedValueOnce(new Error('decode failed'))
    const selecting = selectPhoto()
    await chooseLibrary()
    await expect(selecting).resolves.toEqual({ ok: true, uri: 'file:///picked.jpg' })
    unmount()
  })
})

describe('what is refused before the step', () => {
  it('a photo under 200 × 200 says so, in the frame’s words, and is never shown the step', async () => {
    const unmount = mountRepositionHost()
    picker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///tiny.jpg', width: 150, height: 150 }] } as never)
    const selecting = selectPhoto()
    await chooseLibrary()
    await expect(selecting).resolves.toEqual({ ok: false, error: 'Photo must be at least 200 × 200 pixels.' })
    expect(manipulate).not.toHaveBeenCalled()
    unmount()
  })

  it('validatePhoto: exactly 200 × 200 is enough', () => {
    expect(validatePhoto({ uri: 'x', width: 200, height: 200 } as never)).toEqual({ valid: true })
    expect(validatePhoto({ uri: 'x', width: 199, height: 400 } as never).valid).toBe(false)
  })
})

it('requestReposition is what the step answers (the host owns the screen)', async () => {
  const unmount = mountRepositionHost()
  const asked = requestReposition({ uri: 'file:///a.jpg', width: 10, height: 10 })
  settleReposition({ kind: 'cancel' })
  await expect(asked).resolves.toEqual({ kind: 'cancel' })
  unmount()
})
