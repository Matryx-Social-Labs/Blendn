/*
 * Featured C, "one lap, lit not flown" (pulse-media 05–07, pulse-map 10; owner 2026-11-17). The pure rules: the lap's
 * order, one event's turn, the lap's end, what pauses it, what ends it, and the dots pill.
 */
import {
  BARE_TURN_MS,
  lapOrder,
  lapPolicy,
  nextStep,
  PIP_CAP,
  pipModel,
  playLabel,
  STILL_MS,
  TURN_ITEMS,
  turnOf,
  type LapInputs,
} from '../lib/featuredLap'
import type { FeedMediaItem } from '../lib/feedMedia'

const ev = (id: string, distance?: number | null) => ({ id, distance })
const img = (n: number): FeedMediaItem => ({ kind: 'image', url: `i${n}` })
const clip = (n: number): FeedMediaItem => ({ kind: 'video', url: `v${n}`, posterUrl: null })

describe('lapOrder: nearest first; the server (sponsor) order only breaks ties', () => {
  it('sorts by distance with a fix, and keeps the server order between equals', () => {
    const order = lapOrder([ev('far', 7.3), ev('a', 0.21), ev('b', 0.21), ev('mid', 3.1)], true).map((e) => e.id)
    expect(order).toEqual(['a', 'b', 'mid', 'far'])
  })

  it('an event with no distance goes after every one that has one, in server order', () => {
    expect(lapOrder([ev('x', null), ev('n', 1), ev('y')], true).map((e) => e.id)).toEqual(['n', 'x', 'y'])
  })

  it('no fix: the server order, untouched (no invented distances)', () => {
    expect(lapOrder([ev('far', 7.3), ev('a', 0.21)], false).map((e) => e.id)).toEqual(['far', 'a'])
  })

  it('control: never reorders the input array in place', () => {
    const input = [ev('far', 7.3), ev('a', 0.21)]
    lapOrder(input, true)
    expect(input.map((e) => e.id)).toEqual(['far', 'a'])
  })
})

describe('one event’s turn', () => {
  it('is the cover and the next two items; a clip counts as one', () => {
    expect(TURN_ITEMS).toBe(3)
    expect(turnOf([img(0), img(1), clip(2), img(3), img(4)])).toEqual([img(0), img(1), clip(2)])
  })

  it('stills hold 4 s; a card with a cover and nothing else still fills its pip over 6 s', () => {
    expect(STILL_MS).toBe(4000)
    expect(BARE_TURN_MS).toBe(6000)
    expect(turnOf([img(0)])).toEqual([img(0)])
  })
})

describe('nextStep: one lap, then it rests on the first cover', () => {
  const at = (event: number, item: number) => ({ event, item, lapDone: false })

  it('walks the turn’s items, then the next event from its cover', () => {
    expect(nextStep(at(0, 0), 3, 3)).toEqual(at(0, 1))
    expect(nextStep(at(0, 2), 3, 3)).toEqual(at(1, 0))
  })

  it('after the last event’s last item: back to the first event’s cover, the lap done', () => {
    expect(nextStep(at(2, 1), 3, 2)).toEqual({ event: 0, item: 0, lapDone: true })
  })

  it('one event: one turn, then it rests', () => {
    expect(nextStep(at(0, 0), 1, 1)).toEqual({ event: 0, item: 0, lapDone: true })
  })

  it('control: a lap already done never moves again', () => {
    expect(nextStep({ event: 0, item: 0, lapDone: true }, 3, 3)).toEqual({ event: 0, item: 0, lapDone: true })
  })
})

const RUNNING: LapInputs = {
  tabFocused: true,
  appActive: true,
  inView: true,
  touching: false,
  screenReader: false,
  reduceMotion: false,
  lowPower: false,
  expensiveNetwork: false,
  play: 'auto',
  tookOver: false,
  lapDone: false,
}

describe('lapPolicy: what pauses the lap and what ends it', () => {
  it('runs, clips included, when nothing stops it', () => {
    expect(lapPolicy(RUNNING)).toEqual({ advances: true, clips: true })
  })

  it.each([
    ['a finger on the card', { touching: true }],
    ['the lead scrolled away, or the drawer off its rest', { inView: false }],
    ['another tab', { tabFocused: false }],
    ['the app in the background', { appActive: false }],
    ['a screen reader', { screenReader: true }],
    ['Reduce Motion', { reduceMotion: true }],
    ['Pause pressed', { play: 'paused' as const }],
    ['a swipe or a touch on the map (for the visit)', { tookOver: true }],
    ['the lap is done', { lapDone: true }],
  ])('%s: nothing advances', (_, over) => {
    expect(lapPolicy({ ...RUNNING, ...over }).advances).toBe(false)
  })

  it.each([
    ['Low Power', { lowPower: true }],
    ['cellular / Low Data', { expensiveNetwork: true }],
  ])('%s: stills still rotate, a clip shows its poster (no decoder)', (_, over) => {
    expect(lapPolicy({ ...RUNNING, ...over })).toEqual({ advances: true, clips: false })
  })

  it('Play after the lap, a swipe, a screen reader or Reduce Motion runs it again', () => {
    for (const over of [{ lapDone: true }, { tookOver: true }, { screenReader: true }]) {
      expect(lapPolicy({ ...RUNNING, ...over, play: 'playing' }).advances).toBe(true)
    }
    // Reduce Motion: Play runs the stills (crossfaded); no clip mounts.
    expect(lapPolicy({ ...RUNNING, reduceMotion: true, play: 'playing' })).toEqual({ advances: true, clips: false })
  })

  it('control: Play never runs what nobody can see', () => {
    for (const over of [{ inView: false }, { tabFocused: false }, { appActive: false }, { touching: true }]) {
      expect(lapPolicy({ ...RUNNING, ...over, play: 'playing' }).advances).toBe(false)
    }
  })
})

describe('the dots pill', () => {
  it('up to five events: a pip each, the active one filling', () => {
    expect(PIP_CAP).toBe(5)
    expect(pipModel(3, 1)).toEqual({ pips: 3, active: 1, counter: null })
  })

  it('past five: "4 / 12" and one filling pip', () => {
    expect(pipModel(12, 3)).toEqual({ pips: 1, active: 0, counter: '4 / 12' })
  })

  it('Pause / Play reads what it does', () => {
    expect(playLabel({ advances: true, lapDone: false })).toBe('Pause featured')
    expect(playLabel({ advances: false, lapDone: false })).toBe('Play featured')
    expect(playLabel({ advances: false, lapDone: true })).toBe('Play featured again')
  })
})
