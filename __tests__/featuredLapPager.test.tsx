/*
 * Featured C in the lead card (pulse-media 05–07, pulse-map 10; owner 2026-11-17): the lap advances by itself and lights
 * the next venue in place (`onLight`), never flying the camera (`onPage` is a swipe's alone); one lap, then it rests on
 * the first cover; a swipe or a touch on the map ends it; what pauses it; only the active card has a player.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AppState } from 'react-native'

let mockReduce = false
jest.mock('../lib/motion', () => ({ ...jest.requireActual('../lib/motion'), useReducedMotion: () => mockReduce }))
let mockSaver = { lowPower: false, expensiveNetwork: false }
jest.mock('../lib/mediaSaver', () => ({ useMediaSaver: () => mockSaver }))
jest.mock('../lib/haptics', () => ({ H: new Proxy({}, { get: () => jest.fn() }) }))
jest.mock('expo-image', () => ({ Image: Object.assign(() => null, { prefetch: jest.fn(async () => true) }) }))
const mockPlayer = { play: jest.fn(), pause: jest.fn(), addListener: () => ({ remove: () => {} }), loop: false, muted: false }
jest.mock('expo-video', () => ({
  useVideoPlayer: () => mockPlayer,
  VideoView: (props: object) => {
    const { View } = jest.requireActual('react-native')
    return <View {...props} testID="lead-clip" />
  },
}))

/* eslint-disable import/first */
import { LeadPager, type LeadCard } from '../components/pulse/LeadPager'
import { BARE_TURN_MS, STILL_MS } from '../lib/featuredLap'
/* eslint-enable import/first */

const card = (id: string, extra: Partial<LeadCard> = {}): LeadCard => ({ id, title: `Night ${id}`, time: '9 PM', venue: 'Pebble', ...extra })
const THREE = [card('a'), card('b'), card('c')]

/** The clock, in slices: each step commits (and arms its next timer) before the clock moves on. */
async function wait(ms: number) {
  for (let left = ms; left > 0; left -= 500) {
    await act(async () => {
      jest.advanceTimersByTime(Math.min(500, left))
    })
  }
}

beforeEach(() => {
  jest.useFakeTimers()
  mockReduce = false
  mockSaver = { lowPower: false, expensiveNetwork: false }
})
afterEach(() => jest.useRealTimers())

async function draw(over: Partial<React.ComponentProps<typeof LeadPager>> = {}) {
  const onLight = jest.fn()
  const onPage = jest.fn()
  const view = await render(<LeadPager cards={THREE} width={345} height={256} onOpen={jest.fn()} onLight={onLight} onPage={onPage} {...over} />)
  return { onLight, onPage, view }
}

it('advances by itself and lights the next venue in place: the camera never flies on auto', async () => {
  const { onLight, onPage } = await draw()
  await wait(BARE_TURN_MS - 1)
  expect(onLight).not.toHaveBeenCalled()
  await wait(1)
  expect(onLight).toHaveBeenLastCalledWith(1)
  expect(onPage).not.toHaveBeenCalled()
})

it('one lap, then it rests on the first cover and offers Play again; nothing moves after', async () => {
  const { onLight } = await draw()
  await wait(BARE_TURN_MS * 3)
  expect(onLight.mock.calls.map((c) => c[0])).toEqual([1, 2, 0])
  expect(screen.getByLabelText('Play featured again')).toBeTruthy()
  await wait(BARE_TURN_MS * 5)
  expect(onLight).toHaveBeenCalledTimes(3)
  // Play runs a new lap from the first cover.
  await act(async () => fireEvent.press(screen.getByTestId('pulse-lead-play')))
  await wait(BARE_TURN_MS)
  expect(onLight).toHaveBeenLastCalledWith(1)
})

it('a swipe flies (onPage) and ends the lap for the visit', async () => {
  const { onLight, onPage } = await draw()
  await act(async () => fireEvent(screen.getByTestId('pulse-lead'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } }))
  expect(onPage).toHaveBeenLastCalledWith(1)
  await wait(BARE_TURN_MS * 4)
  expect(onLight).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Play featured')).toBeTruthy()
})

it.each([
  ['a touch on the map (this visit)', { tookOver: true }],
  ['the lead off screen (drawer, scroll, tab)', { visible: false }],
  ['a screen reader', { screenReader: true }],
])('%s: nothing advances', async (_, over) => {
  const { onLight } = await draw(over)
  await wait(BARE_TURN_MS * 4)
  expect(onLight).not.toHaveBeenCalled()
})

it('Reduce Motion: nothing advances on its own; Play is offered', async () => {
  mockReduce = true
  const { onLight } = await draw()
  await wait(BARE_TURN_MS * 4)
  expect(onLight).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Play featured')).toBeTruthy()
})

it('a finger on the card holds the lap; lifting it lets go', async () => {
  const { onLight } = await draw()
  await act(async () => fireEvent(screen.getByTestId('pulse-lead'), 'touchStart'))
  await wait(BARE_TURN_MS * 2)
  expect(onLight).not.toHaveBeenCalled()
  await act(async () => fireEvent(screen.getByTestId('pulse-lead'), 'touchEnd'))
  await wait(BARE_TURN_MS)
  expect(onLight).toHaveBeenLastCalledWith(1)
})

it('the app in the background: nothing advances', async () => {
  let change: (s: string) => void = () => {}
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_e, fn) => {
    change = fn as (s: string) => void
    return { remove: () => {} } as never
  })
  const { onLight } = await draw()
  await act(async () => change('background'))
  await wait(BARE_TURN_MS * 3)
  expect(onLight).not.toHaveBeenCalled()
  jest.restoreAllMocks()
})

it('Pause holds it, Play resumes it', async () => {
  const { onLight } = await draw()
  await act(async () => fireEvent.press(screen.getByLabelText('Pause featured')))
  await wait(BARE_TURN_MS * 2)
  expect(onLight).not.toHaveBeenCalled()
  await act(async () => fireEvent.press(screen.getByLabelText('Play featured')))
  await wait(BARE_TURN_MS)
  expect(onLight).toHaveBeenLastCalledWith(1)
})

describe('the turn', () => {
  const media: LeadCard = card('m', {
    cover: 'https://x/c.jpg',
    playlist: [
      { kind: 'image', url: 'https://x/c.jpg' },
      { kind: 'image', url: 'https://x/2.jpg' },
      { kind: 'video', url: 'https://x/v.mp4', posterUrl: 'https://x/p.jpg' },
      { kind: 'image', url: 'https://x/4.jpg' },
    ],
  })

  it('stills 4 s each, then the clip plays to its end on the only player; then the next event', async () => {
    const { onLight } = await draw({ cards: [media, card('b')] })
    expect(screen.queryByTestId('lead-clip', { includeHiddenElements: true })).toBeNull()
    // (A slice of slack: each step's timer is armed when its commit lands, up to one 500 ms slice late here.)
    await wait(STILL_MS * 2 + 1000)
    // The cover and the second still have had their 4 s: the clip is on, and only one player exists.
    expect(screen.getAllByTestId('lead-clip', { includeHiddenElements: true })).toHaveLength(1)
    // A clip is never cut by a timer.
    await wait(STILL_MS * 3)
    expect(onLight).not.toHaveBeenCalled()
  })

  it('a clip with no poster of its own: the cover never shows in its bars (the dark surface does)', async () => {
    const bare: LeadCard = card('n', {
      cover: 'https://x/c.jpg',
      playlist: [
        { kind: 'image', url: 'https://x/c.jpg' },
        { kind: 'video', url: 'https://x/v.mp4', posterUrl: null },
      ],
    })
    await draw({ cards: [bare, card('b')] })
    // The control: on the cover, nothing covers it.
    expect(screen.queryByTestId('pulse-lead-clip-ground', { includeHiddenElements: true })).toBeNull()
    await wait(STILL_MS + 1000)
    expect(screen.getAllByTestId('lead-clip', { includeHiddenElements: true })).toHaveLength(1)
    expect(screen.getByTestId('pulse-lead-clip-ground', { includeHiddenElements: true })).toBeTruthy()
  })

  it('a finger on the card, or Pause, holds the clip on its frame: the player stays, paused', async () => {
    await draw({ cards: [media, card('b')] })
    await wait(STILL_MS * 2 + 1000)
    await act(async () => fireEvent(screen.getByTestId('pulse-lead'), 'touchStart'))
    expect(screen.getAllByTestId('lead-clip', { includeHiddenElements: true })).toHaveLength(1)
    expect(mockPlayer.pause).toHaveBeenCalled()
  })

  it.each([
    ['Low Power', { lowPower: true, expensiveNetwork: false }],
    ['cellular', { lowPower: false, expensiveNetwork: true }],
  ])('%s: the clip shows its poster for a still’s dwell, no player', async (_, saver) => {
    mockSaver = saver
    const { onLight } = await draw({ cards: [media, card('b')] })
    await wait(STILL_MS * 2)
    expect(screen.queryByTestId('lead-clip', { includeHiddenElements: true })).toBeNull()
    await wait(STILL_MS)
    expect(onLight).toHaveBeenLastCalledWith(1)
  })
})

it('past five events: "4 / 12" and one pip', async () => {
  const twelve = Array.from({ length: 12 }, (_, i) => card(String(i)))
  await draw({ cards: twelve })
  await wait(BARE_TURN_MS * 3)
  expect(screen.getByText('4 / 12')).toBeTruthy()
  expect(screen.getByTestId('pulse-lead-pip-0')).toBeTruthy()
  expect(screen.queryByTestId('pulse-lead-pip-1')).toBeNull()
})
