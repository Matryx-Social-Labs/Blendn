/**
 * City art: which cities have an illustrated skyline, and how it is lit.
 *
 * The drawings live in `components/cityArt/`. This module is the part that can
 * be wrong in a way a screenshot will not show — a server spelling that misses
 * its art, or a Bengaluru scene lit for night at noon — so it is pure and
 * tested (`__tests__/cityArt.test.ts`).
 *
 * The colours are here rather than beside the drawings because they are an
 * illustration's palette, not UI: `scripts/check-design-tokens.js` rightly
 * rejects a raw hex in `components/`, and none of these belong in `EMBER`.
 */

export type CityArtKey = 'blr' | 'bom' | 'del'
export type TimeOfDay = 'day' | 'dusk' | 'night'

export interface CityArtInfo {
  key: CityArtKey
  /** The city's name in its own script, drawn under the English one. */
  script: string
  timeZone: string
}

const INFO: Record<CityArtKey, CityArtInfo> = {
  blr: { key: 'blr', script: 'ಬೆಂಗಳೂರು', timeZone: 'Asia/Kolkata' },
  bom: { key: 'bom', script: 'मुंबई', timeZone: 'Asia/Kolkata' },
  del: { key: 'del', script: 'दिल्ली', timeZone: 'Asia/Kolkata' },
}

/*
 * Every spelling the server has used or plausibly will. City strings come from
 * organisers and reverse geocoding, so "Bangalore", "Bengaluru Urban" and
 * "New Delhi" all turn up for the same place.
 */
const ALIASES: Record<string, CityArtKey> = {
  bengaluru: 'blr',
  bangalore: 'blr',
  'bengaluru urban': 'blr',
  'bangalore urban': 'blr',
  mumbai: 'bom',
  bombay: 'bom',
  'mumbai suburban': 'bom',
  delhi: 'del',
  'new delhi': 'del',
}

/** The art behind a key, for callers that already resolved one. */
export function cityArtInfo(key: CityArtKey): CityArtInfo {
  return INFO[key]
}

/** The art for a city, or null when it has none and should render as a plain name. */
export function cityArtFor(city: string | null | undefined): CityArtInfo | null {
  if (!city) return null
  const key = ALIASES[city.trim().toLowerCase().replace(/\s+/g, ' ')]
  return key ? INFO[key] : null
}

/**
 * The light a city is in right now, on its own clock rather than the phone's.
 *
 * Someone in Berlin browsing Bengaluru at their 6pm is looking at a city at
 * 9:30pm, and the scene should say so. Dusk is two hours because that is how
 * long the sky reads as dusk in the drawing; the exact sunset does not matter
 * at this size.
 */
export function timeOfDay(now: Date, timeZone: string): TimeOfDay {
  let hour: number
  try {
    hour = Number(
      new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(now),
    )
  } catch {
    hour = now.getHours()
  }
  if (!Number.isFinite(hour)) hour = now.getHours()
  if (hour >= 6 && hour < 17) return 'day'
  if (hour >= 17 && hour < 19) return 'dusk'
  return 'night'
}

export interface ScenePalette {
  sky1: string
  sky2: string
  hill: string
  far: string
  stone: string
  shade: string
  ub: string
  tree: string
  tree2: string
  trunk: string
  gulmohar: string
  road: string
  track: string
  cloud: string
  /** The city name drawn over the sky. */
  ink: string
  sea: string
  sea2: string
  sun: string
  bird: string
  sandstone: string
  trainWin: string
  /** How far below its noon position the sun has sunk, in scene units. */
  sunY: number
  sunO: number
  moon: number
  /** Lit windows. */
  win: number
  /** Festival bulbs strung along the landmarks. */
  lights: number
  stars: number
}

export const SCENE_PALETTES: Record<TimeOfDay, ScenePalette> = {
  day: {
    sky1: '#5FA6D6', sky2: '#F3E6CC', hill: '#8FAE9B', far: '#B9B3AE', stone: '#EFE6D6', shade: '#CDBEA5',
    ub: '#7F95A6', tree: '#2E6A3E', tree2: '#3F8450', trunk: '#4A3526', gulmohar: '#EE5A2F', road: '#3B3A36',
    track: '#8C8A86', cloud: '#FFFFFF', ink: '#0F1A24', sea: '#3E86B5', sea2: '#2A6590', sun: '#FFE7A0',
    bird: '#2A2A2A', sandstone: '#B5654A', trainWin: '#CFE3F0',
    sunY: 0, sunO: 1, moon: 0, win: 0, lights: 0, stars: 0,
  },
  dusk: {
    sky1: '#2E2A55', sky2: '#FF906D', hill: '#5E4A6A', far: '#4B3D5C', stone: '#F3C49C', shade: '#BF8866',
    ub: '#3F3858', tree: '#273B31', tree2: '#34503E', trunk: '#2A2024', gulmohar: '#FF6A3D', road: '#2A2530',
    track: '#4A3F52', cloud: '#FFC2A6', ink: '#FFFFFF', sea: '#7A4E78', sea2: '#3B2A55', sun: '#FFB27A',
    bird: '#2A1E30', sandstone: '#A04E3E', trainWin: '#FFE2A8',
    sunY: 92, sunO: 1, moon: 0, win: 0.75, lights: 0.4, stars: 0.3,
  },
  night: {
    sky1: '#070913', sky2: '#231F3D', hill: '#17162A', far: '#1C1A2C', stone: '#36304A', shade: '#26213A',
    ub: '#1F1C30', tree: '#0E1B16', tree2: '#15271F', trunk: '#0C0C10', gulmohar: '#8E3A26', road: '#121118',
    track: '#2A2738', cloud: '#3A3656', ink: '#FFFFFF', sea: '#141A33', sea2: '#0A0D1E', sun: '#FFB27A',
    bird: '#8A84A8', sandstone: '#3A2530', trainWin: '#FFE7A8',
    sunY: 120, sunO: 0, moon: 1, win: 1, lights: 1, stars: 1,
  },
}

/** Colours that do not change with the light: things that are painted, or are lamps. */
export const SCENE_FIXED = {
  window: '#FFD27A',
  bulb: '#FFD27A',
  aviation: '#FF4D4D',
  star: '#FFFFFF',
  moon: '#F4EBD8',
  finial: '#E8B64C',
  metro: '#7B3FA0',
  metroStripe: '#E8D9F2',
  autoBody: '#2F8F4E',
  autoTop: '#F2C230',
  tyre: '#111111',
  headlight: '#FFF4C0',
  roadMark: '#FFFFFF',
  foam: '#FFFFFF',
  tailLight: '#FF6A5A',
  sail: '#E8543A',
  kite: '#FF906D',
  kiteSpine: '#5B1600',
} as const

/** Park-Miller: the same city draws the same windows and blossoms on every render. */
export function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}
