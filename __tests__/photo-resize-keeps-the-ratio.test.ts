/**
 * processImage never passes both width and height.
 *
 * expo-image-manipulator keeps the ratio when ONE dimension is given and
 * stretches to fit when both are. The shipped 800×800 squashed every photo
 * that reached it without the OS crop -- which, with the crop now gone from
 * the picker, would have been every photo.
 */
jest.mock('expo-image-picker', () => ({}))
jest.mock('react-native', () => ({ Alert: { alert: jest.fn() }, Linking: {}, Platform: { OS: 'ios' } }))
jest.mock('@react-native-async-storage/async-storage', () => ({}))
jest.mock('expo-file-system', () => ({}))
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  manipulateAsync: jest.fn().mockResolvedValue({ uri: 'file:///out.jpg' }),
}))
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
jest.mock('../lib/queryCache', () => ({ queryCache: { invalidate: jest.fn() } }))
jest.mock('../lib/useAuth', () => ({ refreshAuthUser: jest.fn() }))

import * as ImageManipulator from 'expo-image-manipulator'
import { createBlurDerivative, processImage } from '../lib/photoUtils'

const manipulate = ImageManipulator.manipulateAsync as jest.Mock

beforeEach(() => manipulate.mockClear())

it('the default upload resizes by width only, 1080 wide', async () => {
  await processImage('file:///in.jpg')
  expect(manipulate).toHaveBeenCalledWith('file:///in.jpg', [{ resize: { width: 1080 } }], expect.anything())
})

it('a caller asking for a height gets a height, never both', async () => {
  await processImage('file:///in.jpg', { height: 600 })
  expect(manipulate).toHaveBeenCalledWith('file:///in.jpg', [{ resize: { height: 600 } }], expect.anything())
})

it('the blur derivative keeps the photo shape too', async () => {
  await createBlurDerivative('file:///in.jpg')
  const [, actions] = manipulate.mock.calls[0]
  expect(actions[0].resize).not.toHaveProperty('height')
})
