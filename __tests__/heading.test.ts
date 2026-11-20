/*
 * Which way you face on the Pulse map (pulse-map 14 A, picked 2026-11-20, SCRUM-1089): a violet beam from the you-mark,
 * as wide as the compass is unsure, gone when it cannot tell; the course over ground when you are moving.
 */
import { beamShows, compassName, facingFrom, worthDrawing } from '../lib/heading'

const compass = (over: object = {}) => ({ trueHeading: 30, magHeading: 31, accuracy: 3, ...over })

describe('facingFrom: the compass', () => {
  it.each([
    [3, 40],
    [2, 70],
    [1, 100],
  ])('accuracy level %i (iOS < 20° / 35° / 50°) draws a %i° beam', (accuracy, width) => {
    expect(facingFrom(compass({ accuracy }), null)).toEqual({ deg: 30, width })
  })

  it('level 0 (unsure past 50°, or needs calibrating) draws nothing, and nothing asks', () => {
    expect(facingFrom(compass({ accuracy: 0 }), null)).toBeNull()
  })

  it('no compass reading (iOS simulator, an Android phone with no magnetometer) draws nothing', () => {
    expect(facingFrom(null, null)).toBeNull()
  })

  it('true north when the OS has it; magnetic when it says -1 (no fix for the declination yet)', () => {
    expect(facingFrom(compass({ trueHeading: -1, magHeading: 12 }), null)?.deg).toBe(12)
    // Control: Toronto's declination is about -10°, so true and magnetic disagree there and true wins.
    expect(facingFrom(compass({ trueHeading: 350, magHeading: 0 }), null)?.deg).toBe(350)
  })

  it('a reading that is not a direction at all draws nothing', () => {
    expect(facingFrom(compass({ trueHeading: -1, magHeading: Number.NaN }), null)).toBeNull()
  })

  it('normalises 360 to 0', () => {
    expect(facingFrom(compass({ trueHeading: 360 }), null)?.deg).toBe(0)
  })
})

describe('facingFrom: moving', () => {
  const T = 1_000_000
  const now = (over: object = {}) => compass({ at: T, ...over })
  it('above 2 m/s the course over ground wins: a phone in a pocket points wherever the pocket does', () => {
    expect(facingFrom(now({ trueHeading: 30 }), { speed: 2.5, course: 200, timestamp: T - 2000 })).toEqual({ deg: 200, width: 40 })
  })

  it('a course from a fix older than 10 s is not used: the Pulse reads a fix once, and you may have stopped since', () => {
    expect(facingFrom(now(), { speed: 4, course: 200, timestamp: T - 11_000 })?.deg).toBe(30)
    // Control: the same fix 9 s old still counts.
    expect(facingFrom(now(), { speed: 4, course: 200, timestamp: T - 9000 })?.deg).toBe(200)
  })

  it('at a walk, or with no course, or no time on the fix, the compass stays (control: the same course at 1.5 m/s is ignored)', () => {
    expect(facingFrom(now(), { speed: 1.5, course: 200, timestamp: T })?.deg).toBe(30)
    expect(facingFrom(now(), { speed: 3, course: null, timestamp: T })?.deg).toBe(30)
    expect(facingFrom(now(), { speed: 3, course: 200, timestamp: null })?.deg).toBe(30)
  })
})

describe('worthDrawing: the beam redraws only for a real turn', () => {
  const at = { deg: 10, width: 40 as const }
  it('a turn of 3° or more is drawn; less is not (each redraw is a frame of the map)', () => {
    expect(worthDrawing(at, { deg: 12.9, width: 40 }, 3)).toBe(false)
    expect(worthDrawing(at, { deg: 13, width: 40 }, 3)).toBe(true)
  })

  it('turns the short way across north: 359° to 1° is 2°, not 358°', () => {
    expect(worthDrawing({ deg: 359, width: 40 }, { deg: 1, width: 40 }, 3)).toBe(false)
    expect(worthDrawing({ deg: 359, width: 40 }, { deg: 2, width: 40 }, 3)).toBe(true)
  })

  it('under Reduce Motion it moves in 15° steps', () => {
    expect(worthDrawing(at, { deg: 24, width: 40 }, 15)).toBe(false)
    expect(worthDrawing(at, { deg: 25, width: 40 }, 15)).toBe(true)
  })

  it('a change of width, or appearing and going, is always drawn', () => {
    expect(worthDrawing(at, { deg: 10, width: 70 }, 3)).toBe(true)
    expect(worthDrawing(null, at, 3)).toBe(true)
    expect(worthDrawing(at, null, 3)).toBe(true)
    expect(worthDrawing(null, null, 3)).toBe(false)
  })
})

describe('beamShows: only on a precise, fresh fix', () => {
  it.each([
    ['precise', true],
    ['approximate', false],
    ['stale', false],
    ['denied', false],
    ['off', false],
    ['none', false],
  ] as const)('%s → %s', (kind, shows) => {
    expect(beamShows(kind)).toBe(shows)
  })
})

describe('compassName: what a screen reader hears', () => {
  it.each([
    [0, 'north'],
    [22, 'north'],
    [23, 'north-east'],
    [45, 'north-east'],
    [90, 'east'],
    [135, 'south-east'],
    [180, 'south'],
    [225, 'south-west'],
    [270, 'west'],
    [315, 'north-west'],
    [337.6, 'north'],
  ])('%s° is %s', (deg, name) => {
    expect(compassName(deg)).toBe(name)
  })
})
