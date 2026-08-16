import { readFileSync } from 'fs'
import { join } from 'path'

import {
  ROSTER_MEMORY_MS,
  forgetRoster,
  forgetRosters,
  recallRoster,
  rememberRoster,
} from '../lib/rosterMemory'

/**
 * The roster the room paints before its fetch lands.
 *
 * The perf case is easy. The rules that matter are the ones about *lifetime*:
 * this is pseudonyms, photos, shared interests and who is physically in a room
 * right now, and every one of them is supposed to be ephemeral.
 */
const person = (id: string) => ({ user_id: id, name: `Anon ${id}`, interests: [] }) as never

beforeEach(() => forgetRosters())

describe('it remembers a room for the length of a session', () => {
  it('gives back what it was given, keyed by event', () => {
    rememberRoster('e1', [person('a')], 'Night One')
    rememberRoster('e2', [person('b')], 'Night Two')

    expect(recallRoster('e1')?.attendees).toHaveLength(1)
    expect(recallRoster('e1')?.eventTitle).toBe('Night One')
    expect(recallRoster('e2')?.eventTitle).toBe('Night Two')
  })

  it('never hands one room’s people to another', () => {
    /*
     * Somebody can be checked into two events in a day. Painting the previous
     * room's faces for the first frame of the next one is a privacy bug wearing
     * the clothes of a performance win.
     */
    rememberRoster('e1', [person('a')])
    expect(recallRoster('e2')).toBeNull()
  })

  it('has nothing for an unknown or missing event', () => {
    expect(recallRoster(null)).toBeNull()
    expect(recallRoster(undefined)).toBeNull()
    expect(recallRoster('never-seen')).toBeNull()
  })
})

describe('it expires, because presence goes stale faster than anything else', () => {
  afterEach(() => jest.useRealTimers())

  it('stops answering past the bound', () => {
    /*
     * A ten-minute-old answer to "who is here now" is worse than a spinner: a
     * spinner does not assert anything. The fetch runs either way — this only
     * bounds what may be shown before it lands.
     */
    jest.useFakeTimers().setSystemTime(new Date('2026-08-16T20:00:00Z'))
    rememberRoster('e1', [person('a')])
    expect(recallRoster('e1')).not.toBeNull()

    jest.setSystemTime(new Date('2026-08-16T20:00:00Z').getTime() + ROSTER_MEMORY_MS + 1)
    expect(recallRoster('e1')).toBeNull()
  })

  it('is bounded in minutes, not hours', () => {
    // Long enough to survive a close-and-reopen, short enough that it cannot
    // outlast a break outside the venue.
    expect(ROSTER_MEMORY_MS).toBeLessThanOrEqual(10 * 60 * 1000)
    expect(ROSTER_MEMORY_MS).toBeGreaterThanOrEqual(60 * 1000)
  })
})

describe('it can be forgotten, and both callers matter', () => {
  it('drops one room without disturbing another', () => {
    rememberRoster('e1', [person('a')])
    rememberRoster('e2', [person('b')])
    forgetRoster('e1')
    expect(recallRoster('e1')).toBeNull()
    expect(recallRoster('e2')).not.toBeNull()
  })

  it('drops everything', () => {
    rememberRoster('e1', [person('a')])
    rememberRoster('e2', [person('b')])
    forgetRosters()
    expect(recallRoster('e1')).toBeNull()
    expect(recallRoster('e2')).toBeNull()
  })

  it('is called when somebody checks out', () => {
    /*
     * Leaving the venue ends your claim on the roster. Without this, reopening
     * the room would repaint the one you just left.
     */
    const room = readFileSync(join(__dirname, '..', 'app', 'room.tsx'), 'utf8')
    expect(room).toContain('forgetRoster(eventId)')
  })
})

describe('it never reaches disk', () => {
  const raw = readFileSync(join(__dirname, '..', 'lib', 'rosterMemory.ts'), 'utf8')
  /*
   * Code only. The header names `AsyncStorage` on purpose -- recording *why*
   * this must never persist is the point of writing it down -- so asserting on
   * raw source would fail on its own explanation.
   */
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('uses no persistent store', () => {
    /*
     * The single most important property here. On disk this outlives the event,
     * the chat window, and the person leaving the venue — on a device that may
     * be shared, backed up, or sold. A module-level Map dies with the JS
     * context, which is the correct lifetime and needs no expiry to enforce it.
     */
    expect(src).not.toContain('AsyncStorage')
    expect(src).not.toContain('SecureStore')
    expect(src).not.toContain('MMKV')
    expect(src).not.toContain('FileSystem')
  })

  it('holds it in a module-level Map', () => {
    expect(src).toContain('const rosters = new Map<string, Entry>()')
  })

  it('says out loud why, so the next person does not "improve" it', () => {
    // The rule is only durable if the reasoning travels with it.
    expect(raw).toContain('Never AsyncStorage')
  })
})
