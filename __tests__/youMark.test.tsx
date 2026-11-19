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
jest.mock('@maplibre/maplibre-react-native', () => ({
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
import { YouMark, haloRadius } from '../components/home/YouMark'
import { MAP_THEME } from '../lib/mapTheme'
/* eslint-enable import/first */

const NOW = Date.parse('2026-11-18T10:00:00Z')
const fix = (over: object = {}) => ({ latitude: 12.97, longitude: 77.6, accuracy: 18, timestamp: NOW - 2000, ...over })
const ids = () => mockLayers.map((l) => l.id)
const paint = (id: string) => mockLayers.find((l) => l.id === id)?.paint as Record<string, unknown> | undefined

beforeEach(() => {
  mockLayers.length = 0
  mockSources.length = 0
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
