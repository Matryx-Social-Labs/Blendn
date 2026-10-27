/**
 * The Scene's lightbox is a plain Modal that takes its turn; a link is somewhere new to go (RC drive 6), so it closes
 * the lightbox through its own close (lib/modalTurn `useClosedByLink`). Negative control: SceneLightbox without
 * `closeForLink` in its `useQueuedModal` fails the first test.
 */
import React from 'react'
import { act, render } from '@testing-library/react-native'

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }))
jest.mock('expo-video', () => ({ useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn() }), VideoView: () => null }))
jest.mock('../components/motion/ZoomableImage', () => ({ ZoomableImage: () => null }))

/* eslint-disable import/first */
import { SceneLightbox } from '../components/scene/SceneLightbox'
import type { FeedMediaItem } from '../lib/feedMedia'
import { dismissModals } from '../lib/pendingRoute'
/* eslint-enable import/first */

const items: FeedMediaItem[] = [{ kind: 'image', url: 'https://x/a.jpg' }]

it('a link closes the open lightbox through its own close', async () => {
  const onClose = jest.fn()
  await render(<SceneLightbox items={items} visible onClose={onClose} />)
  await act(async () => dismissModals())
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('a closed lightbox is not asked', async () => {
  const onClose = jest.fn()
  await render(<SceneLightbox items={items} visible={false} onClose={onClose} />)
  await act(async () => dismissModals())
  expect(onClose).not.toHaveBeenCalled()
})
