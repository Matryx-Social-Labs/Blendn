/*
 * One date format app-wide, as there is one clock (r7 M7). RC drive 3 on an en_DE iPhone: Settings' Blend'n+ row said
 * "until 23. Oct 2027" (`toLocaleDateString` in the phone's locale) while Manage said "23 Oct 2027" (built by hand). Every
 * absolute date the app shows is `calendarDate` now: day first, fixed English names, no comma, no dot, whatever the locale.
 */
import fs from 'fs'
import path from 'path'

jest.mock('../lib/apiClient', () => ({ apiClient: {} }))

/* eslint-disable import/first */
import { blockedLine } from '../lib/blockedLine'
import { validUntil } from '../lib/offers'
import { plusStatusLine } from '../lib/plus'
import { shortDate } from '../lib/plusManage'
import { muteLabel } from '../lib/roomMembership'
import { calendarDate } from '../lib/time'
/* eslint-enable import/first */

const NOW = new Date(2026, 9, 23, 15, 0).getTime()

describe('calendarDate', () => {
  it('is day first, with the year only when it is not this one', () => {
    expect(calendarDate(new Date(2026, 10, 3, 12), { now: NOW })).toBe('3 Nov')
    expect(calendarDate(new Date(2027, 9, 23, 12), { now: NOW })).toBe('23 Oct 2027')
    expect(calendarDate(new Date(2027, 9, 23, 12), { now: NOW, weekday: true })).toBe('Sat 23 Oct 2027')
    expect(calendarDate(new Date(2027, 9, 23, 12), { now: NOW, weekday: 'only' })).toBe('Sat')
    expect(calendarDate(new Date(2027, 9, 23, 12), { now: NOW, year: false })).toBe('23 Oct')
    expect(calendarDate(new Date(2026, 9, 23, 12), { now: NOW, year: true })).toBe('23 Oct 2026')
  })

  it('takes an ISO string, a timestamp or a Date, and is empty for one it cannot read', () => {
    const d = new Date(2026, 11, 1, 9)
    for (const t of [d, d.getTime(), d.toISOString()]) expect(calendarDate(t, { now: NOW })).toBe('1 Dec')
    for (const t of [null, undefined, '', 'not a date']) expect(calendarDate(t, { now: NOW })).toBe('')
  })

  it('reads the day in a named zone (an event’s), wherever the phone is', () => {
    // 20:00 UTC on the 29th is 01:30 on the 30th in Kolkata.
    expect(calendarDate('2026-09-29T20:00:00Z', { weekday: true, now: NOW, timeZone: 'Asia/Kolkata' })).toBe('Wed 30 Sep')
    expect(calendarDate('2026-09-29T20:00:00Z', { weekday: true, now: NOW, timeZone: 'America/Los_Angeles' })).toBe('Tue 29 Sep')
  })
})

describe('on an en_DE phone (the locale writes "23. Okt. 2027")', () => {
  let spies: jest.SpyInstance[] = []
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW })
    const german = () => '23. Okt. 2027'
    spies = [jest.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(german), jest.spyOn(Date.prototype, 'toLocaleString').mockImplementation(german)]
  })
  afterEach(() => {
    spies.forEach((s) => s.mockRestore())
    jest.useRealTimers()
  })

  it('Settings and Manage say the same date (RC drive 3: "until 23. Oct 2027" beside "23 Oct 2027")', () => {
    const expiresAt = new Date(2027, 9, 23, 12).toISOString()
    expect(plusStatusLine({ active: true, gated: true, product: 'plus', source: 'apple', expiresAt } as never)).toBe('Blend’n+ until 23 Oct 2027')
    expect(shortDate(expiresAt, NOW)).toBe('23 Oct 2027')
  })

  it('a mute, an offer and a block say it the same way', () => {
    const later = new Date(2026, 10, 3, 12)
    expect(muteLabel({ muted: true, until: later.toISOString() }, new Date(NOW))).toBe('Muted until Tue 3 Nov')
    expect(validUntil(later.toISOString())).toBe('until Tue 3 Nov')
    expect(blockedLine({ blocked_at: new Date(2026, 8, 12, 12).toISOString(), reason: null }, new Date(NOW)).mono).toBe('12 Sep')
  })
})

describe('one formatter', () => {
  const ROOT = path.join(__dirname, '..')
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) return e.name === 'preview' ? [] : walk(p)
      return /\.(ts|tsx)$/.test(e.name) ? [p] : []
    })
  const files = ['app', 'components', 'lib'].flatMap((d) => walk(path.join(ROOT, d)))
  // The code, not its comments: a comment may name what it avoids.
  const read = (f: string) =>
    fs
      .readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  it('nothing formats a date with the device locale, or with Intl options of its own', () => {
    const offenders = files
      .filter((f) => /toLocaleDateString\(|toLocaleString\((undefined|\[\])|toLocaleString\([^)]*\b(month|weekday|day)\b/.test(read(f)))
      .map((f) => path.relative(ROOT, f))
    expect(offenders).toEqual([])
  })

  it('Intl.DateTimeFormat only where it computes a zone’s clock or date, never to write one', () => {
    // time.ts: the clock and the date in a zone; eventDays.ts: an event's today; cityArt.ts: the hour for the city art.
    const allowed = ['lib/time.ts', 'lib/eventDays.ts', 'lib/cityArt.ts']
    const users = files.filter((f) => /Intl\.DateTimeFormat\(/.test(read(f))).map((f) => path.relative(ROOT, f))
    expect(users.filter((f) => !allowed.includes(f))).toEqual([])
  })
})
