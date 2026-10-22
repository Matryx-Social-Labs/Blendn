/*
 * Android 12+ shows a splash icon through a circle 2/3 of its 288 dp canvas (192 dp across), and the old icon's monogram ran to
 * the canvas's edges: the mask cut its left, top and right on every cold launch (r7 H2). Android gets its own padded PNG, with
 * every inked pixel inside the circle and the ink's centroid on the centre (the optical centring of
 * `monogram-gradient-centred.png`, MONOGRAM_MASS_X), in `app.json` AND in the committed `android/` res, which a prebuild-less
 * build ships as they are.
 */
import fs from 'fs'
import path from 'path'

// pngjs ships no types; it is here through Expo's own image tooling (expo-asset → @expo/image-utils).
const { PNG } = require('pngjs') as { PNG: { sync: { read: (file: Buffer) => { width: number; height: number; data: Buffer } } } }

const ROOT = path.join(__dirname, '..')
const CANVAS_DP = 288
const SAFE_DP = 192
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 } as const

/** The farthest inked pixel from the centre and the ink's horizontal centroid, as fractions of the canvas. */
function ink(file: string, step = 1) {
  const png = PNG.sync.read(fs.readFileSync(file))
  const c = (png.width - 1) / 2
  let far = 0
  let mass = 0
  let moment = 0
  for (let y = 0; y < png.height; y += step) {
    for (let x = 0; x < png.width; x += step) {
      const a = png.data[(y * png.width + x) * 4 + 3]
      if (a <= 8) continue
      far = Math.max(far, Math.hypot(x - c, y - c))
      mass += a
      moment += a * x
    }
  }
  return { width: png.width, height: png.height, far: far / png.width, centroidX: moment / mass / (png.width - 1) }
}

/** Inside the safe circle with a 5% margin, as a share of the canvas. */
const SAFE_RADIUS = ((SAFE_DP / CANVAS_DP) * 0.95) / 2

describe('the Android splash icon', () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo.plugins.find(
    (p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen'
  )[1]

  it('is its own padded image in app.json, filling the canvas; iOS keeps the plain mark', () => {
    expect(plugin.android).toMatchObject({ image: './assets/logo/splash-android.png', imageWidth: CANVAS_DP, backgroundColor: '#0D0C0C' })
    expect(plugin.android.dark).toMatchObject({ image: './assets/logo/splash-android.png', backgroundColor: '#0D0C0C' })
    expect(plugin.image).toBe('./assets/logo/monogram-gradient-centred.png')
  })

  it('keeps its ink inside the circle and optically centred', () => {
    const asset = ink(path.join(ROOT, 'assets/logo/splash-android.png'), 4)
    expect(asset.width).toBe(asset.height)
    expect(asset.far).toBeLessThanOrEqual(SAFE_RADIUS)
    expect(asset.centroidX).toBeCloseTo(0.5, 2)
  })

  it.each(Object.entries(DENSITIES).flatMap(([d, m]) => [[`drawable-${d}`, m], [`drawable-night-${d}`, m]]))(
    'the committed %s splashscreen_logo.png is the padded icon at its density',
    (dir, m) => {
      // Sampled on the mdpi grid: the geometry, not every pixel.
      const res = ink(path.join(ROOT, 'android/app/src/main/res', dir as string, 'splashscreen_logo.png'), Math.ceil(m as number))
      expect(res.width).toBe(CANVAS_DP * (m as number))
      expect(res.height).toBe(CANVAS_DP * (m as number))
      expect(res.far).toBeLessThanOrEqual(SAFE_RADIUS)
      expect(res.centroidX).toBeCloseTo(0.5, 2)
    }
  )
})
