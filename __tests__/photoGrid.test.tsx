/**
 * Edit profile's photo grid, drawn (Flow 6 edit 01 · 03 · 04 · 05 · 11; R4.1 6-4 #08): the tile for a photo on its way and the one
 * that did not get there, the moderation tile, the load that failed, and the screen reader's way to move a photo. Dragging is
 * `photoDrag.test.tsx`.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

jest.mock('../lib/photoUtils', () => ({
  cachePhoto: jest.fn(async () => null),
  deletePhoto: jest.fn(async () => true),
  loadUserPhotos: jest.fn(),
  reorderPhotos: jest.fn(),
  selectAndUploadPhoto: jest.fn(),
  uploadPhoto: jest.fn(),
}))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))
jest.mock('../lib/haptics', () => ({ H: { drag: jest.fn(), success: jest.fn(), error: jest.fn() } }))
const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
jest.mock('../components/OptimizedImage', () => ({ OptimizedImage: () => null }))

/* eslint-disable import/first */
import * as photoUtils from '../lib/photoUtils'
import { H } from '../lib/haptics'
import PhotoManager from '../components/PhotoManager'
import { PulledFace } from '../components/profile/PhotoGridTile'
/* eslint-enable import/first */

const pu = photoUtils as jest.Mocked<typeof photoUtils>
const url = (n: number) => `https://cdn/p${n}.jpg`
const list = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `u_${i}`, url: url(i), order: i, isPrimary: i === 0 }))

beforeEach(() => {
  jest.clearAllMocks()
  pu.loadUserPhotos.mockResolvedValue(list(3))
  pu.reorderPhotos.mockResolvedValue({ ok: true, photos: [] } as never)
})

const act1 = (label: string, actionName: string) =>
  fireEvent(screen.getByLabelText(label), 'accessibilityAction', { nativeEvent: { actionName } })

describe('the grid at rest (edit 01)', () => {
  it('says how many, marks the first Main, and draws a dashed slot for each one still to come', async () => {
    await render(<PhotoManager userId="u" />)
    await screen.findByLabelText('Photo 3 of 3')
    expect(screen.getByText('3 of 6 · saved as you go')).toBeTruthy()
    expect(screen.getByText('Main')).toBeTruthy()
    expect(screen.getByText(/Drag to reorder; the first is what people see/)).toBeTruthy()
    // One Add in the reading order; the other empty slots are for a finger.
    expect(screen.getAllByLabelText('Add photo')).toHaveLength(1)
  })

  it('draws three skeleton tiles while it loads (edit 11)', async () => {
    pu.loadUserPhotos.mockReturnValue(new Promise(() => {}))
    await render(<PhotoManager userId="u" />)
    expect(screen.getByTestId('photos-loading')).toBeTruthy()
    expect(screen.queryByLabelText('Add photo')).toBeNull()
  })

  it('does not draw an empty grid for a read that failed, since Add there would overwrite the photos the server has (6-4 #08)', async () => {
    pu.loadUserPhotos.mockResolvedValueOnce(null)
    await render(<PhotoManager userId="u" />)
    await screen.findByText('Your photos didn’t open.')
    expect(screen.queryByLabelText('Add photo')).toBeNull()
    pu.loadUserPhotos.mockResolvedValueOnce(list(2))
    fireEvent.press(screen.getByText('Try again'))
    await screen.findByLabelText('Photo 2 of 2')
  })
})

describe('without dragging', () => {
  it('offers a screen reader Make main photo, Move earlier and Move later where they apply', async () => {
    await render(<PhotoManager userId="u" />)
    const first = await screen.findByLabelText('Photo 1 of 3, main photo')
    const last = screen.getByLabelText('Photo 3 of 3')
    expect(first.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual(['later'])
    expect(last.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual(['makeMain', 'earlier'])
  })

  it('moves a photo one place earlier', async () => {
    await render(<PhotoManager userId="u" />)
    await screen.findByLabelText('Photo 3 of 3')
    await act(async () => {
      act1('Photo 3 of 3', 'earlier')
    })
    await waitFor(() => expect(pu.reorderPhotos).toHaveBeenCalled())
    expect(pu.reorderPhotos.mock.calls[0][1]).toEqual([url(0), url(2), url(1)])
  })
})

describe('a photo on its way (edit 03 · 04)', () => {
  it('holds the next slot with a progress bar while it uploads, and takes it back when the write lands', async () => {
    let progress: (f: number) => void = () => {}
    let picked: (uri: string) => void = () => {}
    let finish: (v: { success: true; url: string }) => void = () => {}
    pu.selectAndUploadPhoto.mockImplementation((_, hooks) => {
      picked = hooks?.onPicked ?? picked
      progress = hooks?.onProgress ?? progress
      return new Promise((resolve) => (finish = resolve as never))
    })
    await render(<PhotoManager userId="u" />)
    await screen.findByLabelText('Photo 3 of 3')
    await fireEvent.press(screen.getByLabelText('Add photo'))
    await act(async () => picked('file://new.jpg'))
    expect(screen.getByTestId('tile-uploading')).toBeTruthy()
    await act(async () => progress(0.62))
    expect(screen.getByTestId('tile-uploading').props.accessibilityValue).toMatchObject({ now: 62 })
    await act(async () => finish({ success: true, url: url(9) }))
    await waitFor(() => expect(screen.queryByTestId('tile-uploading')).toBeNull())
    await screen.findByLabelText('Photo 4 of 4')
  })

  it('keeps the file on a tile that did not upload, and Retry sends that file', async () => {
    pu.selectAndUploadPhoto.mockImplementation(async (_, hooks) => {
      hooks?.onPicked?.('file://new.jpg')
      return { success: false, error: 'Upload failed with status 502' }
    })
    await render(<PhotoManager userId="u" />)
    await screen.findByLabelText('Photo 3 of 3')
    await fireEvent.press(screen.getByLabelText('Add photo'))
    await screen.findByLabelText('Didn’t upload. Retry')
    expect(mockShowToast).toHaveBeenCalledWith("Couldn't upload that photo. Try again.", 'error', { haptic: 'error' })

    pu.uploadPhoto.mockResolvedValue({ success: true, url: url(9) })
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Didn’t upload. Retry'))
    })
    expect(pu.uploadPhoto).toHaveBeenCalledWith('file://new.jpg', 'u', undefined, 'profile', expect.any(Function))
    await screen.findByLabelText('Photo 4 of 4')
    expect(screen.queryByLabelText('Didn’t upload. Retry')).toBeNull()
  })
})

describe('a photo moderation took down (edit 05)', () => {
  it('says it is gone, and why, and its × still clears the slot', async () => {
    const onRemove = jest.fn()
    await render(<PulledFace onRemove={onRemove} removeLabel="Remove photo 2" removeDisabled={false} />)
    expect(screen.getByText('Removed · didn’t meet the photo rules')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('Remove photo 2'))
    expect(onRemove).toHaveBeenCalled()
  })

  it('is drawn for a photo the server marks pulled', async () => {
    pu.loadUserPhotos.mockResolvedValue([{ ...list(2)[0] }, { ...list(2)[1], pulled: true }])
    await render(<PhotoManager userId="u" />)
    await screen.findByTestId('tile-pulled')
  })
})
