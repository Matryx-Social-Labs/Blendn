/*
 * One time format app-wide (r7 M7, the design's one date grammar: "Live" / "In 25 min" / "9:30 PM" / "Ended"). Going said
 * "05:00" on a 24-hour iPhone, Android "5:00 AM", Nearby "5 AM": three formatters, two of them the device locale's. Every
 * clock time is `clockTime` now: "9 PM" on the hour, "9:30 PM" otherwise, built by hand so no locale or engine changes it.
 */
import fs from 'fs'
import path from 'path'

import { clockTime } from '../lib/time'

const at = (h: number, m: number) => new Date(2026, 9, 15, h, m)

describe('clockTime', () => {
  it('says h:mm AM/PM, and the hour alone on the hour', () => {
    expect(clockTime(at(21, 38))).toBe('9:38 PM')
    expect(clockTime(at(21, 0))).toBe('9 PM')
    expect(clockTime(at(5, 0))).toBe('5 AM')
    expect(clockTime(at(0, 5))).toBe('12:05 AM')
    expect(clockTime(at(12, 0))).toBe('12 PM')
    expect(clockTime(at(9, 7))).toBe('9:07 AM')
  })

  it('takes an ISO string, a timestamp or a Date, and is empty for a time it cannot read', () => {
    const d = at(15, 30)
    expect(clockTime(d.toISOString())).toBe('3:30 PM')
    expect(clockTime(d.getTime())).toBe('3:30 PM')
    expect(clockTime('not a date')).toBe('')
  })

  it('reads the clock in a named time zone when asked (the map’s event times, in the city’s zone)', () => {
    // 14:30 UTC is 8 PM in Kolkata, wherever the phone is.
    expect(clockTime('2026-09-29T14:30:00.000Z', 'Asia/Kolkata')).toBe('8 PM')
    expect(clockTime('2026-09-29T14:45:00.000Z', 'Asia/Kolkata')).toBe('8:15 PM')
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

  it('nothing in the app formats a time with the device locale', () => {
    const offenders = ['app', 'components', 'lib']
      .flatMap((d) => walk(path.join(ROOT, d)))
      .filter((f) => /toLocaleTimeString\(/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(ROOT, f))
    expect(offenders).toEqual([])
  })
})
