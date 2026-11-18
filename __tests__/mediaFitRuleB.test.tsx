/*
 * Media fit rule B (pulse-media board 11–13, owner 2026-11-17): an upload covers its frame only when its ratio is within
 * ±15% of the frame's; otherwise the whole upload is shown, contained over a blurred, dimmed copy of the same picture
 * (`ContainedCover`, LinkPreviewCard's look). Never another image behind it.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, StyleSheet } from 'react-native'

import { ContainedCover, FIT_TOLERANCE, fitFor } from '../components/ds/LinkPreviewCard'
import { COLOR } from '../lib/design/tokens'

const LEAD = { width: 345, height: 256 }
const SQUARE = { width: 345, height: 345 }
const VENUE = { width: 393, height: 300 }

describe('fitFor', () => {
  it.each([
    ['4:3 in the lead (1.33 vs 1.35)', { width: 4, height: 3 }, LEAD, 'cover'],
    ['1:1 in the square hero', { width: 1, height: 1 }, SQUARE, 'cover'],
    ['4:3 in the venue hero (1.33 vs 1.31)', { width: 4, height: 3 }, VENUE, 'cover'],
    ['4:5 in the square hero (20% off)', { width: 4, height: 5 }, SQUARE, 'contain'],
    ['16:9 in the lead (32% off)', { width: 16, height: 9 }, LEAD, 'contain'],
    ['9:16 phone video anywhere', { width: 9, height: 16 }, VENUE, 'contain'],
    ['1:1 in the lead (26% off)', { width: 1, height: 1 }, LEAD, 'contain'],
  ] as const)('%s → %s', (_, media, frame, fit) => {
    expect(fitFor(media, frame)).toBe(fit)
  })

  it('±15% is inclusive at both ends, and one step past it contains', () => {
    expect(FIT_TOLERANCE).toBe(0.15)
    expect(fitFor({ width: 115, height: 100 }, SQUARE)).toBe('cover')
    expect(fitFor({ width: 85, height: 100 }, SQUARE)).toBe('cover')
    expect(fitFor({ width: 116, height: 100 }, SQUARE)).toBe('contain')
    expect(fitFor({ width: 84, height: 100 }, SQUARE)).toBe('contain')
  })

  it('an unknown size, or a frame not laid out yet, never crops', () => {
    expect(fitFor(null, SQUARE)).toBe('contain')
    expect(fitFor({ width: 0, height: 0 }, SQUARE)).toBe('contain')
    expect(fitFor({ width: 1, height: 1 }, { width: 0, height: 0 })).toBe('contain')
  })
})

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const prop = (id: string, name: string) => screen.getByTestId(id, { includeHiddenElements: true }).props[name]
const query = (id: string) => screen.queryByTestId(id, { includeHiddenElements: true })

async function laidOut(frame: { width: number; height: number }, media: { width: number; height: number } | null) {
  await act(async () => {
    fireEvent(screen.getByTestId('m-frame', { includeHiddenElements: true }), 'layout', { nativeEvent: { layout: { x: 0, y: 0, ...frame } } })
  })
  if (!media) return
  await act(async () => {
    prop('m', 'onLoad')({ nativeEvent: { source: { ...media, url: 'u', mediaType: null }, cacheType: 'none' } })
  })
}

describe('<ContainedCover auto>', () => {
  afterEach(() => jest.restoreAllMocks())

  it('before the picture says its size: the whole upload, over its own blurred copy', async () => {
    await render(<ContainedCover uri="https://x/a.jpg" auto testID="m" />)
    expect(prop('m', 'contentFit')).toBe('contain')
    expect(prop('m-blur', 'source')).toEqual([{ uri: 'https://x/a.jpg' }])
    expect(prop('m-blur', 'blurRadius')).toBeGreaterThan(0)
  })

  it('within ±15%: covers, 40% from the top (faces sit high), and draws no blurred copy', async () => {
    await render(<ContainedCover uri="https://x/a.jpg" auto testID="m" />)
    await laidOut(LEAD, { width: 1200, height: 900 })
    expect(prop('m', 'contentFit')).toBe('cover')
    expect(prop('m', 'contentPosition')).toEqual({ top: '40%', left: '50%' })
    expect(query('m-blur')).toBeNull()
  })

  it('outside ±15%: contains, over the SAME picture blurred and dimmed', async () => {
    await render(<ContainedCover uri="https://x/tall.jpg" auto testID="m" />)
    await laidOut(SQUARE, { width: 1080, height: 1920 })
    expect(prop('m', 'contentFit')).toBe('contain')
    expect(prop('m-blur', 'source')).toEqual([{ uri: 'https://x/tall.jpg' }])
    expect(flat('m-dim').backgroundColor).toMatch(/^rgba\(/)
  })

  it('Reduce Transparency: the fill is flat surfaceSunken, no blur', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(true)
    await render(<ContainedCover uri="https://x/tall.jpg" auto testID="m" />)
    await laidOut(SQUARE, { width: 1080, height: 1920 })
    expect(query('m-blur')).toBeNull()
    expect(flat('m-dim').backgroundColor).toBe(COLOR.surfaceSunken)
  })

  it('without `auto` (the share templates): always contained, whatever the ratio', async () => {
    await render(<ContainedCover uri="https://x/a.jpg" testID="m" />)
    expect(prop('m', 'contentFit')).toBe('contain')
    expect(query('m-blur')).not.toBeNull()
  })
})
