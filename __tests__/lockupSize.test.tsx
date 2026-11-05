/*
 * The landing's Lockup (Flow 1b) at the galaxies board's size: 60 pt tall, the art's own width (≈200 pt). Its cap was
 * `maxWidth: '86%'`, a percentage of a parent that shrink-wraps the image: Yoga resolved it against the image's own
 * width and drew it at 86% (the mockup diff, 2026-11-05: wordmark 120 × 32 pt against the board's 139 × 37.5). The cap is
 * now a number, 86% of the window's content width, so it only bites on a narrow screen.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { Lockup } from '../components/onboarding/Lockup'
import { SPACE } from '../lib/design/tokens'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const windowHook = require('react-native/Libraries/Utilities/useWindowDimensions')
const at = (width: number) => jest.spyOn(windowHook, 'default').mockReturnValue({ width, height: 874, scale: 3, fontScale: 1 })
afterEach(() => jest.restoreAllMocks())

const image = () => StyleSheet.flatten(screen.getByTestId('l-image', { includeHiddenElements: true }).props.style)

it('on a phone: 60 tall at the art’s own width, and no percentage anywhere in its size', async () => {
  at(402)
  await render(<Lockup size="landing" testID="l" />)
  const style = image()
  expect(style.height).toBe(60)
  expect(style.width).toBeCloseTo(60 * (674 / 202), 0)
  expect(typeof style.maxWidth).toBe('number')
})

it('on a narrow screen the cap bites: 86% of the content width', async () => {
  at(220)
  await render(<Lockup size="landing" testID="l" />)
  expect(image().maxWidth).toBeCloseTo(0.86 * (220 - 2 * SPACE.gutter), 5)
})
