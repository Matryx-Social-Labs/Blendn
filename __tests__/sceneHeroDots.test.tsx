/**
 * The hero's pager dots sit in the image's bottom-right corner, under the caption, never on it. They were 126 pt up,
 * which only cleared a one-line title: a two-line title or wrapped pills put them on the words (owner, 2026-10-22).
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { HERO_CAPTION_FOOT, SceneHeroMedia } from '../components/scene/SceneHeroMedia'

jest.mock('expo-video', () => ({ useVideoPlayer: () => ({ addListener: () => ({ remove: () => {} }), play: () => {} }), VideoView: () => null }))

it('rides the bottom-right corner inside the band under the caption', async () => {
  const playlist = [
    { kind: 'image' as const, url: 'https://x.test/a.jpg' },
    { kind: 'image' as const, url: 'https://x.test/b.jpg' },
  ]
  await render(<SceneHeroMedia playlist={playlist} width={393} height={420} />)
  const dots = StyleSheet.flatten(screen.getByTestId('scene-hero-dots').props.style)
  const dotHeight = 6

  expect(dots.position).toBe('absolute')
  expect(dots.right).toBeGreaterThan(0)
  expect(dots.bottom).toBeGreaterThan(0)
  expect(dots.bottom + dotHeight).toBeLessThan(HERO_CAPTION_FOOT)
})
