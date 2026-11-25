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
import { focusStyle } from '../lib/mediaFit'

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

  it('within ±15%: covers at the default focus the dashboard previews with (50% across, 40% down), and draws no blurred copy', async () => {
    await render(<ContainedCover uri="https://x/a.jpg" auto testID="m" />)
    // 1200×900 into 345×256 (4:3 in 1.35): scale 0.2875 → drawn 345 × 258.75, overflow 2.75; (0.4 × 258.75 − 128) / 2.75 < 0 → 0%.
    await laidOut(LEAD, { width: 1200, height: 900 })
    expect(prop('m', 'contentFit')).toBe('cover')
    expect(prop('m', 'contentPosition')).toEqual(focusStyle({ width: 1200, height: 900 }, LEAD, null))
    expect(prop('m', 'contentPosition')).toEqual({ left: '50%', top: '0%' })
    expect(query('m-blur')).toBeNull()
  })

  it("a size the server sent: the fit is known once the frame is, before the picture's bytes land (no reflow)", async () => {
    await render(<ContainedCover uri="https://x/a.jpg" auto size={{ width: 1200, height: 900 }} testID="m" />)
    await laidOut(LEAD, null)
    expect(prop('m', 'contentFit')).toBe('cover')
    expect(query('m-blur')).toBeNull()
  })

  it("the organizer's point moves the crop, as the dashboard's preview does", async () => {
    // A square into the square hero has nothing to crop; 1000×1100 (10% taller) does, on the vertical axis.
    await render(<ContainedCover uri="https://x/a.jpg" auto size={{ width: 1000, height: 1100 }} focus={{ x: 0.5, y: 0.95 }} testID="m" />)
    await laidOut(SQUARE, null)
    expect(prop('m', 'contentPosition')).toEqual({ left: '50%', top: '100%' })
  })

  it('negative control: a point is ignored when rule B shows the picture whole', async () => {
    await render(<ContainedCover uri="https://x/tall.jpg" auto size={{ width: 1080, height: 1920 }} focus={{ x: 0.5, y: 0.95 }} testID="m" />)
    await laidOut(SQUARE, null)
    expect(prop('m', 'contentFit')).toBe('contain')
    // expo-image reads no position as the centre: never the point's.
    expect(prop('m', 'contentPosition')).not.toMatchObject({ top: '100%' })
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
