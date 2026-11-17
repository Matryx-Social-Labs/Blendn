/**
 * The event hero's clip shows a different picture around it (SCRUM-1066).
 *
 * The hero is `contain`: a 16:9 clip in the square letterboxes, and the player is transparent in the bars. The poster was
 * painted under every clip and stayed mounted while it played, and when the clip had no poster of its own the poster was
 * the event's cover. So the cover (another picture, at another ratio) filled the bars above and below the clip.
 *
 * Now the poster is the clip's own `thumbnail_url` or nothing, and it goes once the clip draws its first frame. Under fit
 * rule B (owner 2026-11-17) the bars show the poster's own blurred copy, the same picture (`ContainedCover`'s fill), which
 * stays under the clip; with no poster, the hero's dark surface. Until that frame (a stall, Reduce Motion) the poster
 * stays.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet, View } from 'react-native'

import { SceneHero } from '../components/scene/SceneHero'
import { SceneHeroMedia } from '../components/scene/SceneHeroMedia'
import { COLOR } from '../lib/design/tokens'
import { feedPlaylist, type FeedMediaItem } from '../lib/feedMedia'

const mockPlayer = { play: jest.fn(), pause: jest.fn(), addListener: () => ({ remove: () => {} }), loop: false, muted: false }
jest.mock('expo-video', () => ({
  useVideoPlayer: () => mockPlayer,
  VideoView: (props: object) => {
    const { View: V } = jest.requireActual('react-native')
    return <V {...props} testID="hero-clip" />
  },
}))
jest.mock('expo-image', () => ({
  Image: (p: { source?: { uri?: string | null }; blurRadius?: number }) => {
    const { View: V } = jest.requireActual('react-native')
    return <V testID={p.blurRadius ? 'hero-fill' : 'hero-still'} accessibilityLabel={p.source?.uri ?? 'no-uri'} />
  },
}))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
let mockReduce = false
jest.mock('../lib/motion', () => ({ ...jest.requireActual('../lib/motion'), useReducedMotion: () => mockReduce }))

const COVER = 'https://cdn.example/cover.jpg'
const CLIP_URL = 'https://cdn.example/clip.mp4'
const POSTER = 'https://cdn.example/first-frame.jpg'

const stills = () => screen.queryAllByTestId('hero-still').map((n) => n.props.accessibilityLabel as string)
/** Fit rule B's blurred copies: only ever of the picture on that page. */
const fills = () => screen.queryAllByTestId('hero-fill').map((n) => n.props.accessibilityLabel as string)
const firstFrame = async () => {
  await act(async () => {
    screen.getByTestId('hero-clip').props.onFirstFrameRender()
  })
}
const media = (playlist: FeedMediaItem[], over: Partial<React.ComponentProps<typeof SceneHeroMedia>> = {}) => (
  <SceneHeroMedia playlist={playlist} width={345} height={345} autoAdvance={false} pips="center" {...over} />
)

beforeEach(() => {
  jest.clearAllMocks()
  mockReduce = false
})

describe('the poster is the clip’s own, never the event cover', () => {
  it('a clip with no thumbnail gets no poster, though the event has a cover', () => {
    const clip = feedPlaylist([{ type: 'video', url: CLIP_URL, thumbnail_url: null, order: 0 }], COVER).find((i) => i.kind === 'video')
    expect(clip).toEqual({ kind: 'video', url: CLIP_URL, posterUrl: null })
  })

  it('nor in the detail route’s spelling', () => {
    const clip = feedPlaylist([{ type: 'video', url: CLIP_URL, thumbnailUrl: null, order: 0 }], COVER).find((i) => i.kind === 'video')
    expect(clip?.kind === 'video' && clip.posterUrl).toBeNull()
  })

  it('a clip with its own thumbnail keeps it (the control)', () => {
    const clip = feedPlaylist([{ type: 'video', url: CLIP_URL, thumbnail_url: POSTER, order: 0 }], COVER).find((i) => i.kind === 'video')
    expect(clip).toEqual({ kind: 'video', url: CLIP_URL, posterUrl: POSTER })
  })

  it('the cover is still in the playlist, as a still of its own', () => {
    const p = feedPlaylist([{ type: 'video', url: CLIP_URL, thumbnail_url: null, order: 0 }], COVER)
    expect(p).toContainEqual({ kind: 'image', url: COVER })
  })
})

describe('the poster under a playing clip', () => {
  it('is on screen until the clip draws its first frame, then unmounted; its blurred copy stays in the bars', async () => {
    await render(media([{ kind: 'video', url: CLIP_URL, posterUrl: POSTER }]))
    expect(screen.getByTestId('hero-clip')).toBeTruthy()
    expect(stills()).toEqual([POSTER])
    await firstFrame()
    expect(stills()).toEqual([])
    expect(fills()).toEqual([POSTER])
    expect(screen.getByTestId('hero-clip')).toBeTruthy()
  })

  it('the clip takes its poster’s fit: contained until the poster is known to be within ±15% of the square', async () => {
    await render(media([{ kind: 'video', url: CLIP_URL, posterUrl: POSTER }]))
    expect(screen.getByTestId('hero-clip').props.contentFit).toBe('contain')
    expect(screen.getByTestId('hero-clip').props.surfaceType).toBe('textureView')
  })

  it('a stall before the first frame keeps the poster', async () => {
    await render(media([{ kind: 'video', url: CLIP_URL, posterUrl: POSTER }]))
    await act(async () => {})
    expect(stills()).toEqual([POSTER])
  })

  it('with no poster, nothing is drawn under the clip: the hero’s dark surface shows', async () => {
    await render(
      <View>
        <SceneHero playlist={[{ kind: 'video', url: CLIP_URL, posterUrl: null }]} title="Rooftop Sundowner" stamp={null} venueLine="Bengaluru" />
      </View>
    )
    expect(screen.getByTestId('hero-clip')).toBeTruthy()
    expect(stills()).toEqual([])
    // The surface the bars show: the hero's clip frame.
    const frames = [] as string[]
    for (let n = screen.getByTestId('hero-clip').parent; n; n = n.parent) {
      const bg = (StyleSheet.flatten(n.props.style) as { backgroundColor?: string } | undefined)?.backgroundColor
      if (bg) frames.push(bg)
    }
    expect(frames[0]).toBe(COLOR.surfaceSunken)
  })

  it('comes back when the clip is taken down and mounted again, until its new first frame', async () => {
    const clip: FeedMediaItem[] = [{ kind: 'video', url: CLIP_URL, posterUrl: POSTER }]
    const view = await render(media(clip))
    await firstFrame()
    expect(stills()).toEqual([])
    // Paused before anybody chose to play it: the clip unmounts (the Reduce Motion rule) and the poster is the hero.
    await view.rerender(media(clip, { paused: true }))
    expect(screen.queryByTestId('hero-clip')).toBeNull()
    expect(stills()).toEqual([POSTER])
    // Mounted again: a new player at zero, so the poster holds until it has a frame.
    await view.rerender(media(clip, { paused: false }))
    expect(screen.getByTestId('hero-clip')).toBeTruthy()
    expect(stills()).toEqual([POSTER])
    await firstFrame()
    expect(stills()).toEqual([])
  })
})

describe('under Reduce Motion', () => {
  beforeEach(() => {
    mockReduce = true
  })

  it('the hero is the clip’s poster, and nothing plays', async () => {
    await render(
      <View>
        <SceneHero playlist={[{ kind: 'video', url: CLIP_URL, posterUrl: POSTER }]} title="Rooftop Sundowner" stamp={null} venueLine="Bengaluru" />
      </View>
    )
    expect(screen.queryByTestId('hero-clip')).toBeNull()
    expect(stills()).toEqual([POSTER])
  })

  /*
   * SCRUM-1066 option B (owner 2026-11-17): a clip with no poster of its own loads paused, so its own first frame is the
   * picture: never a dark square, never the event cover. Play still plays it, from that frame.
   */
  const hero = (playlist: FeedMediaItem[]) => (
    <View>
      <SceneHero playlist={playlist} title="Rooftop Sundowner" stamp={null} venueLine="Bengaluru" />
    </View>
  )

  it('a clip with no poster loads paused: its own first frame is the picture, and nothing plays', async () => {
    await render(hero([{ kind: 'video', url: CLIP_URL, posterUrl: null }]))
    expect(screen.getByTestId('hero-clip')).toBeTruthy()
    expect(mockPlayer.play).not.toHaveBeenCalled()
    expect(mockPlayer.pause).toHaveBeenCalled()
  })

  it('the clip’s page never draws the event cover, before or after its frame', async () => {
    await render(hero([{ kind: 'video', url: CLIP_URL, posterUrl: null }]))
    expect(stills()).toEqual([])
    await firstFrame()
    expect(stills()).toEqual([])
  })

  it('Play plays that same clip, from its frame (no new player)', async () => {
    await render(hero([{ kind: 'video', url: CLIP_URL, posterUrl: null }]))
    const clip = screen.getByTestId('hero-clip')
    await act(async () => {
      fireEvent.press(screen.getByTestId('scene-hero-playback'))
    })
    expect(screen.getByLabelText('Pause video')).toBeTruthy()
    expect(mockPlayer.play).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('hero-clip')).toBe(clip)
  })

  it('the control: a clip with its own poster still waits for Play, unmounted (no decoder until asked)', async () => {
    await render(hero([{ kind: 'video', url: CLIP_URL, posterUrl: POSTER }]))
    expect(screen.queryByTestId('hero-clip')).toBeNull()
    expect(mockPlayer.play).not.toHaveBeenCalled()
  })

  it('a still page is its picture', async () => {
    await render(
      <View>
        <SceneHero playlist={[{ kind: 'image', url: COVER }]} title="Rooftop Sundowner" stamp={null} venueLine="Bengaluru" />
      </View>
    )
    expect(stills()).toEqual([COVER])
  })
})
