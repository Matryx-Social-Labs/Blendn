/**
 * The feed's grouping and the refusal wording (Flow 5 room and DM, R3-D5 5.4).
 */
import { refusalPlace, RUN_GAP_MS, runPlace, waitLabel } from '../lib/chatFeed'

type Item = { who: string | null; t: number }
const place = (items: Item[], i: number) => runPlace(items, i, (m) => m.who, (m) => m.t)

describe('runPlace', () => {
  const run: Item[] = [
    { who: null, t: 0 }, // a day pill
    { who: 'panda', t: 1000 },
    { who: 'panda', t: 2000 },
    { who: 'you', t: 3000 },
    { who: 'panda', t: 4000 },
  ]
  it('names the first of a run and puts the face, time and tail on the last', () => {
    expect(place(run, 1)).toEqual({ first: true, last: false })
    expect(place(run, 2)).toEqual({ first: false, last: true })
    expect(place(run, 3)).toEqual({ first: true, last: true })
    expect(place(run, 4)).toEqual({ first: true, last: true })
  })
  it('breaks a run at a pause longer than the gap', () => {
    const paused: Item[] = [
      { who: 'panda', t: 0 },
      { who: 'panda', t: RUN_GAP_MS + 1 },
    ]
    expect(place(paused, 0)).toEqual({ first: true, last: true })
    expect(place(paused, 1)).toEqual({ first: true, last: true })
  })
  it('a day pill or a broadcast ends a run', () => {
    const split: Item[] = [
      { who: 'panda', t: 0 },
      { who: null, t: 1 },
      { who: 'panda', t: 2 },
    ]
    expect(place(split, 0).last).toBe(true)
    expect(place(split, 2).first).toBe(true)
  })
})

it('waitLabel: a rate limit in m:ss', () => {
  expect(waitLabel(10)).toBe('0:10')
  expect(waitLabel(75.2)).toBe('1:16')
  expect(waitLabel(-3)).toBe('0:00')
})

describe('refusalPlace (R3-D5 5.4)', () => {
  it('too many links stays on the bubble', () => {
    expect(refusalPlace('SPAM_BLOCKED', 'Too many links (3)')).toBe('links')
  })
  it('a burst and a rate limit lock the composer, never in developer text', () => {
    expect(refusalPlace('SPAM_BLOCKED', 'Burst rate exceeded (6 messages in 10s)')).toBe('slow')
    expect(refusalPlace('RATE_LIMITED', 'Too many requests')).toBe('slow')
  })
  it('anything else is not a spam refusal', () => {
    expect(refusalPlace('USER_MUTED', 'The organiser has muted you in this room.')).toBeNull()
    expect(refusalPlace(undefined, undefined)).toBeNull()
  })
})

describe('broadcastParts — the server’s prefix is never shown (R3-D5 5.6)', () => {
  const { broadcastParts } = jest.requireActual('../lib/chatFeed') as typeof import('../lib/chatFeed')
  it('reads the organiser out of an announcement', () => {
    expect(broadcastParts('announcement', '📢 [Announcement from Toit]\nLast call for the terrace', 'Organiser')).toEqual({
      from: 'Toit',
      text: 'Last call for the terrace',
    })
  })
  it('a sponsored message says Partner until the server sends the brand', () => {
    expect(broadcastParts('sponsored', '📣 [Sponsored]\nTwo-for-one till 11', 'x')).toEqual({ from: 'Partner', text: 'Two-for-one till 11' })
  })
  it('leaves plain text alone', () => {
    expect(broadcastParts('announcement', 'Doors at 8', 'Toit')).toEqual({ from: 'Toit', text: 'Doors at 8' })
  })
})
