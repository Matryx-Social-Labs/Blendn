/*
 * Video fills its card (owner 2026-11-18, pulse-media NOTES "video fills the card"): a clip is cover-cropped to the card,
 * centred, at any ratio, as Instagram, Netflix, Airbnb and TikTok do: no bars, no blurred copy. Its poster is cropped the
 * same way (cover, centred: AVLayerVideoGravityResizeAspectFill and RESIZE_MODE_ZOOM both centre), so the swap from poster
 * to clip does not move the picture. Stills keep fit rule B: a flyer is never cut.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import React from 'react'
import { View } from 'react-native'

let mockReduce = false
jest.mock('../lib/motion', () => ({ ...jest.requireActual('../lib/motion'), useReducedMotion: () => mockReduce }))
jest.mock('../lib/mediaSaver', () => ({ useMediaSaver: () => ({ lowPower: false, expensiveNetwork: false }) }))
jest.mock('../lib/haptics', () => ({ H: new Proxy({}, { get: () => jest.fn() }) }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
const mockPlayer = { play: jest.fn(), pause: jest.fn(), addListener: () => ({ remove: () => {} }), loop: false, muted: false, duration: 12 }
jest.mock('expo-video', () => ({
  useVideoPlayer: () => mockPlayer,
  VideoView: (props: object) => {
    const { View: V } = jest.requireActual('react-native')
    return <V {...props} testID="clip" />
  },
}))
jest.mock('expo-image', () => {
  const { View: V } = jest.requireActual('react-native')
  const Image = (p: { testID?: string; source?: { uri?: string } }) => <V {...p} accessibilityLabel={p.source?.uri} />
  return { Image: Object.assign(Image, { prefetch: jest.fn(async () => true) }) }
})

/* eslint-disable import/first */
import { LeadPager, type LeadCard } from '../components/pulse/LeadPager'
import { SceneHero } from '../components/scene/SceneHero'
import { SceneHeroMedia } from '../components/scene/SceneHeroMedia'
import { STILL_MS } from '../lib/featuredLap'
import type { FeedMediaItem } from '../lib/feedMedia'
/* eslint-enable import/first */

const CLIP = 'https://cdn.example/clip.mp4'
const POSTER = 'https://cdn.example/first-frame.jpg'
const STILL = 'https://cdn.example/flyer.jpg'
const SQUARE = { width: 345, height: 345 }
const LEAD = { width: 345, height: 256 }
const RATIOS = [
  ['9:16', { width: 1080, height: 1920 }],
  ['1:1', { width: 1080, height: 1080 }],
  ['16:9', { width: 1920, height: 1080 }],
  ['4:5', { width: 1080, height: 1350 }],
] as const

const all = (id: string) => screen.queryAllByTestId(id, { includeHiddenElements: true })
const one = (id: string) => screen.getByTestId(id, { includeHiddenElements: true })
/** Every blurred copy on screen, by its picture: rule B's fill. A clip's poster never has one. */
const fills = () => all('media-still-blur').map((n) => n.props.accessibilityLabel as string)

/** The frame lays out, then the picture loads at `size` (what decides rule B). */
async function settle(frame: { width: number; height: number }, size: { width: number; height: number }) {
  for (const f of all('media-still-frame')) {
    await act(async () => fireEvent(f, 'layout', { nativeEvent: { layout: { x: 0, y: 0, ...frame } } }))
  }
  for (const n of [...all('media-still'), ...all('media-poster')]) {
    await act(async () => n.props.onLoad?.({ source: { ...size, url: 'u', mediaType: null }, cacheType: 'none' }))
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockReduce = false
})

describe('the event hero', () => {
  const hero = (item: FeedMediaItem) => <SceneHeroMedia playlist={[item]} width={SQUARE.width} height={SQUARE.height} autoAdvance={false} pips="center" />

  it.each(RATIOS)('a %s clip covers the square, centred, on a TextureView; its poster is cropped the same way, no blur', async (_, size) => {
    await render(hero({ kind: 'video', url: CLIP, posterUrl: POSTER }))
    await settle(SQUARE, size)
    expect(one('clip').props.contentFit).toBe('cover')
    expect(one('clip').props.surfaceType).toBe('textureView')
    expect(one('media-poster').props.contentFit).toBe('cover')
    // Centred, as the player crops: rule B's 40%-from-top focus would put the poster's frame 10% higher than the clip's.
    expect(one('media-poster').props.contentPosition ?? 'center').toBe('center')
    expect(fills()).toEqual([])
  })

  it.each([
    ['9:16', RATIOS[0][1], 'contain'],
    ['1:1', RATIOS[1][1], 'cover'],
    ['16:9', RATIOS[2][1], 'contain'],
    ['4:5', RATIOS[3][1], 'contain'],
  ] as const)('control: a %s still keeps fit rule B (%s)', async (_, size, fit) => {
    await render(hero({ kind: 'image', url: STILL }))
    await settle(SQUARE, size)
    expect(one('media-still').props.contentFit).toBe(fit)
    expect(fills()).toEqual(fit === 'contain' ? [STILL] : [])
  })

  it('the poster stays under the playing clip (no bars to show it), so a stall or a reload never flashes black', async () => {
    await render(hero({ kind: 'video', url: CLIP, posterUrl: POSTER }))
    expect(all('clip')).toHaveLength(1)
    expect(all('media-poster').map((n) => n.props.accessibilityLabel)).toEqual([POSTER])
  })

  it('the pips and the Play control are drawn over the clip, not under it', async () => {
    await render(
      <View>
        <SceneHero playlist={[{ kind: 'video', url: CLIP, posterUrl: null }, { kind: 'image', url: STILL }]} title="Rooftop Sundowner" stamp={null} venueLine="Bengaluru" />
      </View>
    )
    const order = testIDsInOrder()
    expect(order.indexOf('clip')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('scene-hero-pips')).toBeGreaterThan(order.indexOf('clip'))
    expect(order.indexOf('scene-hero-playback')).toBeGreaterThan(order.indexOf('clip'))
  })

  describe('under Reduce Motion (#571: the first frame, nothing plays)', () => {
    beforeEach(() => {
      mockReduce = true
    })
    const sceneHero = (item: FeedMediaItem) => (
      <View>
        <SceneHero playlist={[item]} title="Rooftop Sundowner" stamp={null} venueLine="Bengaluru" />
      </View>
    )

    it('the hero is the poster, cropped as the clip will be; Play mounts the clip, covering', async () => {
      await render(sceneHero({ kind: 'video', url: CLIP, posterUrl: POSTER }))
      expect(all('clip')).toHaveLength(0)
      expect(one('media-poster').props.contentFit).toBe('cover')
      await act(async () => fireEvent.press(screen.getByTestId('scene-hero-playback')))
      expect(one('clip').props.contentFit).toBe('cover')
    })

    it('a clip with no poster mounts paused: its own first frame, covering, is the picture', async () => {
      await render(sceneHero({ kind: 'video', url: CLIP, posterUrl: null }))
      expect(one('clip').props.contentFit).toBe('cover')
      expect(mockPlayer.play).not.toHaveBeenCalled()
      expect(mockPlayer.pause).toHaveBeenCalled()
    })
  })
})

describe('the Pulse Featured lead', () => {
  const card = (id: string, playlist?: FeedMediaItem[]): LeadCard => ({ id, title: `Night ${id}`, time: '9 PM', venue: 'Pebble', cover: STILL, playlist })
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())
  async function wait(ms: number) {
    for (let left = ms; left > 0; left -= 500) await act(async () => jest.advanceTimersByTime(Math.min(500, left)))
  }
  const lead = (cards: LeadCard[]) => render(<LeadPager cards={cards} width={LEAD.width} height={LEAD.height} onOpen={jest.fn()} />)

  it.each(RATIOS)('a %s clip in its turn covers the card on a TextureView; its poster is cropped the same way', async (_, size) => {
    await lead([card('a', [{ kind: 'image', url: STILL }, { kind: 'video', url: CLIP, posterUrl: POSTER }]), card('b')])
    await wait(STILL_MS + 1000)
    await settle(LEAD, size)
    expect(one('clip').props.contentFit).toBe('cover')
    expect(one('clip').props.surfaceType).toBe('textureView')
    expect(one('media-poster').props.contentFit).toBe('cover')
    expect(one('media-poster').props.contentPosition ?? 'center').toBe('center')
    // The cover underneath is a still: rule B is free to blur it; the clip's poster has no blurred copy.
    expect(fills()).not.toContain(POSTER)
  })

  it('a clip first in the playlist: the floor under it is its poster, covering, not rule B', async () => {
    await lead([card('a', [{ kind: 'video', url: CLIP, posterUrl: POSTER }, { kind: 'image', url: STILL }]), card('b')])
    await settle(LEAD, RATIOS[0][1])
    expect(one('clip').props.contentFit).toBe('cover')
    expect(all('media-poster').map((n) => n.props.contentFit)).toEqual(['cover'])
    expect(fills()).toEqual([])
  })

  it('control: the lead’s 16:9 cover still keeps rule B (contained over its own blur)', async () => {
    await lead([card('a', [{ kind: 'image', url: STILL }, { kind: 'video', url: CLIP, posterUrl: POSTER }]), card('b')])
    await settle(LEAD, RATIOS[2][1])
    expect(all('media-still').map((n) => n.props.contentFit)).toEqual(['contain'])
    expect(fills()).toEqual([STILL])
  })

  it('the rotation scrim is drawn over the clip, so the words hold over a cropped frame', async () => {
    await lead([card('a', [{ kind: 'image', url: STILL }, { kind: 'video', url: CLIP, posterUrl: POSTER }]), card('b')])
    await wait(STILL_MS + 1000)
    const order = testIDsInOrder()
    expect(order.indexOf('clip')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('pulse-lead-card-0-scrim')).toBeGreaterThan(order.indexOf('clip'))
  })

  it('under Reduce Motion no clip mounts, and the turn shows the poster covering', async () => {
    mockReduce = true
    await lead([card('a', [{ kind: 'video', url: CLIP, posterUrl: POSTER }, { kind: 'image', url: STILL }]), card('b')])
    await wait(STILL_MS * 3)
    expect(all('clip')).toHaveLength(0)
    expect(one('media-poster').props.contentFit).toBe('cover')
  })
})

/** Every testID in the rendered tree, in drawing order (later is on top). */
function testIDsInOrder(): string[] {
  const out: string[] = []
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach(walk)
    const node = n as { props?: { testID?: string }; children?: unknown[] }
    if (node.props?.testID) out.push(node.props.testID)
    node.children?.forEach(walk)
  }
  walk(screen.toJSON())
  return out
}

describe('every card that plays video covers (source guard)', () => {
  const ROOT = join(__dirname, '..')
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : []
    })
  /** Each `<VideoView …>` element's attributes, by file. */
  const views = ['app', 'components'].flatMap((d) =>
    files(join(ROOT, d)).flatMap((path) => [...readFileSync(path, 'utf8').matchAll(/<VideoView\b([\s\S]*?)\/>/g)].map((m) => ({ path, attrs: m[1] })))
  )
  // The lightbox is a viewer, not a card: it shows the whole frame, as every product's full-screen viewer does.
  const VIEWERS = ['components/scene/SceneLightbox.tsx']
  const isViewer = (path: string) => VIEWERS.some((v) => path.endsWith(v))

  it('finds the players it guards', () => {
    expect(views.filter((v) => !isViewer(v.path)).length).toBeGreaterThanOrEqual(2)
  })

  it('every card player is contentFit="cover" (a literal, never a per-clip fit) on a TextureView', () => {
    const bad = views.filter((v) => !isViewer(v.path) && !(/contentFit="cover"/.test(v.attrs) && /surfaceType="textureView"/.test(v.attrs)))
    expect(bad.map((v) => v.path.slice(ROOT.length + 1))).toEqual([])
  })

  it('control: the scan reads the attribute (the lightbox is contain, and is the only one)', () => {
    const contained = views.filter((v) => /contentFit="contain"/.test(v.attrs)).map((v) => v.path.slice(ROOT.length + 1))
    expect(contained).toEqual(VIEWERS)
  })
})
