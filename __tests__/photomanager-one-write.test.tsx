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
const A = 'https://cdn/a-sealed'
const UPLOAD = 'https://cdn/upload-c.jpg'
const SEALED = 'https://cdn/c-sealed'

beforeEach(() => {
  jest.clearAllMocks()
  pu.getUserPhotos.mockResolvedValue([{ id: 'u_0', url: A, order: 0, isPrimary: true }])
  pu.selectAndUploadPhoto.mockResolvedValue({ success: true, url: UPLOAD })
})

it("makes the new photo main by the URL the server stored, not the upload it deleted", async () => {
  pu.reorderPhotos.mockResolvedValueOnce({ ok: true, photos: [A, SEALED] }).mockResolvedValueOnce({ ok: true, photos: [SEALED, A] })

  await render(<PhotoManager userId="u" editable />)
  await screen.findByText('Add photo')
  await fireEvent.press(screen.getByText('Add photo'))
  await waitFor(() => expect(pu.reorderPhotos).toHaveBeenCalledTimes(1))
  await screen.findByText('Add photo')

  await fireEvent.press(screen.getByLabelText('Make this my main photo'))

  await waitFor(() => expect(pu.reorderPhotos).toHaveBeenCalledTimes(2))
  expect(pu.reorderPhotos.mock.calls[1][1]).toEqual([SEALED, A])
})

/** A write the test settles by hand, so a second tap can land while it is open. */
function deferred() {
  let resolve!: (value: { ok: true; photos: string[] }) => void
  const promise = new Promise<{ ok: true; photos: string[] }>((r) => (resolve = r))
  return { promise, resolve }
}

it("refuses Make main while the add's write is open, then makes it main by the stored URL", async () => {
  const add = deferred()
  pu.reorderPhotos.mockReturnValueOnce(add.promise).mockResolvedValueOnce({ ok: true, photos: [SEALED, A] })

  await render(<PhotoManager userId="u" editable />)
  await screen.findByText('Add photo')
  await act(async () => {
    fireEvent.press(screen.getByText('Add photo'))
  })
  await screen.findByLabelText('Photo 2 of 2')

  const makeMain = screen.getByLabelText('Make this my main photo')
  expect(makeMain.props.accessibilityState).toMatchObject({ disabled: true })
  await fireEvent.press(makeMain)
  expect(pu.reorderPhotos).toHaveBeenCalledTimes(1)

  await act(async () => {
    add.resolve({ ok: true, photos: [A, SEALED] })
  })
  await waitFor(() =>
    expect(screen.getByLabelText('Make this my main photo').props.accessibilityState).toMatchObject({ disabled: false })
  )
  await fireEvent.press(screen.getByLabelText('Make this my main photo'))
  await waitFor(() => expect(pu.reorderPhotos).toHaveBeenCalledTimes(2))
  expect(pu.reorderPhotos.mock.calls[1][1]).toEqual([SEALED, A])
})

it("refuses Remove and Add while Make main's write is open", async () => {
  pu.getUserPhotos.mockResolvedValue([
    { id: 'u_0', url: A, order: 0, isPrimary: true },
    { id: 'u_1', url: SEALED, order: 1, isPrimary: false },
  ])
  const makeMain = deferred()
  pu.reorderPhotos.mockReturnValueOnce(makeMain.promise)

  await render(<PhotoManager userId="u" editable />)
  await screen.findByLabelText('Photo 2 of 2')
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Make this my main photo'))
  })

  expect(screen.getByLabelText('Remove photo 2').props.accessibilityState).toMatchObject({ disabled: true })
  await fireEvent.press(screen.getByLabelText('Remove photo 2'))
  await fireEvent.press(screen.getByLabelText('Add photo'))
  expect(showSheet).not.toHaveBeenCalled()
  expect(pu.selectAndUploadPhoto).not.toHaveBeenCalled()

  await act(async () => {
    makeMain.resolve({ ok: true, photos: [SEALED, A] })
  })
  await waitFor(() =>
    expect(screen.getByLabelText('Remove photo 2').props.accessibilityState).toMatchObject({ disabled: false })
  )
})

it('refuses a second Make main inside one frame, before the button can show it is busy', async () => {
  pu.getUserPhotos.mockResolvedValue([
    { id: 'u_0', url: A, order: 0, isPrimary: true },
    { id: 'u_1', url: SEALED, order: 1, isPrimary: false },
  ])
  const makeMain = deferred()
  pu.reorderPhotos.mockReturnValueOnce(makeMain.promise)

  await render(<PhotoManager userId="u" editable />)
  await screen.findByLabelText('Photo 2 of 2')
  const button = screen.getByLabelText('Make this my main photo')
  // One outer act: React renders once at its end, so the second press meets the
  // same, still-enabled button — only the ref can refuse it.
  await act(async () => {
    fireEvent.press(button)
    fireEvent.press(button)
  })

  expect(pu.reorderPhotos).toHaveBeenCalledTimes(1)
  await act(async () => {
    makeMain.resolve({ ok: true, photos: [SEALED, A] })
  })
})

it('Remove lets go of the grid when its write ends: refused, then held', async () => {
  pu.getUserPhotos.mockResolvedValue([
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

  await render(<PhotoManager userId="u" editable />)
  await screen.findByLabelText('Photo 2 of 2')

  // Refused: the grid as it was, and free again.
  await removeVia(0)
  await waitFor(() => expect(screen.getAllByLabelText(/^Photo \d of 2/)).toHaveLength(2))
  expect(screen.getByLabelText('Remove photo 2').props.accessibilityState).toMatchObject({ disabled: false })
  expect(screen.getByLabelText('Make this my main photo').props.accessibilityState).toMatchObject({ disabled: false })

  // Held: one photo left, and free again.
  await removeVia(1)
  await waitFor(() => expect(screen.getAllByLabelText(/^Photo \d of 1/)).toHaveLength(1))
  expect(screen.getByLabelText('Add photo').props.accessibilityState).toMatchObject({ disabled: false })
})
