/*
 * A running app follows the phone to a new zone (R6-7, then RC 7 on Android: Scene, Pulse and the rest kept the old zone
 * until relaunch). Hermes reads the default zone once and keeps it, so the phone's zone comes from the OS
 * (expo-localization's `getCalendars`), is re-read on AppState active, and is passed by name to every formatter that
 * means "the phone's time". Here the OS moves the phone while the engine's own zone (the process's) never changes,
 * exactly as Hermes behaves: anything still reading the engine's default would keep saying the old zone.
 */
import fs from 'fs'
import path from 'path'
import { createElement } from 'react'
import { Text } from 'react-native'
import { act, render, screen } from '@testing-library/react-native'

import * as sharedTime from '../lib/time'
import { useNow } from '../lib/useNow'

type Time = typeof import('../lib/time')
type Sections = typeof import('../lib/pulseSections')

/** What the OS says: the native module's `getCalendars` (jest.setup.js answers it from `process.env.TZ`, which Jest never passes to the engine). */
const previousZone = process.env.TZ
const osSays = (zone: string) => {
  process.env.TZ = zone
}
afterAll(() => {
  process.env.TZ = previousZone
})

/** Fresh modules: the phone's zone and the listeners are module state. */
function fresh(): { time: Time; sections: Sections } {
  let mods!: { time: Time; sections: Sections }
  jest.isolateModules(() => {
    mods = {
      time: require('../lib/time') as Time,
      sections: require('../lib/pulseSections') as Sections,
    }
  })
  return mods
}

const IST = 'Asia/Kolkata'
// Sat 24 Oct 2026, 6:30 PM in Bengaluru = 6:00 AM in Los Angeles (PDT).
const START = '2026-10-24T13:00:00.000Z'

beforeEach(() => {
  osSays('America/Los_Angeles')
})

it('reads the phone’s zone from the OS, not the engine', () => {
  const { time } = fresh()
  expect(time.phoneTimeZone()).toBe('America/Los_Angeles')
  // The engine (this process) is wherever the test runs; the clock is the OS zone's.
  expect(time.clockTime(START)).toBe('6 AM')
})

it('a zone that did not move is not news; one that did tells the listeners', () => {
  const { time } = fresh()
  const heard = jest.fn()
  const unsubscribe = time.subscribePhoneZone(heard)
  expect(time.refreshPhoneZone()).toBe(false)
  expect(heard).not.toHaveBeenCalled()

  osSays(IST)
  expect(time.refreshPhoneZone()).toBe(true)
  expect(heard).toHaveBeenCalledTimes(1)
  // Not news twice.
  expect(time.refreshPhoneZone()).toBe(false)

  unsubscribe()
  osSays('America/Toronto')
  expect(time.refreshPhoneZone()).toBe(true)
  expect(heard).toHaveBeenCalledTimes(1)
})

it('after the OS moves the phone to IST, an IST night loses its zone name and every phone clock says IST', () => {
  const { time } = fresh()
  // Los Angeles: the IST night is named, the phone's own clock is LA's.
  expect(time.eventClock(START, IST)).toBe('6:30 PM IST')
  expect(time.clockTime(START)).toBe('6 AM')
  expect(time.dayKeyIn(new Date('2026-10-24T03:00:00.000Z'))).toBe('2026-9-23')

  osSays(IST)
  time.refreshPhoneZone()
  // No relaunch: the same module now says the phone is in IST.
  expect(time.eventClock(START, IST)).toBe('6:30 PM')
  expect(time.clockTime(START)).toBe('6:30 PM')
  expect(time.dayKeyIn(new Date('2026-10-24T03:00:00.000Z'))).toBe('2026-9-24')
  expect(time.calendarDate(START, { weekday: true, year: false })).toBe('Sat 24 Oct')
  expect(time.hourIn(new Date(START))).toBe(18)
})

it('a screen re-renders with the new zone the moment the phone moves, with no relaunch', async () => {
  // The app's own lib/time and useNow (one React): back in Los Angeles first.
  const time = sharedTime
  time.refreshPhoneZone()
  function Probe() {
    useNow(24 * 60 * 60_000)
    return createElement(Text, { testID: 'clock' }, time.eventClock(START, IST))
  }
  await render(createElement(Probe))
  expect(screen.getByTestId('clock').props.children).toBe('6:30 PM IST')

  osSays(IST)
  await act(async () => {
    time.refreshPhoneZone()
  })
  expect(screen.getByTestId('clock').props.children).toBe('6:30 PM')
})

it('the Pulse’s phone-day helpers follow the move: the weekend label and the day seed are the new zone’s', () => {
  const { time, sections } = fresh()
  // Fri 23 Oct, 8:00 PM in Los Angeles = Sat 24 Oct, 8:30 AM in Bengaluru.
  const now = Date.parse('2026-10-24T03:00:00.000Z')
  expect(sections.seedDateOf(now)).toBe('2026-10-23')
  osSays(IST)
  time.refreshPhoneZone()
  expect(sections.seedDateOf(now)).toBe('2026-10-24')
  // Saturday in IST: this weekend is today and tomorrow, Friday 17:00 IST onwards.
  const weekend = sections.weekendWindow(now)
  expect(weekend.label).toBe('Sat 24 – Sun 25 Oct')
  expect(weekend.startDate).toBe('2026-10-23T11:30:00.000Z')
  expect(weekend.endDate).toBe('2026-10-25T18:29:59.999Z')
})

it('the phone’s zone falls back to the engine’s when the OS has no answer (a binary without the module)', () => {
  const modules = (globalThis as unknown as { expo: { modules: Record<string, unknown> } }).expo.modules
  const native = modules.ExpoLocalization
  delete modules.ExpoLocalization
  try {
    const { time } = fresh()
    expect(time.phoneTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
  } finally {
    modules.ExpoLocalization = native
  }
})

describe('nothing reads the engine’s zone (RC 7)', () => {
  const ROOT = path.join(__dirname, '..')
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) return e.name === 'preview' ? [] : walk(p)
      return /\.(ts|tsx)$/.test(e.name) ? [p] : []
    })
  // The code, not its comments: a comment may name what it avoids.
  const read = (f: string) =>
    fs
      .readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
  const files = ['app', 'components', 'lib'].flatMap((d) => walk(path.join(ROOT, d))).filter((f) => path.relative(ROOT, f) !== 'lib/time.ts')

  it('no local Date getter, setter or local-time constructor outside lib/time: they are Hermes’ cached zone', () => {
    // `getHours`, `getDate`, `setDate`… and `new Date(y, m, d)` read the zone Hermes cached at launch. The phone's day,
    // hour and midnight come from lib/time (`dateIn`, `clockIn`, `hourIn`, `weekdayIn`, `dayKeyIn`, `instantIn`,
    // `startOfDayIn`, `calendarDaysBetween`), which pass the OS's zone by name. `getUTC*` and `getTime` are zone-free.
    const local = /\.(get|set)(FullYear|Month|Date|Day|Hours|Minutes|Seconds|Milliseconds)\(|\.getTimezoneOffset\(|new Date\([^()]*,[^()]*\)/
    const offenders = files.filter((f) => local.test(read(f))).map((f) => path.relative(ROOT, f))
    expect(offenders).toEqual([])
  })

  it('no Intl formatter without a zone of its own outside lib/time', () => {
    const users = files.filter((f) => /Intl\.DateTimeFormat\(|resolvedOptions\(\)\.timeZone/.test(read(f))).map((f) => path.relative(ROOT, f))
    expect(users).toEqual([])
  })
})
