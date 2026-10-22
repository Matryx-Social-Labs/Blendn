/**
 * Edit profile's photos: one write at a time, each naming what the server
 * stored (SCRUM-489, SCRUM-497).
 *
 * A new tile appears at once carrying the upload's URL; the add's write is
 * what swaps it for the sealed copy the server keeps (it deletes the upload).
 * Make main and Remove stayed live while that write was in flight, so on the
 * iOS sim against staging (2026-10-01, a slow host) a quick Make main re-sent
 * the upload — "That photo did not finish uploading" — once cleared the blur,
 * and a failed write restored a pre-adoption grid that every later write
 * re-sent until the screen was reopened.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
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
  const React = require('react')
  const { View } = require('react-native')
  return {
    OptimizedImage: (p: { accessibilityLabel?: string }) =>
      React.createElement(View, { accessible: true, accessibilityLabel: p.accessibilityLabel }),
  }
})

import * as photoUtils from '../lib/photoUtils'
import PhotoManager from '../components/PhotoManager'
import { showSheet } from '../lib/sheet'

const pu = photoUtils as jest.Mocked<typeof photoUtils>

/** What a screen reader's Make main photo does: the tile's own action, which a drag also ends in. */
const makeMain = (label: string) => fireEvent(screen.getByLabelText(label), 'accessibilityAction', { nativeEvent: { actionName: 'makeMain' } })
const A = 'https://cdn/a-sealed'
const UPLOAD = 'https://cdn/upload-c.jpg'
const SEALED = 'https://cdn/c-sealed'

beforeEach(() => {
  jest.clearAllMocks()
  pu.loadUserPhotos.mockResolvedValue([{ id: 'u_0', url: A, order: 0, isPrimary: true }])
  pu.selectAndUploadPhoto.mockResolvedValue({ success: true, url: UPLOAD })
})

it("makes the new photo main by the URL the server stored, not the upload it deleted", async () => {
  pu.reorderPhotos.mockResolvedValueOnce({ ok: true, photos: [A, SEALED] }).mockResolvedValueOnce({ ok: true, photos: [SEALED, A] })

  await render(<PhotoManager userId="u" />)
  await screen.findByLabelText('Add photo')
  await fireEvent.press(screen.getByLabelText('Add photo'))
  await waitFor(() => expect(pu.reorderPhotos).toHaveBeenCalledTimes(1))
  await screen.findByLabelText('Photo 2 of 2')

  await act(async () => {
    makeMain('Photo 2 of 2')
  })

  await waitFor(() => expect(pu.reorderPhotos).toHaveBeenCalledTimes(2))
  expect(pu.reorderPhotos.mock.calls[1][1]).toEqual([SEALED, A])
})

/** A write the test settles by hand, so a second tap can land while it is open. */
function deferred() {
  let resolve!: (value: { ok: true; photos: string[] }) => void
  const promise = new Promise<{ ok: true; photos: string[] }>((r) => (resolve = r))
  return { promise, resolve }
}

it("refuses a reorder while the add’s write is open, then makes it main by the stored URL", async () => {
  const add = deferred()
  pu.reorderPhotos.mockReturnValueOnce(add.promise).mockResolvedValueOnce({ ok: true, photos: [SEALED, A] })

  await render(<PhotoManager userId="u" />)
  await screen.findByLabelText('Add photo')
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Add photo'))
  })
  await screen.findByLabelText('Photo 2 of 2')

  // The tile is draggable only when nothing is being written: its × is the visible sign, and a second write is refused outright.
  expect(screen.getByLabelText('Remove photo 2').props.accessibilityState).toMatchObject({ disabled: true })
  await act(async () => {
    makeMain('Photo 2 of 2')
  })
  expect(pu.reorderPhotos).toHaveBeenCalledTimes(1)

  await act(async () => {
    add.resolve({ ok: true, photos: [A, SEALED] })
  })
  await waitFor(() => expect(screen.getByLabelText('Remove photo 2').props.accessibilityState).toMatchObject({ disabled: false }))
  await act(async () => {
    makeMain('Photo 2 of 2')
  })
  await waitFor(() => expect(pu.reorderPhotos).toHaveBeenCalledTimes(2))
  expect(pu.reorderPhotos.mock.calls[1][1]).toEqual([SEALED, A])
})

it('refuses Remove and Add while a reorder’s write is open', async () => {
  pu.loadUserPhotos.mockResolvedValue([
    { id: 'u_0', url: A, order: 0, isPrimary: true },
    { id: 'u_1', url: SEALED, order: 1, isPrimary: false },
  ])
  const write = deferred()
  pu.reorderPhotos.mockReturnValueOnce(write.promise)

  await render(<PhotoManager userId="u" />)
  await screen.findByLabelText('Photo 2 of 2')
  await act(async () => {
    makeMain('Photo 2 of 2')
  })

  expect(screen.getByLabelText('Remove photo 2').props.accessibilityState).toMatchObject({ disabled: true })
  await fireEvent.press(screen.getByLabelText('Remove photo 2'))
  await fireEvent.press(screen.getByLabelText('Add photo'))
  expect(showSheet).not.toHaveBeenCalled()
  expect(pu.selectAndUploadPhoto).not.toHaveBeenCalled()

  await act(async () => {
    write.resolve({ ok: true, photos: [SEALED, A] })
  })
  await waitFor(() => expect(screen.getByLabelText('Remove photo 2').props.accessibilityState).toMatchObject({ disabled: false }))
})

it('refuses a second reorder inside one frame, before the tiles can show they are busy', async () => {
  pu.loadUserPhotos.mockResolvedValue([
    { id: 'u_0', url: A, order: 0, isPrimary: true },
    { id: 'u_1', url: SEALED, order: 1, isPrimary: false },
  ])
  const write = deferred()
  pu.reorderPhotos.mockReturnValueOnce(write.promise)

  await render(<PhotoManager userId="u" />)
  await screen.findByLabelText('Photo 2 of 2')
  // One outer act: React renders once at its end, so the second action meets the same, still-enabled tile: only the ref can refuse it.
  await act(async () => {
    makeMain('Photo 2 of 2')
    makeMain('Photo 2 of 2')
  })

  expect(pu.reorderPhotos).toHaveBeenCalledTimes(1)
  await act(async () => {
    write.resolve({ ok: true, photos: [SEALED, A] })
  })
})

it('Remove lets go of the grid when its write ends: refused, then held', async () => {
  pu.loadUserPhotos.mockResolvedValue([
    { id: 'u_0', url: A, order: 0, isPrimary: true },
    { id: 'u_1', url: SEALED, order: 1, isPrimary: false },
  ])
  pu.reorderPhotos
    .mockResolvedValueOnce({ ok: false, error: 'Could not save your photos' })
    .mockResolvedValueOnce({ ok: true, photos: [A] })
  pu.deletePhoto.mockResolvedValue(true)
  const removeVia = async (n: number) => {
    await fireEvent.press(screen.getByLabelText('Remove photo 2'))
    const sheet = (showSheet as jest.Mock).mock.calls[n][0] as { actions: { then: () => Promise<void> }[] }
    await act(() => sheet.actions[0].then())
  }

  await render(<PhotoManager userId="u" />)
  await screen.findByLabelText('Photo 2 of 2')

  // Refused: the grid as it was, and free again.
  await removeVia(0)
  await waitFor(() => expect(screen.getAllByLabelText(/^Photo \d of 2/)).toHaveLength(2))
  expect(screen.getByLabelText('Remove photo 2').props.accessibilityState).toMatchObject({ disabled: false })

  // Held: one photo left, and free again.
  await removeVia(1)
  await waitFor(() => expect(screen.getAllByLabelText(/^Photo \d of 1/)).toHaveLength(1))
  expect(screen.getByLabelText('Add photo').props.accessibilityState).toMatchObject({ disabled: false })
})
