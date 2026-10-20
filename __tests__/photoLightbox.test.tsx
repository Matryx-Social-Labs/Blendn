/**
 * The lightbox's one exit: a named button, 44 pt or more, under the safe-area
 * top rather than at a fixed 56 (it sat under the Dynamic Island), and the page
 * is modal to a screen reader so Close is not buried behind the profile.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

const INSET_TOP = 59
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: INSET_TOP, bottom: 34, left: 0, right: 0 }),
}))
jest.mock('../components/motion/SwipeToDismiss', () => ({
  SwipeToDismiss: ({ children }: { children: React.ReactNode }) => children,
}))
jest.mock('../components/motion/ZoomableImage', () => ({ ZoomableImage: () => null }))

/* eslint-disable import/first */
import PhotoLightbox from '../components/PhotoLightbox'
import { SIZE, SPACE } from '../lib/design/tokens'
/* eslint-enable import/first */

const photos = ['a', 'b', 'c']

it('Close is a labelled button that closes', async () => {
  const onClose = jest.fn()
  await render(<PhotoLightbox photos={photos} visible onClose={onClose} />)
  const close = screen.getByRole('button', { name: 'Close' })
  fireEvent.press(close)
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('Close sits below the safe-area top, not at a fixed 56', async () => {
  await render(<PhotoLightbox photos={photos} visible onClose={jest.fn()} />)
  const holder = screen.getByRole('button', { name: 'Close' }).parent?.parent
  const placed = StyleSheet.flatten(holder?.props.style)
  expect(placed.top).toBe(INSET_TOP + SPACE.sm)
})

it('the circle is at least the 44 pt target', () => {
  expect(SIZE.circleButton).toBeGreaterThanOrEqual(44)
  expect(SIZE.circleButtonAndroid).toBeGreaterThanOrEqual(48)
})

it('says where you are in the set, once, as one label', async () => {
  await render(<PhotoLightbox photos={photos} visible onClose={jest.fn()} />)
  expect(screen.getByLabelText('Photo 1 of 3')).toBeTruthy()
})
