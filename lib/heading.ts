import type { YouMark } from './mapPresence'

/**
 * Which way you face on the Pulse map (pulse-map 14 A, picked 2026-11-20, SCRUM-1089): a violet beam from the you-mark.
 *
 * - **The compass** (`expo-location` `watchHeadingAsync`): true north when the OS has it, magnetic when it says -1.
 * - **Its width is how unsure the compass is.** expo's level 3 / 2 / 1 is iOS's < 20° / 35° / 50° (Android's sensor
 *   status), drawn 40° / 70° / 100°. Level 0 draws nothing: a beam that might be backwards is worse than none.
 * - **Moving** faster than a brisk walk, the course over ground wins: a phone in a pocket points wherever the pocket does.
 * - **Only on a precise, fresh fix.** Approximate would point from the wrong place; stale would say you are still there.
 */

export type BeamWidth = 40 | 70 | 100
export type Facing = { deg: number; width: BeamWidth }
/** A compass reading and when it came (ms), so a fix's course is used only while it is as fresh as the compass. */
export type CompassReading = { trueHeading: number; magHeading: number; accuracy: number; at?: number }

/** Above this ground speed (m/s, about 7 km/h) the course over ground says which way you are going. */
export const COURSE_MIN_SPEED = 2
/**
 * A fix's course counts only this close to the compass reading (ms). The Pulse reads a fix once, not continuously: a
 * course measured in a moving car must not keep pointing the beam after you have stopped.
 */
export const COURSE_MAX_AGE_MS = 10_000
/** The smallest turn worth a redraw of the map (°); Reduce Motion moves in bigger steps. */
export const TURN_STEP = { normal: 3, reduceMotion: 15 } as const

const WIDTH_BY_LEVEL: Record<number, BeamWidth> = { 3: 40, 2: 70, 1: 100 }

const direction = (deg: number | null | undefined): number | null =>
  typeof deg === 'number' && Number.isFinite(deg) && deg >= 0 ? deg % 360 : null

type Movement = { speed?: number | null; course?: number | null; timestamp?: number | null } | null

const movingCourse = (fix: Movement, at: number | undefined): number | null => {
  const course = direction(fix?.course)
  if (course === null || (fix?.speed ?? 0) < COURSE_MIN_SPEED || at === undefined || fix?.timestamp == null) return null
  return Math.abs(at - fix.timestamp) <= COURSE_MAX_AGE_MS ? course : null
}

export function facingFrom(compass: CompassReading | null, fix: Movement): Facing | null {
  if (!compass) return null
  const course = movingCourse(fix, compass.at)
  if (course !== null) return { deg: course, width: 40 }
  const width = WIDTH_BY_LEVEL[compass.accuracy]
  const deg = direction(compass.trueHeading) ?? direction(compass.magHeading)
  return width && deg !== null ? { deg, width } : null
}

/** The turn from `a` to `b` the short way round, in degrees (-180, 180]. */
const turn = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180

/** Whether a new reading changes what is drawn: a real turn, a new width, or the beam coming or going. */
export function worthDrawing(drawn: Facing | null, next: Facing | null, step: number): boolean {
  if (!drawn || !next) return drawn !== next
  return drawn.width !== next.width || Math.abs(turn(drawn.deg, next.deg)) >= step
}

export const beamShows = (kind: YouMark['kind']) => kind === 'precise'

const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'] as const

/** The eight-point name a screen reader hears ("You are on the map, facing north-east"). */
export const compassName = (deg: number) => POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]
