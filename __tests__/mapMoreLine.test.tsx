/*
 * "+N more · Zoom in" (pulse-map sheet 16, PICKED A by the advisor 2026-11-20): a glass capsule under the top bar when the
 * server has more in the map's box than it drew. A button at any zoom it can still go in from; plain text at the deepest.
 */
import { Dimensions } from 'react-native'
import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { MoreLine } from '../components/home/MoreLine'

// The jest window reads fontScale 2 by default (`axTextSize.test.tsx`): set it as the phone would, and put it back.
const window = { width: 402, height: 874, scale: 3, fontScale: 2 }
const atScale = (fontScale: number) => act(async () => Dimensions.set({ window: { ...window, fontScale }, screen: { ...window, fontScale } }))

describe('MoreLine', () => {
  afterEach(() => atScale(2))

  it('says the count and Zoom in, is one button with the whole number, and zooms in on a tap', async () => {
    await atScale(1)
    const onZoomIn = jest.fn()
    await render(<MoreLine line={{ text: '+12k more', zoomIn: true, label: '12,480 more events in this view. Zoom in' }} top={100} onZoomIn={onZoomIn} />)
    const button = screen.getByRole('button', { name: '12,480 more events in this view. Zoom in' })
    expect(screen.getByText(/\+12k more/)).toBeTruthy()
    expect(screen.getByText(/Zoom in/)).toBeTruthy()
    await fireEvent.press(button)
    expect(onZoomIn).toHaveBeenCalledTimes(1)
  })

  it('at the deepest zoom: the count as plain text, no button, no Zoom in', async () => {
    await atScale(1)
    await render(<MoreLine line={{ text: '+130 more', zoomIn: false, label: '130 more events in this view' }} top={100} onZoomIn={jest.fn()} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText(/Zoom in/)).toBeNull()
    expect(screen.getByLabelText('130 more events in this view')).toBeTruthy()
  })

  it('at the largest text "· Zoom in" goes before the count is ever cut; still a button that says it', async () => {
    await atScale(3.1)
    await render(<MoreLine line={{ text: '+12k more', zoomIn: true, label: '12,480 more events in this view. Zoom in' }} top={100} onZoomIn={jest.fn()} />)
    expect(screen.queryByText(/Zoom in/)).toBeNull()
    expect(screen.getByRole('button', { name: '12,480 more events in this view. Zoom in' })).toBeTruthy()
  })

  it('takes no touches outside its own box: the row it sits in passes them to the map', async () => {
    await atScale(1)
    await render(<MoreLine line={{ text: '+130 more', zoomIn: true, label: '130 more events in this view. Zoom in' }} top={100} onZoomIn={jest.fn()} />)
    expect(screen.getByTestId('map-more-row').props.pointerEvents).toBe('box-none')
  })

  it('draws nothing with no line', async () => {
    await render(<MoreLine line={null} top={100} onZoomIn={jest.fn()} />)
    expect(screen.queryByTestId('map-more-row')).toBeNull()
  })
})
