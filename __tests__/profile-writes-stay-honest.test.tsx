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
import { Alert } from 'react-native'

jest.mock('../lib/photoUtils', () => ({
  selectAndUploadPhoto: jest.fn(),
  reorderPhotos: jest.fn(),
  deletePhoto: jest.fn(),
  getUserPhotos: jest.fn(),
  cachePhoto: jest.fn().mockResolvedValue(null),
}))
jest.mock('../lib/logger', () => ({
  Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))
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
import PhotoManager from '../components/PhotoManager'

const pu = photoUtils as jest.Mocked<typeof photoUtils>
const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})

beforeEach(() => {
  jest.clearAllMocks()
  pu.getUserPhotos.mockResolvedValue([
    { id: 'u_0', url: 'https://cdn/a.jpg', order: 0, isPrimary: true },
    { id: 'u_1', url: 'https://cdn/b.jpg', order: 1, isPrimary: false },
  ])
})

describe('adding a photo', () => {
  it('drops the tile and says so when the profile write fails after the upload', async () => {
    pu.selectAndUploadPhoto.mockResolvedValue({ success: true, url: 'https://cdn/c.jpg' })
    pu.reorderPhotos.mockResolvedValue(false)

    await render(<PhotoManager userId="u" editable />)
    await screen.findByText('Add Photo')
    fireEvent.press(screen.getByText('Add Photo'))

    await waitFor(() => expect(pu.reorderPhotos).toHaveBeenCalledWith('u', ['https://cdn/a.jpg', 'https://cdn/b.jpg', 'https://cdn/c.jpg']))
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Could not save', expect.any(String)))
    // Two tiles, not three: the one the server does not have is not shown.
    expect(screen.getAllByLabelText(/^Photo \d of/)).toHaveLength(2)
  })

  it('keeps the tile and announces when the write holds', async () => {
    pu.selectAndUploadPhoto.mockResolvedValue({ success: true, url: 'https://cdn/c.jpg' })
    pu.reorderPhotos.mockResolvedValue(true)

    await render(<PhotoManager userId="u" editable />)
    await screen.findByText('Add Photo')
    fireEvent.press(screen.getByText('Add Photo'))

    await waitFor(() => expect(screen.getAllByLabelText(/^Photo \d of 3/)).toHaveLength(3))
    expect(alert).not.toHaveBeenCalled()
  })
})

describe('removing a photo', () => {
  function confirmRemove() {
    const buttons = alert.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[]
    buttons.find((b) => b.text === 'Remove')!.onPress!()
  }

  it('does NOT delete the object when the profile write fails, and restores the grid', async () => {
    pu.reorderPhotos.mockResolvedValue(false)
    await render(<PhotoManager userId="u" editable />)
    await screen.findByLabelText('Remove photo 2')
    fireEvent.press(screen.getByLabelText('Remove photo 2'))
    confirmRemove()

    await waitFor(() => expect(alert).toHaveBeenCalledWith('Could not remove', expect.any(String)))
    expect(pu.deletePhoto).not.toHaveBeenCalled()
    expect(screen.getAllByLabelText(/^Photo \d of/)).toHaveLength(2)
  })

  it('deletes the object only after the profile no longer lists it', async () => {
    pu.reorderPhotos.mockResolvedValue(true)
    pu.deletePhoto.mockResolvedValue(true)
    await render(<PhotoManager userId="u" editable />)
    await screen.findByLabelText('Remove photo 2')
    fireEvent.press(screen.getByLabelText('Remove photo 2'))
    confirmRemove()

    await waitFor(() => expect(pu.deletePhoto).toHaveBeenCalledWith('https://cdn/b.jpg'))
    expect(pu.reorderPhotos).toHaveBeenCalledWith('u', ['https://cdn/a.jpg'])
  })
})
