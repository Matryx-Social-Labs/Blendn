import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The launch animation's constants against the asset they describe.
 *
 * Most tests in this repo read source as text, because `react-test-renderer` 19
 * returns `null` for a bare `<View>` under jest-expo and layout is therefore
 * unobservable here. This one does better: the animated WebP states its own
 * frame durations, so the invariant that actually broke — the asset being
 * rebuilt while `DURATION_MS` kept describing the old one — is checkable for
 * real rather than asserted about a string.
 *
 * That has happened. An earlier build ended mid-wipe with a coloured trail
 * still on the final "n", and the failure mode is silent: the component fades
 * out on a timer, so an asset longer than the timer is simply cut off, and an
 * asset shorter leaves a frozen frame under the fade. Neither throws.
 */

const ROOT = join(__dirname, '..')

/**
 * Sum the frame durations of an animated WebP.
 *
 * Container layout: `RIFF` + size + `WEBP`, then chunks of fourcc + u32 size +
 * payload padded to an even length. Each `ANMF` payload carries the frame's
 * duration as a 24-bit little-endian value at offset 12, after two 3-byte
 * offsets and two 3-byte dimensions.
 */
function webpFrameDurations(bytes: Buffer): number[] {
  expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF')
  expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP')

  const durations: number[] = []
  let at = 12
  while (at + 8 <= bytes.length) {
    const fourcc = bytes.subarray(at, at + 4).toString('ascii')
    const size = bytes.readUInt32LE(at + 4)
    const payload = at + 8
    if (fourcc === 'ANMF') {
      durations.push(bytes.readUIntLE(payload + 12, 3))
    }
    // Chunks are padded to an even boundary; skipping the pad byte would
    // desynchronise every subsequent chunk and silently yield zero frames.
    at = payload + size + (size % 2)
  }
  return durations
}

describe('the intro asset and the component agree', () => {
  const intro = readFileSync(join(ROOT, 'assets/logo/intro.webp'))
  const source = readFileSync(join(ROOT, 'components/IntroAnimation.tsx'), 'utf8')

  const constant = (name: string) => {
    const match = source.match(new RegExp(`const ${name} = (\\d+)`))
    if (!match) throw new Error(`${name} not found in IntroAnimation.tsx`)
    return Number(match[1])
  }

  const durations = webpFrameDurations(intro)
  const assetMs = durations.reduce((a, b) => a + b, 0)

  it('parses as an animation rather than a still', () => {
    // A still would yield no ANMF chunks, and every duration assertion below
    // would then pass vacuously against a total of zero.
    expect(durations.length).toBeGreaterThan(1)
  })

  it('holds the overlay for at least the asset, so nothing is cut off', () => {
    expect(constant('DURATION_MS')).toBeGreaterThanOrEqual(assetMs)
  })

  it('does not hold long enough to freeze on the last frame', () => {
    // A landing beat is intended; a long tail is a frozen image nobody meant
    // to ship. 250ms is comfortably above the current 42ms and well under the
    // fade, so it distinguishes "lands" from "sits there".
    expect(constant('DURATION_MS') - assetMs).toBeLessThan(250)
  })

  it('opens on a transparent frame, which is what the black hold cuts to', () => {
    // The asset is trimmed from 0 so the monogram draws on. The master's first
    // drawn pixels land at 0.10s, so frame 0 is empty — and if a future rebuild
    // trims past that, the component would cut from black straight onto a
    // partly drawn logo.
    expect(constant('BLACK_MS')).toBeGreaterThan(0)
  })

  it('mounts only once the splash is gone', () => {
    // The timers start at mount, so mounting before `hideAsync` spends the
    // animation behind the splash. This is the guard on that ordering.
    const layout = readFileSync(join(ROOT, 'app/_layout.tsx'), 'utf8')
    expect(layout).toMatch(/showIntro && assetsReady && \(?\s*<IntroAnimation/)
  })

  it('lands on the lockup rather than inflating past it', () => {
    // The travel used to scale the mark to 304/203. 304pt is the width of
    // sign-in's *tagline* — a band-measurement error — so the mark grew by half
    // and the fade revealed something two thirds the size. Twice reported as a
    // zoom-out before the bands were measured per row.
    //
    // Both ends render the same artwork at nearly the same height, so any
    // future value far from 1 is that mistake coming back rather than a design
    // change. The intro's 200.0pt against sign-in's 196.3pt is the real ratio.
    const scale = source.match(/const TRAVEL_SCALE = ([\d.]+) \/ ([\d.]+)/)
    expect(scale).toBeTruthy()
    const ratio = Number(scale![1]) / Number(scale![2])
    expect(ratio).toBeGreaterThan(0.9)
    expect(ratio).toBeLessThan(1.1)
  })

  it('travels upward, which is where the movement actually is', () => {
    const travel = source.match(/const TRAVEL_Y = ([\d.]+) - ([\d.]+)/)
    expect(travel).toBeTruthy()
    expect(Number(travel![1]) - Number(travel![2])).toBeLessThan(0)
  })

  it('splash and overlay agree on which black they are', () => {
    // The overlay paints EMBER.bg. The splash used to paint #000000, so the
    // hold between them stepped from pure black to a warmer near-black at
    // exactly the moment the cut draws attention to. Two blacks nobody diffs.
    const app = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'))
    const splash = app.expo.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen',
    )[1]
    const theme = readFileSync(join(ROOT, 'lib/theme.ts'), 'utf8')
    const bg = theme.match(/bg:\s*'(#[0-9A-Fa-f]{6})'/)![1]
    expect(splash.backgroundColor.toLowerCase()).toBe(bg.toLowerCase())
    expect(splash.dark.backgroundColor.toLowerCase()).toBe(bg.toLowerCase())
  })
})
