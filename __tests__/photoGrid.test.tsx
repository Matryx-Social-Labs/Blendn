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
  loadPulledPhotos: jest.fn(async () => []),
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
import { pulledPhotos } from '../lib/photoStates'
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

  // `photo_states` as the server sends it for your own profile (blendn-admin __tests__/integration/profile-friends-push-gaps.itest.ts):
  // the live photo, then the pulled one with no URL.
  const photoStates = (wasMain: boolean) => [
    { url: url(0), pulled: false, pulled_at: null, was_main: false },
    { url: null, pulled: true, pulled_at: '2026-10-21T09:15:00.000Z', was_main: wasMain },
  ]

  it('is drawn after the photos that are up, and is never part of what is written', async () => {
    pu.loadUserPhotos.mockResolvedValue(list(2))
    pu.loadPulledPhotos.mockResolvedValue(pulledPhotos(photoStates(false)))
    await render(<PhotoManager userId="u" />)
    await screen.findByTestId('tile-pulled')
    // Two photos up and one removed: the count is of the photos on the profile.
    expect(screen.getByText('2 of 6 · saved as you go')).toBeTruthy()
    await act(async () => {
      act1('Photo 2 of 2', 'earlier')
    })
    await waitFor(() => expect(pu.reorderPhotos).toHaveBeenCalled())
    expect(pu.reorderPhotos.mock.calls[0][1]).toEqual([url(1), url(0)])
  })

  it('draws nothing when the server sends no photo_states (an older server)', async () => {
    pu.loadPulledPhotos.mockResolvedValue(pulledPhotos(undefined))
    await render(<PhotoManager userId="u" />)
    await screen.findByLabelText('Photo 3 of 3')
    expect(screen.queryByTestId('tile-pulled')).toBeNull()
    expect(screen.getByText(/Drag to reorder; the first is what people see/)).toBeTruthy()
  })

  it('lets the person replace it: the tile adds a different photo, and its notice goes once that photo is on the profile', async () => {
    pu.loadUserPhotos.mockResolvedValue(list(2))
    pu.loadPulledPhotos.mockResolvedValue(pulledPhotos(photoStates(false)))
    pu.selectAndUploadPhoto.mockResolvedValue({ success: true, url: url(9) } as never)
    await render(<PhotoManager userId="u" />)
    await screen.findByTestId('tile-pulled')
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Removed. This photo didn’t meet the photo rules. Add a different photo'))
    })
    await screen.findByLabelText('Photo 3 of 3')
    expect(pu.selectAndUploadPhoto).toHaveBeenCalled()
    expect(pu.reorderPhotos.mock.calls[0][1]).toEqual([url(0), url(1), url(9)])
    expect(screen.queryByTestId('tile-pulled')).toBeNull()
  })

  it('keeps the notice when the replacement is cancelled, and its × dismisses it', async () => {
    pu.loadUserPhotos.mockResolvedValue(list(2))
    pu.loadPulledPhotos.mockResolvedValue(pulledPhotos(photoStates(false)))
    pu.selectAndUploadPhoto.mockResolvedValue({ success: false, cancelled: true } as never)
    await render(<PhotoManager userId="u" />)
    await screen.findByTestId('tile-pulled')
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Removed. This photo didn’t meet the photo rules. Add a different photo'))
    })
    expect(screen.getByTestId('tile-pulled')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Dismiss removed photo'))
    expect(screen.queryByTestId('tile-pulled')).toBeNull()
  })

  it('gives its slot to a photo when the grid is full: never more than six tiles', async () => {
    pu.loadUserPhotos.mockResolvedValue(list(6))
    pu.loadPulledPhotos.mockResolvedValue(pulledPhotos(photoStates(false)))
    await render(<PhotoManager userId="u" />)
    await screen.findByLabelText('Photo 6 of 6')
    expect(screen.queryByTestId('tile-pulled')).toBeNull()
  })

  it('says what the main photo is now when the main one was taken down, and where to write', async () => {
    pu.loadUserPhotos.mockResolvedValue(list(2))
    pu.loadPulledPhotos.mockResolvedValue(pulledPhotos(photoStates(true)))
    await render(<PhotoManager userId="u" />)
    await screen.findByTestId('photos-main-pulled')
    expect(screen.getByText('Your main photo was removed. The next one is your main photo now.')).toBeTruthy()
    expect(screen.getByText('Think we got it wrong? Write to support@blendn.app.')).toBeTruthy()
    expect(screen.queryByText(/Drag to reorder/)).toBeNull()
  })

  it('a removed photo that was not the main one leaves the usual line', async () => {
    pu.loadUserPhotos.mockResolvedValue(list(2))
    pu.loadPulledPhotos.mockResolvedValue(pulledPhotos(photoStates(false)))
    await render(<PhotoManager userId="u" />)
    await screen.findByTestId('tile-pulled')
    expect(screen.queryByTestId('photos-main-pulled')).toBeNull()
    expect(screen.getByText(/Drag to reorder/)).toBeTruthy()
  })
})
