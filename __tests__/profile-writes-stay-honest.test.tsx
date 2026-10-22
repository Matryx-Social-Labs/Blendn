/**
 * Profile writes say what actually happened.
 *
 * Three findings from the silent-failure and react passes over the profile
 * surface, each a write whose result was thrown away:
 *  - PhotoManager appended a tile and logged "Photo added" whether or not the
 *    profile write held, so the photo vanished on the next load;
 *  - PhotoManager deleted the storage object even when the profile still
 *    listed the URL, leaving a broken image on every screen;
 *  - signOut() reported success when the server never confirmed, so the
 *    Settings error branch could never fire.
 *
 * Behavioural, against mocked helpers, because each is a branch a structural
 * pin would certify by name alone.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

jest.mock('../lib/photoUtils', () => ({
  selectAndUploadPhoto: jest.fn(),
  reorderPhotos: jest.fn(),
  deletePhoto: jest.fn(),
  loadUserPhotos: jest.fn(),
  loadPulledPhotos: jest.fn(async () => []),
  uploadPhoto: jest.fn(),
  cachePhoto: jest.fn().mockResolvedValue(null),
}))
jest.mock('../lib/logger', () => ({
  Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))
const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
jest.mock('../components/OptimizedImage', () => {
  // A stand-in that keeps the accessibility name, which is what the tests read.
  const React = require('react')
  const { View } = require('react-native')
  return {
    OptimizedImage: (p: { accessibilityLabel?: string }) =>
      React.createElement(View, { accessible: true, accessibilityLabel: p.accessibilityLabel }),
  }
})

import * as photoUtils from '../lib/photoUtils'
import { showSheet } from '../lib/sheet'
import PhotoManager from '../components/PhotoManager'

const pu = photoUtils as jest.Mocked<typeof photoUtils>

beforeEach(() => {
  jest.clearAllMocks()
  pu.loadUserPhotos.mockResolvedValue([
    { id: 'u_0', url: 'https://cdn/a.jpg', order: 0, isPrimary: true },
    { id: 'u_1', url: 'https://cdn/b.jpg', order: 1, isPrimary: false },
  ])
})

describe('adding a photo', () => {
  it('drops the tile and says so when the profile write fails after the upload', async () => {
    pu.selectAndUploadPhoto.mockResolvedValue({ success: true, url: 'https://cdn/c.jpg' })
    pu.reorderPhotos.mockResolvedValue({ ok: false, error: 'That looks like a blank image. Pick a photo of yourself.' })

    await render(<PhotoManager userId="u" />)
    await screen.findByLabelText('Add photo')
    await fireEvent.press(screen.getByLabelText('Add photo'))

    await waitFor(() => expect(pu.reorderPhotos).toHaveBeenCalledWith('u', ['https://cdn/a.jpg', 'https://cdn/b.jpg', 'https://cdn/c.jpg'], 'https://cdn/a.jpg'))
    // The server's own sentence, not a generic retry.
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('That looks like a blank image. Pick a photo of yourself.', 'error', { haptic: 'error' }))
    // Two tiles, not three: the one the server does not have is not shown.
    expect(screen.getAllByLabelText(/^Photo \d of/)).toHaveLength(2)
  })

  it('keeps the tile and announces when the write holds', async () => {
    pu.selectAndUploadPhoto.mockResolvedValue({ success: true, url: 'https://cdn/c.jpg' })
    pu.reorderPhotos.mockResolvedValue({ ok: true })

    await render(<PhotoManager userId="u" />)
    await screen.findByLabelText('Add photo')
    await fireEvent.press(screen.getByLabelText('Add photo'))

    await waitFor(() => expect(screen.getAllByLabelText(/^Photo \d of 3/)).toHaveLength(3))
    expect(mockShowToast).not.toHaveBeenCalled()
  })
})

/** A screen reader's Make main photo: the tile's own action, which ends a drag the same way. */
const makeMain = (label: string) => fireEvent(screen.getByLabelText(label), 'accessibilityAction', { nativeEvent: { actionName: 'makeMain' } })

describe('making a photo the main one', () => {
  it('reorders under the finger and keeps it when the write holds', async () => {
    pu.reorderPhotos.mockResolvedValue({ ok: true })
    await render(<PhotoManager userId="u" />)
    await screen.findByLabelText('Photo 2 of 2')
    await makeMain('Photo 2 of 2')

    await waitFor(() => expect(pu.reorderPhotos).toHaveBeenCalledWith('u', ['https://cdn/b.jpg', 'https://cdn/a.jpg'], 'https://cdn/a.jpg'))
    // b is now first and carries the main-photo label; nothing was alerted.
    await screen.findByLabelText('Photo 1 of 2, main photo')
    expect(mockShowToast).not.toHaveBeenCalled()
  })

  it('puts the order back and says why when the write is refused', async () => {
    pu.reorderPhotos.mockResolvedValue({ ok: false, error: 'Could not save your photos' })
    await render(<PhotoManager userId="u" />)
    await screen.findByLabelText('Photo 2 of 2')
    await makeMain('Photo 2 of 2')

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Could not save your photos', 'error', { haptic: 'error' }))
    // The grid is back to what the server holds: a first, b second.
    const tiles = screen.getAllByLabelText(/^Photo \d of 2/)
    expect(tiles[0].props.accessibilityLabel).toBe('Photo 1 of 2, main photo')
    expect(pu.reorderPhotos).toHaveBeenCalledTimes(1)
  })
})

describe('removing a photo', () => {
  // The confirmation is the app's sheet; this is a tap on its "Remove photo".
  function confirmRemove() {
    const sheet = (showSheet as jest.Mock).mock.calls.at(-1)?.[0] as { actions: { label: string; then?: () => void }[] }
    sheet.actions.find((a) => a.label === 'Remove photo')!.then!()
  }

  it('does NOT delete the object when the profile write fails, and restores the grid', async () => {
    pu.reorderPhotos.mockResolvedValue({ ok: false, error: 'That looks like a blank image. Pick a photo of yourself.' })
    await render(<PhotoManager userId="u" />)
    await screen.findByLabelText('Remove photo 2')
    await fireEvent.press(screen.getByLabelText('Remove photo 2'))
    confirmRemove()

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('That looks like a blank image. Pick a photo of yourself.', 'error', { haptic: 'error' }))
    expect(pu.deletePhoto).not.toHaveBeenCalled()
    expect(screen.getAllByLabelText(/^Photo \d of/)).toHaveLength(2)
  })

  it('deletes the object only after the profile no longer lists it', async () => {
    pu.reorderPhotos.mockResolvedValue({ ok: true })
    pu.deletePhoto.mockResolvedValue(true)
    await render(<PhotoManager userId="u" />)
    await screen.findByLabelText('Remove photo 2')
    await fireEvent.press(screen.getByLabelText('Remove photo 2'))
    confirmRemove()

    await waitFor(() => expect(pu.deletePhoto).toHaveBeenCalledWith('https://cdn/b.jpg'))
    expect(pu.reorderPhotos).toHaveBeenCalledWith('u', ['https://cdn/a.jpg'], 'https://cdn/a.jpg')
  })
})
