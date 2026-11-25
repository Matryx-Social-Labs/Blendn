/*
 * "You" on the Pulse map (pulse-map 06, owner 2026-11-17): violet (Foundations C), never ember or rose. Precise: a dot
 * with a white ring and the fix's real accuracy as a halo. Approximate (iOS Precise off): a soft circle, no dot. Stale
 * (> 10 min): a grey dot. Off or denied: nothing.
 */
import { render } from '@testing-library/react-native'
import React from 'react'

type Props = Record<string, unknown> & { id?: string; children?: React.ReactNode }
const mockLayers: Props[] = []
const mockSources: Props[] = []
const mockImages: Props[] = []
let mockFacing: { deg: number; width: number } | null = null
let mockReduceMotion = false
const mockUseHeading = jest.fn()
jest.mock('../lib/useHeading', () => ({ useHeading: (a: unknown) => (mockUseHeading(a), mockFacing) }))
jest.mock('../lib/motion', () => ({ useReducedMotion: () => mockReduceMotion }))
jest.mock('@maplibre/maplibre-react-native', () => ({
  Images: (p: Props) => {
    mockImages.push(p)
    return null
  },
  GeoJSONSource: (p: Props) => {
    mockSources.push(p)
    return p.children ?? null
  },
  Layer: (p: Props) => {
    mockLayers.push(p)
    return null
  },
}))

/* eslint-disable import/first */
import { YouBeam, YouMark, haloRadius } from '../components/home/YouMark'
import { DURATION } from '../lib/design/tokens'
import { MAP_THEME } from '../lib/mapTheme'
/* eslint-enable import/first */

const NOW = Date.parse('2026-11-18T10:00:00Z')
const fix = (over: object = {}) => ({ latitude: 12.97, longitude: 77.6, accuracy: 18, timestamp: NOW - 2000, ...over })
const ids = () => mockLayers.map((l) => l.id)
const paint = (id: string) => mockLayers.find((l) => l.id === id)?.paint as Record<string, unknown> | undefined

beforeEach(() => {
  mockLayers.length = 0
  mockSources.length = 0
  mockImages.length = 0
  mockFacing = null
  mockReduceMotion = false
  mockUseHeading.mockClear()
})

it('precise: the violet dot with a white ring, and the real accuracy as its halo', async () => {
  await render(
    <>
      <YouMark part="halo" fix={fix()} sharing now={NOW} />
      <YouMark part="dot" fix={fix()} sharing now={NOW} />
    </>
  )
  expect(ids()).toEqual(['you-halo', 'you-dot'])
  // Two sources, so the dot can be drawn above the piles while the halo stays under them (drive: you hid under a "13").
  expect(mockSources.map((s) => s.id)).toEqual(['you', 'you-dot'])
  expect(paint('you-dot')).toMatchObject({ 'circle-color': MAP_THEME.you.dot, 'circle-stroke-color': MAP_THEME.you.ring })
  expect(paint('you-halo')?.['circle-radius']).toEqual(haloRadius(18, 12.97))
})

it('approximate: a soft circle, no dot', async () => {
  await render(
    <>
      <YouMark part="halo" fix={fix({ accuracy: 3000, approximate: true })} sharing now={NOW} />
      <YouMark part="dot" fix={fix({ accuracy: 3000, approximate: true })} sharing now={NOW} />
    </>
  )
  expect(ids()).toEqual(['you-halo'])
  expect(paint('you-halo')).toMatchObject({ 'circle-stroke-color': MAP_THEME.you.approximateEdge })
})

it('stale past 10 minutes: grey, never violet', async () => {
  await render(<YouMark part="dot" fix={fix({ timestamp: NOW - 25 * 60_000 })} sharing now={NOW} />)
  expect(paint('you-dot')).toMatchObject({ 'circle-color': MAP_THEME.you.stale })
})

it.each([
  ['sharing off in Blend’n', { fix: fix(), sharing: false }],
  ['no fix (denied, or not yet)', { fix: null, sharing: true }],
])('%s: nothing is drawn', async (_, p) => {
  await render(<YouMark part="dot" {...p} now={NOW} />)
  expect(mockSources).toHaveLength(0)
})

it('the halo is metres on the ground at every zoom, at the fix’s latitude (control: twice the accuracy, twice the radius)', () => {
  const r = (m: number) => haloRadius(m, 12.97) as unknown as [string, unknown, unknown, number, number, number, number]
  expect(r(18)[0]).toBe('interpolate')
  expect(r(36)[4]).toBeCloseTo(r(18)[4] * 2)
  expect(r(36)[6]).toBeCloseTo(r(18)[6] * 2)
})

describe('the heading beam (pulse-map 14 A, picked 2026-11-20, SCRUM-1089)', () => {
  const layout = (id: string) => mockLayers.find((l) => l.id === id)?.layout as Record<string, unknown> | undefined
  const opacity = (id: string) => paint(id)?.['icon-opacity']
  const beam = (p: Partial<React.ComponentProps<typeof YouBeam>> = {}) =>
    render(<YouBeam fix={fix()} sharing now={NOW} focused {...p} />)

  it('three widths, one image each, drawn as one: the width the compass is sure of shows, the others wait at 0', async () => {
    mockFacing = { deg: 30, width: 70 }
    await beam()
    expect(Object.keys(mockImages[0].images as object)).toEqual(['you-beam-40', 'you-beam-70', 'you-beam-100'])
    expect(ids()).toEqual(['you-beam-40', 'you-beam-70', 'you-beam-100'])
    expect([opacity('you-beam-40'), opacity('you-beam-70'), opacity('you-beam-100')]).toEqual([0, 1, 0])
  })

  it('points at the true heading against north, so the map turning (by hand, or a camera move) never turns it', async () => {
    mockFacing = { deg: 212, width: 40 }
    await beam()
    // `map` rotation alignment: MapLibre turns the icon by the map's own bearing; the app never does sums with the camera.
    expect(layout('you-beam-40')).toMatchObject({ 'icon-image': 'you-beam-40', 'icon-rotate': 212, 'icon-rotation-alignment': 'map' })
  })

  it('stands up off the tilted map (viewport pitch: lying flat at 55° it was a sliver), and never hides a label or a pin', async () => {
    mockFacing = { deg: 30, width: 40 }
    await beam()
    expect(layout('you-beam-40')).toMatchObject({ 'icon-pitch-alignment': 'viewport', 'icon-allow-overlap': true, 'icon-ignore-placement': true })
  })

  it('takes no touches: its source has no onPress, so a tap under it reaches the pin', async () => {
    mockFacing = { deg: 30, width: 40 }
    await beam()
    expect(mockSources).toHaveLength(1)
    expect(mockSources[0].onPress).toBeUndefined()
  })

  it.each([
    ['approximate', fix({ accuracy: 3000, approximate: true })],
    ['stale', fix({ timestamp: NOW - 25 * 60_000 })],
  ])('%s: the compass is let go and the beam fades out over ~200 ms, never pops', async (_, f) => {
    mockFacing = null
    await beam({ fix: f })
    expect(mockUseHeading).toHaveBeenLastCalledWith(expect.objectContaining({ on: false }))
    expect(opacity('you-beam-40')).toBe(0)
    expect(paint('you-beam-40')?.['icon-opacity-transition']).toEqual({ duration: DURATION.base, delay: 0 })
  })

  it('a precise fix on a focused map watches the compass (control: unfocused does not)', async () => {
    await beam()
    expect(mockUseHeading).toHaveBeenLastCalledWith(expect.objectContaining({ on: true }))
    await beam({ focused: false })
    expect(mockUseHeading).toHaveBeenLastCalledWith(expect.objectContaining({ on: false }))
  })

  it('a width change cross-fades; under Reduce Motion it swaps at once', async () => {
    mockFacing = { deg: 30, width: 40 }
    await beam()
    expect(paint('you-beam-40')?.['icon-opacity-transition']).toEqual({ duration: DURATION.medium, delay: 0 })
    mockLayers.length = 0
    mockReduceMotion = true
    await beam()
    expect(paint('you-beam-40')?.['icon-opacity-transition']).toEqual({ duration: 0, delay: 0 })
  })

  it.each([
    ['sharing off', { sharing: false }],
    ['no fix', { fix: null }],
  ])('%s: nothing at all', async (_, p) => {
    await beam(p)
    expect(mockSources).toHaveLength(0)
  })

  it('tells the map which way you face for a screen reader, in eight words, and nothing when it cannot tell', async () => {
    const onFacing = jest.fn()
    mockFacing = { deg: 50, width: 40 }
    await beam({ onFacing })
    expect(onFacing).toHaveBeenLastCalledWith('north-east')
    mockFacing = null
    await beam({ onFacing })
    expect(onFacing).toHaveBeenLastCalledWith(null)
  })
})
