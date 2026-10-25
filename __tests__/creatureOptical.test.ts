/*
 * A creature reads centred in its disc by its ink, not its box (owner, 2026-10-22, like the monogram's MONOGRAM_MASS_X):
 * the lion's mane is a left-only arc, so a box-centred lion sat 11 pt left of its disc on someone's profile (r7 M1).
 * Each glyph's ink is measured here from its own path data — the stroke's length-weighted centroid, a dot as a disc of
 * the stroke's width, round caps on open ends — and `CREATURE_MASS_DX` must carry every glyph's ink to x = 12.
 */
import { CREATURE_GLYPHS, CREATURE_MASS_DX, type CreatureGlyph } from '../components/ds/Creature'
import { ICON } from '../lib/design/tokens'

type Pt = [number, number]
const W = ICON.stroke
const STEPS = 48

/** An SVG arc's points (the spec's endpoint-to-centre conversion, F.6.5). */
function arcPoints(p0: Pt, rx: number, ry: number, phiDeg: number, large: number, sweep: number, p1: Pt): Pt[] {
  if (rx === 0 || ry === 0) return [p0, p1]
  const phi = (phiDeg * Math.PI) / 180
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)]
  const dx = (p0[0] - p1[0]) / 2
  const dy = (p0[1] - p1[1]) / 2
  const x1 = cos * dx + sin * dy
  const y1 = -sin * dx + cos * dy
  rx = Math.abs(rx)
  ry = Math.abs(ry)
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
  if (lambda > 1) {
    rx *= Math.sqrt(lambda)
    ry *= Math.sqrt(lambda)
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1
  const co = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den))
  const cx1 = (co * rx * y1) / ry
  const cy1 = (-co * ry * x1) / rx
  const cx = cos * cx1 - sin * cy1 + (p0[0] + p1[0]) / 2
  const cy = sin * cx1 + cos * cy1 + (p0[1] + p1[1]) / 2
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  const t1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
  let dt = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
  if (!sweep && dt > 0) dt -= 2 * Math.PI
  if (sweep && dt < 0) dt += 2 * Math.PI
  return Array.from({ length: STEPS + 1 }, (_, i) => {
    const t = t1 + (dt * i) / STEPS
    return [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos] as Pt
  })
}

const bezier = (ps: Pt[]): Pt[] =>
  Array.from({ length: STEPS + 1 }, (_, i) => {
    const t = i / STEPS
    let pts = ps
    while (pts.length > 1) pts = pts.slice(1).map((p, k) => [pts[k][0] + (p[0] - pts[k][0]) * t, pts[k][1] + (p[1] - pts[k][1]) * t] as Pt)
    return pts[0]
  })

/** The path as polylines, one per subpath. */
function polylines(d: string): Pt[][] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g) ?? []
  const lines: Pt[][] = []
  let line: Pt[] = []
  let cur: Pt = [0, 0]
  let start: Pt = [0, 0]
  let lastCtrl: Pt | null = null
  let cmd = ''
  let i = 0
  const num = () => Number(tokens[i++])
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++]
    const rel = cmd === cmd.toLowerCase()
    const at = (x: number, y: number): Pt => (rel ? [cur[0] + x, cur[1] + y] : [x, y])
    const C = cmd.toUpperCase()
    let ctrl: Pt | null = null
    if (C === 'M') {
      if (line.length) lines.push(line)
      cur = at(num(), num())
      start = cur
      line = [cur]
      cmd = rel ? 'l' : 'L'
    } else if (C === 'L') {
      cur = at(num(), num())
      line.push(cur)
    } else if (C === 'H') {
      cur = [rel ? cur[0] + num() : num(), cur[1]]
      line.push(cur)
    } else if (C === 'V') {
      cur = [cur[0], rel ? cur[1] + num() : num()]
      line.push(cur)
    } else if (C === 'C' || C === 'S') {
      const c1: Pt = C === 'C' ? at(num(), num()) : lastCtrl ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur
      const c2 = at(num(), num())
      const end = at(num(), num())
      line.push(...bezier([cur, c1, c2, end]).slice(1))
      ctrl = c2
      cur = end
    } else if (C === 'Q') {
      const c1 = at(num(), num())
      const end = at(num(), num())
      line.push(...bezier([cur, c1, end]).slice(1))
      ctrl = c1
      cur = end
    } else if (C === 'A') {
      const [rx, ry, rot, large, sweep] = [num(), num(), num(), num(), num()]
      const end = at(num(), num())
      line.push(...arcPoints(cur, rx, ry, rot, large, sweep, end).slice(1))
      cur = end
    } else if (C === 'Z') {
      line.push(start)
      cur = start
      lines.push(line)
      line = []
    } else {
      throw new Error(`unhandled path command ${cmd}`)
    }
    lastCtrl = ctrl
  }
  if (line.length) lines.push(line)
  return lines
}

/** The glyph's ink centre across x: stroke area by length, a dot as a disc, round caps on open ends. */
function inkCentreX(d: string): number {
  let mass = 0
  let moment = 0
  const add = (m: number, x: number) => {
    mass += m
    moment += m * x
  }
  const cap = (Math.PI * (W / 2) ** 2) / 2
  for (const line of polylines(d)) {
    let length = 0
    for (let k = 1; k < line.length; k++) {
      const [a, b] = [line[k - 1], line[k]]
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1])
      length += seg
      add(seg * W, (a[0] + b[0]) / 2)
    }
    const [first, last] = [line[0], line[line.length - 1]]
    const closed = Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-6 && length > 0.1
    if (!closed) {
      add(cap, first[0])
      add(cap, last[0])
    }
  }
  return moment / mass
}

describe('the creatures’ optical centre', () => {
  const glyphs = Object.keys(CREATURE_GLYPHS) as CreatureGlyph[]

  it('names a shift for every glyph and nothing else', () => {
    expect(Object.keys(CREATURE_MASS_DX).sort()).toEqual([...glyphs].sort())
  })

  it.each(glyphs)('%s: its ink sits on the centre once shifted', (glyph) => {
    expect(inkCentreX(CREATURE_GLYPHS[glyph]) + CREATURE_MASS_DX[glyph]).toBeCloseTo(12, 1)
  })

  it('measures what it claims: a symmetric glyph needs no shift, the lion’s left-only mane needs one', () => {
    expect(inkCentreX('M8 4h8v16H8Z')).toBeCloseTo(12, 6)
    expect(inkCentreX(CREATURE_GLYPHS.lion)).toBeLessThan(11)
  })
})
