/**
 * Reposition (Flow 6 · 6.3 #08): the frame, the caption, Use photo and Choose another; what Use photo hands back is the part of
 * the photo inside the frame. The drag and the pinch are the gesture handler's (a device); what this pins is the arithmetic
 * they feed (`photoCrop`), the frame's shape on a short screen, and the way a screen reader reaches the same crop.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('expo-image', () => {
  const { View } = require('react-native')
  return { Image: (p: object) => <View {...p} /> }
})

import { Reposition, RepositionHost } from '../components/profile/Reposition'
import { cropRect } from '../lib/photoCrop'
import { requestReposition } from '../lib/photoReposition'

const PHOTO = { uri: 'file:///a.jpg', width: 4000, height: 3000 }
const lay = async (width: number, height: number) => {
  await act(async () => {
    fireEvent(screen.getByTestId('reposition-room'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height } } })
  })
}

describe('the step', () => {
  it('says what it is for, and has the two ways out', async () => {
    await render(<Reposition photo={PHOTO} onUse={jest.fn()} onAnother={jest.fn()} />)
    expect(screen.getByText('Drag and pinch. This is how your main photo is cropped.')).toBeTruthy()
    expect(screen.getByText('Use photo')).toBeTruthy()
    expect(screen.getByText('Choose another')).toBeTruthy()
  })

  it('Use is unavailable until the frame is measured: there is nothing to crop to yet', async () => {
    const onUse = jest.fn()
    await render(<Reposition photo={PHOTO} onUse={onUse} onAnother={jest.fn()} />)
    await fireEvent.press(screen.getByTestId('reposition-use'))
    expect(onUse).not.toHaveBeenCalled()
  })

  it('Use photo hands back the middle of the photo at the frame’s 1.3 shape, untouched', async () => {
    const onUse = jest.fn()
    await render(<Reposition photo={PHOTO} onUse={onUse} onAnother={jest.fn()} />)
    await lay(400, 700)
    await fireEvent.press(screen.getByTestId('reposition-use'))
    // 400 wide, 520 tall: the frame, in the room it was given.
    expect(onUse).toHaveBeenCalledWith(cropRect(PHOTO, { width: 400, height: 520 }, 1, { x: 0, y: 0 }))
    const rect = onUse.mock.calls[0][0]
    expect(rect.width / rect.height).toBeCloseTo(400 / 520, 2)
  })

  it('on a short screen the frame gives way (narrower, same shape), never the buttons', async () => {
    const onUse = jest.fn()
    await render(<Reposition photo={PHOTO} onUse={onUse} onAnother={jest.fn()} />)
    await lay(360, 390)
    await fireEvent.press(screen.getByTestId('reposition-use'))
    const rect = onUse.mock.calls[0][0]
    // 390 tall, so 300 wide: still 1 : 1.3.
    expect(rect.width / rect.height).toBeCloseTo(300 / 390, 2)
    expect(screen.getByTestId('reposition-frame').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ width: 300, height: 390 })]))
  })

  it('a screen reader zooms with swipe up and down, and Use photo keeps the zoomed part', async () => {
    const onUse = jest.fn()
    await render(<Reposition photo={PHOTO} onUse={onUse} onAnother={jest.fn()} />)
    await lay(400, 700)
    const frame = screen.getByTestId('reposition-frame')
    expect(frame.props.accessibilityRole).toBe('adjustable')
    await act(async () => frame.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }))
    await fireEvent.press(screen.getByTestId('reposition-use'))
    expect(onUse).toHaveBeenCalledWith(cropRect(PHOTO, { width: 400, height: 520 }, 1.5, { x: 0, y: 0 }))
    onUse.mockClear()
    await act(async () => frame.props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }))
    await act(async () => frame.props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }))
    await fireEvent.press(screen.getByTestId('reposition-use'))
    // Never below 1×.
    expect(onUse).toHaveBeenCalledWith(cropRect(PHOTO, { width: 400, height: 520 }, 1, { x: 0, y: 0 }))
  })

  it('Choose another goes back', async () => {
    const onAnother = jest.fn()
    await render(<Reposition photo={PHOTO} onUse={jest.fn()} onAnother={onAnother} />)
    await fireEvent.press(screen.getByTestId('reposition-another'))
    expect(onAnother).toHaveBeenCalled()
  })
})

describe('the host', () => {
  it('draws nothing until a photo is asked, then the step; Use photo answers the question', async () => {
    await render(<RepositionHost />)
    expect(screen.queryByText('Use photo')).toBeNull()
    let asked!: ReturnType<typeof requestReposition>
    await act(async () => {
      asked = requestReposition(PHOTO)
    })
    await lay(400, 700)
    await fireEvent.press(screen.getByTestId('reposition-use'))
    await expect(asked).resolves.toEqual({ kind: 'use', rect: cropRect(PHOTO, { width: 400, height: 520 }, 1, { x: 0, y: 0 }) })
    expect(screen.queryByText('Use photo')).toBeNull()
  })

  it('Choose another answers "again"', async () => {
    await render(<RepositionHost />)
    let asked!: ReturnType<typeof requestReposition>
    await act(async () => {
      asked = requestReposition(PHOTO)
    })
    await fireEvent.press(screen.getByTestId('reposition-another'))
    await expect(asked).resolves.toEqual({ kind: 'again' })
  })
})
