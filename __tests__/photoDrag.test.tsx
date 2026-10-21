/**
 * Edit profile's photo grid, dragged (Flow 6 edit 02): a long press lifts a tile with `H.drag`, the drop writes the new order once.
 * Its own file: the gesture harness leaves the act environment off for whatever renders after it.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils'
import { State } from 'react-native-gesture-handler'

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

describe('reordering by drag (edit 02)', () => {
  it('lifts on a long press with H.drag and writes the new order once on the drop', async () => {
    await render(<PhotoManager userId="u" />)
    await screen.findByLabelText('Photo 3 of 3')
    const pan = getByGestureTestId('photo-tile-2-drag')
    // Tile 2 is dragged to the first slot: its centre is over slot 0.
    await act(async () => {
      fireGestureHandler(pan, [
        { state: State.BEGAN },
        { state: State.ACTIVE, translationX: 0, translationY: 0 },
        { translationX: -440, translationY: 0 },
        { state: State.END, translationX: -440, translationY: 0 },
      ])
    })
    expect(H.drag).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(pu.reorderPhotos).toHaveBeenCalledTimes(1))
    expect(pu.reorderPhotos.mock.calls[0][1]).toEqual([url(2), url(0), url(1)])
  })

  it('writes nothing when the tile is put back where it was', async () => {
    await render(<PhotoManager userId="u" />)
    await screen.findByLabelText('Photo 3 of 3')
    await act(async () => {
      fireGestureHandler(getByGestureTestId('photo-tile-1-drag'), [
        { state: State.BEGAN },
        { state: State.ACTIVE, translationX: 0, translationY: 0 },
        { state: State.END, translationX: 0, translationY: 0 },
      ])
    })
    expect(pu.reorderPhotos).not.toHaveBeenCalled()
  })

  it('puts the order back and says why when the server refuses it', async () => {
    pu.reorderPhotos.mockResolvedValueOnce({ ok: false, error: 'Couldn’t save your photos. Try again.' })
    await render(<PhotoManager userId="u" />)
    await screen.findByLabelText('Photo 3 of 3')
    await act(async () => {
      act1('Photo 3 of 3', 'makeMain')
    })
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Couldn’t save your photos. Try again.', 'error', { haptic: 'error' }))
    expect(screen.getByLabelText('Photo 1 of 3, main photo')).toBeTruthy()
    expect(H.success).not.toHaveBeenCalled()
  })
})


describe('while a tile is in the hand', () => {
  it('tells the page, so its scroll stands down, and lets go when the drop lands', async () => {
    const onDragging = jest.fn()
    await render(<PhotoManager userId="u" onDragging={onDragging} />)
    await screen.findByLabelText('Photo 3 of 3')
    await act(async () => {
      fireGestureHandler(getByGestureTestId('photo-tile-1-drag'), [
        { state: State.BEGAN },
        { state: State.ACTIVE, translationX: 0, translationY: 0 },
        { state: State.END, translationX: 0, translationY: 0 },
      ])
    })
    expect(onDragging.mock.calls.map((c) => c[0])).toEqual([true, false])
  })

  it('writes nothing for a drag that ends while another write is open: the tiles go home', async () => {
    let finish: (v: { success: true; url: string }) => void = () => {}
    pu.selectAndUploadPhoto.mockImplementation(() => new Promise((resolve) => (finish = resolve as never)))
    await render(<PhotoManager userId="u" />)
    await screen.findByLabelText('Photo 3 of 3')
    await fireEvent.press(screen.getByLabelText('Add photo'))
    await act(async () => {
      fireGestureHandler(getByGestureTestId('photo-tile-2-drag'), [
        { state: State.BEGAN },
        { state: State.ACTIVE, translationX: 0, translationY: 0 },
        { translationX: -440, translationY: 0 },
        { state: State.END, translationX: -440, translationY: 0 },
      ])
    })
    expect(pu.reorderPhotos).not.toHaveBeenCalled()
    await act(async () => finish({ success: false } as never))
  })
})
