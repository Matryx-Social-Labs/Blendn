/**
 * The hero's pager dots sit in the image's bottom-right corner, under the caption, never on it. They were 126 pt up,
 * which only cleared a one-line title: a two-line title or wrapped pills put them on the words (owner, 2026-10-22).
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, StyleSheet } from 'react-native'

import { MATERIAL, SPACE } from '../lib/design/tokens'

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
  // The pill included: it stays in the band.
  expect(dots.bottom + dotHeight + SPACE.xs * 2).toBeLessThan(HERO_CAPTION_FOOT)
})

it('sits on the scrim pill, so the dots read over a bright photo; denser with Reduce Transparency (RC drive 2 LOW)', async () => {
  const playlist = [
    { kind: 'image' as const, url: 'https://x.test/a.jpg' },
    { kind: 'image' as const, url: 'https://x.test/b.jpg' },
  ]
  await render(<SceneHeroMedia playlist={playlist} width={393} height={420} />)
  expect(StyleSheet.flatten(screen.getByTestId('scene-hero-dots').props.style)).toMatchObject({ backgroundColor: MATERIAL.scrimPill })
  await screen.unmount()
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(true)
  await render(<SceneHeroMedia playlist={playlist} width={393} height={420} />)
  expect(StyleSheet.flatten((await screen.findByTestId('scene-hero-dots')).props.style).backgroundColor).toBe(MATERIAL.scrimPillReduceTransparency)
})
