/*
 * The monogram reads centred wherever it is centred (owner, 2026-10-22: the launch mark looked skewed left). Its ink's
 * centroid sits at 0.4042 of the box width, so every centred mark is laid out on a box widened on the left until that
 * centroid is its middle, and the splash uses a PNG padded the same way.
 */
import fs from 'fs'
import path from 'path'

import { MONOGRAM_BOX, MONOGRAM_MASS_X, MONOGRAM_OPTICAL_ASPECT, MONOGRAM_OPTICAL_BOX } from '../components/ds/DiscMark'

const ROOT = path.join(__dirname, '..')

describe('the optical box', () => {
  it('puts the ink centroid at its centre and keeps the right edge', () => {
    const centroid = MONOGRAM_BOX.x + MONOGRAM_MASS_X * MONOGRAM_BOX.width
    expect(MONOGRAM_OPTICAL_BOX.x + MONOGRAM_OPTICAL_BOX.width / 2).toBeCloseTo(centroid, 6)
    expect(MONOGRAM_OPTICAL_BOX.x + MONOGRAM_OPTICAL_BOX.width).toBeCloseTo(MONOGRAM_BOX.x + MONOGRAM_BOX.width, 6)
    expect(MONOGRAM_OPTICAL_ASPECT).toBeCloseTo(MONOGRAM_OPTICAL_BOX.width / MONOGRAM_OPTICAL_BOX.height, 6)
  })

  it('every caller lays out the optical box; nothing nudges the mark by hand', () => {
    for (const file of ['components/ds/Disc.tsx', 'components/ds/MomentReady.tsx', 'components/pulse/PullIndicator.tsx']) {
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8')
      expect(src).not.toMatch(/\bMONOGRAM_ASPECT\b/)
      expect(src).toMatch(/MONOGRAM_OPTICAL_ASPECT/)
    }
    expect(fs.readFileSync(path.join(ROOT, 'components/ds/Disc.tsx'), 'utf8')).not.toMatch(/0\.1 \* MARK_WIDTH/)
  })
})

describe('the PNG marks', () => {
  it('the splash and the event cover use the optically centred PNG', () => {
    const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
    const splash = app.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1]
    expect(splash.image).toBe('./assets/logo/monogram-gradient-centred.png')
    expect(splash.dark.image).toBe('./assets/logo/monogram-gradient-centred.png')
    expect(fs.readFileSync(path.join(ROOT, 'components/EventCover.tsx'), 'utf8')).toMatch(/monogram-gradient-centred\.png/)
  })
})
