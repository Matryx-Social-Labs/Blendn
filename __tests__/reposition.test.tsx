/**
 * Reposition (Flow 6 · 6.3 #08): the frame, the caption, Use photo and Choose another; what Use photo hands back is the part of
 * the photo inside the frame. The drag and the pinch are the gesture handler's (a device); what this pins is the arithmetic
 * they feed (`photoCrop`), the frame's shape on a short screen, and the way a screen reader reaches the same crop.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { State } from 'react-native-gesture-handler'
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils'

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
// No springs: the photo is where the hand left it the moment the last finger is up, so a test reads the crop at once.
jest.mock('../lib/motion', () => ({ ...jest.requireActual('../lib/motion'), useReducedMotion: () => true }))
jest.mock('../lib/haptics', () => ({ H: { drag: jest.fn() } }))
jest.mock('expo-image', () => {
  const { View } = require('react-native')
  return { Image: (p: object) => <View {...p} /> }
})

import { Reposition, RepositionHost } from '../components/profile/Reposition'
import { H } from '../lib/haptics'
import { cropRect, maxZoomFor } from '../lib/photoCrop'
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

describe('the hand on the frame', () => {
  const FRAME = { width: 400, height: 520 }
  const mount = async (photo = PHOTO) => {
    const onUse = jest.fn()
    const onClose = jest.fn()
    await render(<Reposition photo={photo} onUse={onUse} onAnother={jest.fn()} onClose={onClose} />)
    await lay(400, 700)
    return { onUse, onClose }
  }
  const use = async (onUse: jest.Mock) => {
    onUse.mockClear()
    await fireEvent.press(screen.getByTestId('reposition-use'))
    return onUse.mock.calls[0][0] as ReturnType<typeof cropRect>
  }
  const pinchBegin = (scale = 1, focalX = 200, focalY = 260) => [
    { state: State.BEGAN, scale: 1, focalX, focalY },
    { state: State.ACTIVE, scale: 1, focalX, focalY },
    { scale, focalX, focalY },
  ]

  it('a drag moves what the frame keeps, and the photo stays where the hand left it', async () => {
    const { onUse } = await mount()
    const centred = await use(onUse)
    await act(async () => {
      fireGestureHandler(getByGestureTestId('reposition-pan'), [
        { state: State.BEGAN },
        { state: State.ACTIVE, translationX: 0, translationY: 0, changeX: 0, changeY: 0 },
        { translationX: 60, changeX: 60, changeY: 0 },
        { state: State.END, translationX: 60, changeX: 0, changeY: 0 },
      ])
    })
    const moved = await use(onUse)
    // The photo went right, so the frame looks further left in it.
    expect(moved.originX).toBeLessThan(centred.originX)
  })

  /*
   * `fireGestureHandler` ends every gesture it fires, so two gestures cannot be held open across calls. These two tests drive the
   * handlers themselves, in the order a hand would: the pinch begins, the drag begins under it, one lifts, then the other.
   */
  const handlersOf = (id: string) => (getByGestureTestId(id) as unknown as { handlers: Record<string, (e: object) => void> }).handlers
  const pinchEvt = (scale: number, focalX = 260, focalY = 300) => ({ scale, focalX, focalY })

  it('H.drag plays once when a finger first picks the photo up, not again for a second finger or gesture', async () => {
    await mount()
    ;(H.drag as jest.Mock).mockClear()
    const pinch = handlersOf('reposition-pinch')
    const pan = handlersOf('reposition-pan')
    await act(async () => {
      pinch.onStart(pinchEvt(1))
      pan.onStart({})
    })
    expect(H.drag).toHaveBeenCalledTimes(1)
    await act(async () => {
      pinch.onFinalize({})
      pan.onFinalize({})
    })
    // Everything is up: the next pick-up plays it again.
    await act(async () => handlersOf('reposition-pan').onStart({}))
    expect(H.drag).toHaveBeenCalledTimes(2)
  })

  it('H1: a drag that is on while two fingers pinch does not fight the pinch, and the photo settles when the last one is up', async () => {
    const alone = await mount()
    {
      const pinch = handlersOf('reposition-pinch')
      await act(async () => {
        pinch.onStart(pinchEvt(1))
        pinch.onUpdate(pinchEvt(2))
        pinch.onFinalize({})
      })
    }
    const pinchOnly = await use(alone.onUse)

    // The same pinch, with a drag running under it that moves a long way: the pinch owns the position.
    await screen.unmount()
    const both = await mount()
    const pinch = handlersOf('reposition-pinch')
    const pan = handlersOf('reposition-pan')
    await act(async () => {
      pinch.onStart(pinchEvt(1))
      pan.onStart({})
      pinch.onUpdate(pinchEvt(1.5))
      pan.onChange({ changeX: 300, changeY: 300 })
      pinch.onUpdate(pinchEvt(2))
      pan.onChange({ changeX: 300, changeY: 300 })
      // The pinch lifts first: one finger is still down, and the photo is not settled yet.
      pinch.onFinalize({})
    })
    expect(screen.getByTestId('reposition-frame').props.accessibilityValue).toEqual({ text: 'Zoom 1 times' })
    await act(async () => pan.onFinalize({}))
    expect(screen.getByTestId('reposition-frame').props.accessibilityValue).toEqual({ text: 'Zoom 2 times' })
    expect(await use(both.onUse)).toEqual(pinchOnly)
  })

  it('the pinch can zoom about a point and the crop shows it: 2× keeps half the width', async () => {
    const { onUse } = await mount()
    const full = await use(onUse)
    await act(async () => {
      fireGestureHandler(getByGestureTestId('reposition-pinch'), [...pinchBegin(2), { state: State.END, scale: 2, focalX: 200, focalY: 260 }])
    })
    expect((await use(onUse)).width).toBeCloseTo(full.width / 2, -1)
  })

  it('a double tap toggles 1× and 2×, and a tap brings the photo back to the middle', async () => {
    const { onUse } = await mount()
    const full = await use(onUse)
    await act(async () => {
      fireGestureHandler(getByGestureTestId('reposition-double-tap'), [{ state: State.BEGAN, x: 200, y: 260 }, { state: State.ACTIVE, x: 200, y: 260 }, { state: State.END, x: 200, y: 260 }])
    })
    expect((await use(onUse)).width).toBeCloseTo(full.width / 2, -1)
    await act(async () => {
      fireGestureHandler(getByGestureTestId('reposition-double-tap'), [{ state: State.BEGAN, x: 200, y: 260 }, { state: State.ACTIVE, x: 200, y: 260 }, { state: State.END, x: 200, y: 260 }])
    })
    expect(await use(onUse)).toEqual(full)

    // Dragged off the middle, a tap puts it back.
    await act(async () => {
      fireGestureHandler(getByGestureTestId('reposition-pan'), [{ state: State.BEGAN }, { state: State.ACTIVE, translationX: 0, changeX: 0, changeY: 0 }, { translationX: 80, changeX: 80, changeY: 0 }, { state: State.END, translationX: 80, changeX: 0, changeY: 0 }])
    })
    expect(await use(onUse)).not.toEqual(full)
    await act(async () => {
      fireGestureHandler(getByGestureTestId('reposition-tap'), [{ state: State.BEGAN }, { state: State.ACTIVE }, { state: State.END }])
    })
    expect(await use(onUse)).toEqual(full)
  })

  it('M2: a screen reader hears the zoom, and can move the photo in tenths of the frame, held where it covers', async () => {
    const { onUse } = await mount()
    const frame = () => screen.getByTestId('reposition-frame')
    expect(frame().props.accessibilityValue).toEqual({ text: 'Zoom 1 times' })
    await act(async () => frame().props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }))
    expect(frame().props.accessibilityValue).toEqual({ text: 'Zoom 1.5 times' })
    expect(frame().props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual(['increment', 'decrement', 'moveLeft', 'moveRight', 'moveUp', 'moveDown'])

    const before = await use(onUse)
    await act(async () => frame().props.onAccessibilityAction({ nativeEvent: { actionName: 'moveRight' } }))
    const after = await use(onUse)
    expect(after.originX).toBeLessThan(before.originX)
    // A great many moves stop at the edge of the photo: the frame is never left showing past it.
    for (let i = 0; i < 40; i++) await act(async () => frame().props.onAccessibilityAction({ nativeEvent: { actionName: 'moveRight' } }))
    expect((await use(onUse)).originX).toBe(0)
  })

  it('H3: a small photo cannot be zoomed past what keeps its crop sharp', async () => {
    const small = { uri: 'file:///s.jpg', width: 200, height: 200 }
    const { onUse } = await mount(small)
    expect(maxZoomFor(small, FRAME)).toBe(1)
    const full = await use(onUse)
    await act(async () => screen.getByTestId('reposition-frame').props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }))
    expect(await use(onUse)).toEqual(full)
    expect(screen.getByTestId('reposition-frame').props.accessibilityValue).toEqual({ text: 'Zoom 1 times' })
  })

  it('the × closes it without choosing', async () => {
    const { onClose } = await mount()
    await fireEvent.press(screen.getByTestId('reposition-close'))
    expect(onClose).toHaveBeenCalled()
  })
})
