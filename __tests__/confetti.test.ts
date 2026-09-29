import { buildConfetti, CONFETTI_MS, CONFETTI_PEAK_MS, pieceAt } from '../lib/confetti'

/**
 * The check-in confetti's flight.
 *
 * What's pinned here is what would look wrong on a phone without failing
 * anything: pieces that never reach the top third, pieces that fly off the top
 * edge, a burst still hanging around after it should be gone, or a follow-up
 * tray arriving while the confetti is still climbing.
 */

const PHONE = { width: 393, height: 852, originBottom: 90, originWidth: 280 }

describe('buildConfetti', () => {
  it('is deterministic per seed and differs across seeds', () => {
    expect(buildConfetti(PHONE, 3)).toEqual(buildConfetti(PHONE, 3))
    expect(buildConfetti(PHONE, 3)[0].vx).not.toBe(buildConfetti(PHONE, 4)[0].vx)
  })

  it('starts every piece on the button, launching upwards', () => {
    for (const p of buildConfetti(PHONE, 1)) {
      expect(p.y0).toBe(PHONE.height - PHONE.originBottom)
      expect(Math.abs(p.x0 - PHONE.width / 2)).toBeLessThanOrEqual(PHONE.originWidth / 2)
      expect(p.vy).toBeLessThan(0)
    }
  })
})

describe('pieceAt', () => {
  const pieces = buildConfetti(PHONE, 11)
  const highest = (p: (typeof pieces)[number]) => {
    let min = Infinity
    for (let ms = 0; ms <= CONFETTI_MS; ms += 10) min = Math.min(min, pieceAt(p, ms, PHONE.height).y)
    return min
  }

  it('peaks every piece in the top half and never above the screen', () => {
    for (const p of pieces) {
      const top = highest(p)
      expect(top).toBeGreaterThan(0)
      expect(top).toBeLessThan(PHONE.height * 0.5)
    }
  })

  it('is invisible before its own launch and gone by the end', () => {
    for (const p of pieces) {
      if (p.delay > 1) expect(pieceAt(p, p.delay - 1, PHONE.height).opacity).toBe(0)
      expect(pieceAt(p, CONFETTI_MS, PHONE.height).opacity).toBe(0)
    }
  })

  it('is on its way down by the time the follow-up tray is allowed in', () => {
    const falling = pieces.filter(
      (p) => pieceAt(p, CONFETTI_PEAK_MS + 50, PHONE.height).y > pieceAt(p, CONFETTI_PEAK_MS, PHONE.height).y
    )
    expect(falling.length / pieces.length).toBeGreaterThan(0.8)
  })
})
