/**
 * The drawings: Bengaluru, Mumbai, Delhi.
 *
 * Coordinates are the 400 × 260 scene (see `CityScene`). Each city is a
 * back-to-front list of layers; a moving layer's `box` is the bounds of what it
 * draws, in the same coordinates, before any motion is applied.
 *
 * The landmarks are silhouettes, not portraits. At 340pt wide a dome, a
 * colonnade and a tower with a slanted crown read as Vidhana Soudha and UB City;
 * more detail costs shapes and reads as noise.
 */
import React from 'react'
import {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg'
import { SCENE_FIXED as FIX, seeded, type CityArtKey, type ScenePalette } from '../../lib/cityArt'
import type { Layer } from './CityScene'

type Building = readonly [x: number, w: number, h: number]

/* ---------- shared pieces ---------------------------------------------- */

function sky(id: string, p: ScenePalette, sunX: number, sunY: number) {
  return (
    <>
      <Defs>
        <LinearGradient id={`sky-${id}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={p.sky1} />
          <Stop offset="1" stopColor={p.sky2} />
        </LinearGradient>
        <RadialGradient id={`glow-${id}`}>
          <Stop offset="0" stopColor={p.sun} stopOpacity={0.6} />
          <Stop offset="1" stopColor={p.sun} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={400} height={260} fill={`url(#sky-${id})`} />
      {p.sunO > 0 ? (
        <G opacity={p.sunO}>
          <Circle cx={sunX} cy={sunY + p.sunY} r={44} fill={`url(#glow-${id})`} />
          <Circle cx={sunX} cy={sunY + p.sunY} r={14} fill={p.sun} />
        </G>
      ) : null}
      {p.moon > 0 ? (
        <G opacity={p.moon}>
          <Circle cx={sunX} cy={sunY} r={11} fill={FIX.moon} />
          <Circle cx={sunX + 5} cy={sunY - 3} r={10} fill={p.sky1} />
        </G>
      ) : null}
    </>
  )
}

/** Two twinkling halves, out of phase, so the sky never pulses as one. */
function starLayers(seed: number, p: ScenePalette): Layer[] {
  if (p.stars <= 0) return []
  const r = seeded(seed)
  const halves: React.ReactNode[][] = [[], []]
  for (let i = 0; i < 26; i++) {
    halves[i % 2].push(
      <Circle key={i} cx={r() * 400} cy={r() * 120} r={0.5 + r() * 0.8} fill={FIX.star} />,
    )
  }
  return halves.map((stars, i) => ({
    key: `stars-${i}`,
    box: { x: 0, y: 0, w: 400, h: 122 },
    motion: { kind: 'wave', duration: 6000, phase: i * 0.5, opacity: [0.25 * p.stars, p.stars] },
    draw: <G>{stars}</G>,
  }))
}

function cloudLayers(p: ScenePalette): Layer[] {
  const clouds: [y: number, s: number, duration: number, phase: number][] = [
    [46, 1, 95_000, 0.32],
    [78, 0.7, 120_000, 0.71],
    [30, 0.55, 140_000, 0.14],
  ]
  return clouds.map(([y, s, duration, phase], i) => ({
    key: `cloud-${i}`,
    box: { x: -36 * s, y: y - 14 * s, w: 62 * s, h: 22 * s },
    motion: { kind: 'linear', duration, phase, times: [0, 1], x: [-60, 460] },
    draw: (
      <G transform={`translate(0 ${y}) scale(${s})`} fill={p.cloud} opacity={0.85}>
        <Ellipse cx={0} cy={0} rx={24} ry={7} />
        <Ellipse cx={11} cy={-5} rx={14} ry={8} />
        <Ellipse cx={-10} cy={-3} rx={11} ry={6} />
      </G>
    ),
  }))
}

/** Black kites — the birds, not the paper ones — circling over the city. */
function birdLayers(p: ScenePalette): Layer[] {
  return [
    [0.15, 1],
    [0.4, 0.8],
  ].map(([phase, s], i) => ({
    key: `bird-${i}`,
    box: { x: -7 * s, y: -4 * s, w: 14 * s, h: 6 * s },
    motion: {
      kind: 'linear',
      duration: 28_000,
      phase,
      times: [0, 0.25, 0.5, 0.75, 1],
      x: [40, 140, 250, 150, 40],
      y: [78, 58, 82, 96, 78],
    },
    inner: { kind: 'wave', duration: 1400, scaleY: [1, -0.5] },
    draw: (
      <Path
        d="M-6 0 Q-3 -3 0 0 Q3 -3 6 0"
        transform={`scale(${s})`}
        fill="none"
        stroke={p.bird}
        strokeWidth={1.3}
        strokeLinecap="round"
      />
    ),
  }))
}

function windowsFor(x: number, top: number, w: number, h: number, r: () => number, key: string) {
  const out: React.ReactNode[] = []
  for (let cx = x + 3; cx + 3 <= x + w - 2; cx += 7) {
    for (let cy = top + 5; cy + 4 <= top + h - 4; cy += 9) {
      if (r() < 0.45) continue
      out.push(<Rect key={`${key}-${cx}-${cy}`} x={cx} y={cy} width={3} height={4} />)
    }
  }
  return out
}

function skyline(list: readonly Building[], base: number, seed: number, fill: string, p: ScenePalette) {
  const r = seeded(seed)
  const lit: React.ReactNode[] = []
  const blocks = list.map(([x, w, h], i) => {
    lit.push(...windowsFor(x, base - h, w, h, r, `w${i}`))
    return <Rect key={`b${i}`} x={x} y={base - h} width={w} height={h} fill={fill} />
  })
  return (
    <>
      {blocks}
      {p.win > 0 ? <G fill={FIX.window} opacity={p.win}>{lit}</G> : null}
    </>
  )
}

/**
 * A rain tree (wide, flat canopy — Cubbon Park's) or a gulmohar in flower.
 * Returned as a swaying layer pivoting on its base.
 */
function treeLayer(key: string, x: number, base: number, kind: 'rain' | 'gul', seed: number, p: ScenePalette): Layer {
  const r = seeded(seed)
  const phase = r()
  const duration = 9000 + r() * 4000
  let crown: React.ReactNode
  let box
  if (kind === 'rain') {
    box = { x: x - 36, y: base - 43, w: 72, h: 43 }
    crown = (
      <>
        <Ellipse cx={x} cy={base - 30} rx={30} ry={12} fill={p.tree} />
        <Ellipse cx={x - 16} cy={base - 26} rx={16} ry={9} fill={p.tree} />
        <Ellipse cx={x + 17} cy={base - 27} rx={17} ry={9} fill={p.tree} />
        <Ellipse cx={x - 4} cy={base - 35} rx={15} ry={6} fill={p.tree2} />
      </>
    )
  } else {
    box = { x: x - 22, y: base - 53, w: 44, h: 53 }
    const blooms: React.ReactNode[] = []
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2
      const d = r() * 15
      blooms.push(
        <Circle
          key={i}
          cx={x + Math.cos(a) * d * 1.3}
          cy={base - 35 + Math.sin(a) * d * 0.7}
          r={2 + r() * 1.6}
          fill={p.gulmohar}
        />,
      )
    }
    crown = (
      <>
        <Circle cx={x - 9} cy={base - 32} r={12} fill={p.tree2} />
        <Circle cx={x + 9} cy={base - 33} r={12} fill={p.tree2} />
        <Circle cx={x} cy={base - 41} r={11} fill={p.tree2} />
        {blooms}
      </>
    )
  }
  return {
    key,
    box,
    origin: 'bottom',
    motion: { kind: 'wave', duration, phase, rotate: [-1.6, 1.6] },
    draw: (
      <>
        <Rect x={x - 2} y={base - 24} width={4} height={24} fill={p.trunk} />
        {crown}
      </>
    ),
  }
}

function petalLayers(key: string, x: number, y: number, seed: number, p: ScenePalette): Layer[] {
  const r = seeded(seed)
  return [0, 1, 2].map((i) => {
    const px = x + r() * 16 - 8
    return {
      key: `${key}-${i}`,
      box: { x: px - 2, y: y - 1.2, w: 4, h: 2.4 },
      motion: {
        kind: 'linear',
        duration: 6000,
        phase: i / 3 + r() * 0.1,
        times: [0, 0.12, 1],
        x: [0, 1.9, 16],
        y: [0, 4.3, 36],
        rotate: [0, 26, 220],
        opacity: [0, 1, 0],
      },
      draw: <Ellipse cx={px} cy={y} rx={1.7} ry={1} fill={p.gulmohar} />,
    }
  })
}

function blinkLayer(key: string, cx: number, cy: number, r: number): Layer {
  return {
    key,
    box: { x: cx - r, y: cy - r, w: r * 2, h: r * 2 },
    motion: { kind: 'linear', duration: 1600, times: [0, 0.5, 0.501, 1], opacity: [1, 1, 0.1, 0.1] },
    draw: <Circle cx={cx} cy={cy} r={r} fill={FIX.aviation} />,
  }
}

/** The same outline again as a string of bulbs — how the landmarks are lit on festival nights. */
function bulbs(p: ScenePalette, children: React.ReactNode) {
  if (p.lights <= 0) return null
  return (
    <G
      fill="none"
      stroke={FIX.bulb}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeDasharray="0 4.2"
      opacity={p.lights}
    >
      {children}
    </G>
  )
}

/* ---------- Bengaluru --------------------------------------------------- */

/* Vidhana Soudha: entablature, colonnade block, central tower, the dome, two side domes. */
const VIDHANA_SOUDHA = [
  { t: 'rect', x: 128, y: 158, w: 154, h: 6 },
  { t: 'rect', x: 132, y: 164, w: 146, h: 34 },
  { t: 'rect', x: 180, y: 134, w: 50, h: 24 },
  { t: 'path', d: 'M189 134 C185 116 196 104 205 98 C214 104 225 116 221 134 Z' },
  { t: 'path', d: 'M139 150 C137 142 142 137 146 133 C150 137 155 142 153 150 Z' },
  { t: 'path', d: 'M257 150 C255 142 260 137 265 133 C270 137 275 142 273 150 Z' },
] as const

function shapes(list: typeof VIDHANA_SOUDHA | typeof INDIA_GATE, fill?: string) {
  return list.map((s, i) =>
    s.t === 'rect'
      ? <Rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} fill={fill} />
      : <Path key={i} d={s.d} fill={fill} />,
  )
}

function bengaluru(p: ScenePalette): Layer[] {
  const r = seeded(5)
  const columns: React.ReactNode[] = []
  for (let i = 0; i < 12; i++) {
    columns.push(<Rect key={i} x={139 + i * 11.4} y={170} width={4.2} height={28} fill={p.stone} />)
  }

  const train: React.ReactNode[] = []
  for (let i = 0; i < 3; i++) {
    const x = i * 48
    train.push(
      i === 2
        ? <Path key={`c${i}`} d={`M${x} 199 H${x + 40} Q${x + 47} 199 ${x + 47} 205 V210 H${x} Z`} fill={FIX.metro} />
        : <Rect key={`c${i}`} x={x} y={199} width={46} height={11} rx={2} fill={FIX.metro} />,
      <Rect key={`s${i}`} x={x} y={206} width={i === 2 ? 47 : 46} height={1.5} fill={FIX.metroStripe} />,
    )
    for (let k = 0; k < 4; k++) {
      train.push(<Rect key={`w${i}${k}`} x={x + 5 + k * 9.5} y={201.5} width={6} height={3} fill={p.trainWin} />)
    }
  }

  return [
    { key: 'sky', draw: sky('blr', p, 300, 52) },
    ...starLayers(7, p),
    ...cloudLayers(p),
    ...birdLayers(p),
    {
      key: 'city',
      draw: (
        <>
          {/* Nandi Hills on the horizon */}
          <Path
            d="M0 176 C40 150 80 148 120 160 C160 172 190 150 240 150 C290 150 320 168 360 158 C380 153 392 150 400 152 V260 H0Z"
            fill={p.hill}
          />
          {skyline(
            [[0, 26, 46], [28, 20, 66], [50, 32, 38], [84, 24, 58], [110, 18, 42], [286, 28, 50], [350, 20, 78], [372, 28, 44]],
            204, 11, p.far, p,
          )}
          {/* UB City, with its slanted crown */}
          <Rect x={318} y={86} width={30} height={118} fill={p.ub} />
          <Polygon points="318,86 348,86 342,68 324,68" fill={p.ub} />
          <Rect x={332} y={44} width={2} height={24} fill={p.ub} />
          {p.win > 0 ? <G fill={FIX.window} opacity={p.win}>{windowsFor(318, 88, 30, 114, r, 'ub')}</G> : null}
          {/* Vidhana Soudha */}
          <Rect x={120} y={198} width={170} height={8} fill={p.shade} />
          <Rect x={188} y={124} width={34} height={10} fill={p.shade} />
          <Rect x={136} y={150} width={20} height={8} fill={p.shade} />
          <Rect x={254} y={150} width={20} height={8} fill={p.shade} />
          {shapes(VIDHANA_SOUDHA, p.stone)}
          <Rect x={137} y={170} width={136} height={28} fill={p.shade} />
          {columns}
          <Rect x={126} y={155} width={158} height={3} fill={p.shade} />
          <Rect x={204} y={84} width={2} height={14} fill={p.stone} />
          <Circle cx={205} cy={83} r={2.2} fill={FIX.finial} />
          {bulbs(p, <>{shapes(VIDHANA_SOUDHA)}<Rect x={120} y={198} width={170} height={8} /></>)}
        </>
      ),
    },
    blinkLayer('ub-light', 333, 44, 1.8),
    // Namma Metro, Purple Line
    {
      key: 'metro',
      box: { x: 0, y: 198, w: 148, h: 13 },
      motion: { kind: 'linear', duration: 19_000, phase: 0.35, times: [0, 0.72, 1], x: [-170, 430, 430] },
      draw: (
        <>
          {train}
          {p.win > 0 ? <Circle cx={145} cy={208} r={1.4} fill={FIX.headlight} opacity={p.win} /> : null}
        </>
      ),
    },
    {
      key: 'viaduct',
      draw: (
        <>
          <Rect x={0} y={210} width={400} height={4} fill={p.track} />
          {[30, 112, 194, 276, 358].map((x) => (
            <Rect key={x} x={x} y={214} width={5} height={36} fill={p.track} />
          ))}
        </>
      ),
    },
    // Cubbon Park
    treeLayer('tree-0', 34, 250, 'rain', 3, p),
    treeLayer('tree-1', 86, 250, 'gul', 4, p),
    treeLayer('tree-2', 314, 250, 'gul', 8, p),
    treeLayer('tree-3', 372, 250, 'rain', 9, p),
    {
      key: 'street',
      draw: (
        <>
          <Ellipse cx={160} cy={250} rx={26} ry={7} fill={p.tree} />
          <Ellipse cx={240} cy={251} rx={30} ry={7} fill={p.tree} />
          <Rect x={0} y={249} width={400} height={11} fill={p.road} />
          <Line x1={0} y1={255} x2={400} y2={255} stroke={FIX.roadMark} strokeOpacity={0.3} strokeWidth={1} strokeDasharray="6 8" />
        </>
      ),
    },
    ...petalLayers('petal-a', 86, 222, 21, p),
    ...petalLayers('petal-b', 314, 222, 22, p),
    // A green-and-yellow auto, heading across town
    {
      key: 'auto',
      box: { x: 418, y: 230, w: 26, h: 24 },
      motion: { kind: 'linear', duration: 22_000, phase: 0.32, times: [0, 1], x: [0, -490] },
      draw: (
        <>
          <Path d="M420 250 V241 Q421 237 426 237 H438 Q442 237 442 242 V250 Z" fill={FIX.autoBody} />
          <Path d="M420 240 Q421 232 428 232 H437 Q442 232 442 238 Z" fill={FIX.autoTop} />
          <Rect x={423} y={239} width={6} height={5} rx={1} fill={p.sky2} />
          <Circle cx={424} cy={251} r={2.3} fill={FIX.tyre} />
          <Circle cx={439} cy={251} r={2.3} fill={FIX.tyre} />
          {p.win > 0 ? <Circle cx={420.4} cy={245} r={1.3} fill={FIX.headlight} opacity={p.win} /> : null}
        </>
      ),
    },
  ]
}

/* ---------- Mumbai ------------------------------------------------------ */

function mumbai(p: ScenePalette): Layer[] {
  const deckY = (x: number) => 186 - (5 * (x + 10)) / 420
  let wave = ''
  for (let x = 0; x < 480; x += 40) wave += `M${x} 0 q10 -3 20 0 t20 0 `

  const cables: React.ReactNode[] = []
  const pylons: React.ReactNode[] = []
  for (const px of [160, 262]) {
    for (let i = 0; i < 7; i++) {
      const ty = 106 + i * 6
      for (const d of [-1, 1]) {
        const dx = px + d * (18 + i * 11)
        cables.push(<Line key={`${px}-${i}-${d}`} x1={px} y1={ty} x2={dx} y2={deckY(dx)} />)
      }
    }
    const foot = deckY(px) + 8
    pylons.push(
      <Path
        key={px}
        d={`M${px - 8} ${foot} L${px - 2} 98 L${px + 2} 98 L${px + 8} ${foot} L${px + 4} ${foot} L${px} 140 L${px - 4} ${foot} Z`}
        fill={p.stone}
      />,
    )
  }
  const piers: React.ReactNode[] = []
  for (let x = 20; x < 400; x += 46) piers.push(<Rect key={x} x={x} y={deckY(x) + 3} width={3} height={10} fill={p.shade} />)

  return [
    { key: 'sky', draw: sky('bom', p, 90, 60) },
    ...starLayers(17, p),
    ...cloudLayers(p),
    ...birdLayers(p),
    {
      key: 'sea',
      draw: (
        <>
          {skyline(
            [[0, 14, 22], [16, 10, 34], [28, 16, 18], [300, 12, 40], [314, 16, 26], [332, 10, 52], [344, 18, 30], [364, 14, 44], [380, 20, 24]],
            170, 31, p.far, p,
          )}
          <Defs>
            <LinearGradient id="sea-bom" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={p.sea} />
              <Stop offset="1" stopColor={p.sea2} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={168} width={400} height={92} fill="url(#sea-bom)" />
          {p.sunO > 0 ? (
            <G fill={p.sun} opacity={0.45 * p.sunO} transform={`translate(0 ${p.sunY * 0.2})`}>
              <Rect x={80} y={192} width={20} height={1.5} rx={0.75} />
              <Rect x={84} y={204} width={12} height={1.5} rx={0.75} />
              <Rect x={78} y={218} width={24} height={1.5} rx={0.75} />
            </G>
          ) : null}
        </>
      ),
    },
    ...([[214, 0.22], [236, 0.16], [252, 0.12]] as const).map(([y, o], i): Layer => ({
      key: `waves-${i}`,
      box: { x: 0, y: y - 4, w: 480, h: 6 },
      motion: { kind: 'linear', duration: 7000, phase: i * 0.3, times: [0, 1], x: [0, -40] },
      draw: <Path d={wave} transform={`translate(0 ${y})`} fill="none" stroke={FIX.foam} strokeOpacity={o} strokeWidth={1.2} />,
    })),
    {
      key: 'sealink',
      draw: (
        <>
          <G stroke={p.stone} strokeWidth={0.7} opacity={0.85}>{cables}</G>
          {pylons}
          <Path d="M-10 186 L410 181 L410 185 L-10 190 Z" fill={p.shade} />
          {piers}
        </>
      ),
    },
    ...([[FIX.headlight, 9000, 0.2], [FIX.tailLight, 11_000, 0.6]] as const).map(([fill, duration, phase], i): Layer => ({
      key: `car-${i}`,
      box: { x: -22, y: 182.5, w: 4, h: 4 },
      motion: { kind: 'linear', duration, phase, times: [0, 1], x: [0, 440], y: [0, -5] },
      draw: <Circle cx={-20} cy={184.5} r={1.3} fill={fill} />,
    })),
    {
      key: 'boat',
      box: { x: 300, y: 217, w: 31, h: 24 },
      origin: 'bottom',
      motion: { kind: 'wave', duration: 6400, phase: 0.3, rotate: [-3, 3] },
      draw: (
        <>
          <Path d="M300 232 L330 232 L324 240 L306 240 Z" fill={p.shade} />
          <Rect x={314} y={220} width={1.5} height={12} fill={p.stone} />
          <Path d="M315.5 221 L326 230 L315.5 230 Z" fill={FIX.sail} />
          {p.win > 0 ? <Circle cx={315} cy={219} r={1.3} fill={FIX.headlight} opacity={p.win} /> : null}
        </>
      ),
    },
  ]
}

/* ---------- Delhi ------------------------------------------------------- */

const INDIA_GATE = [
  { t: 'rect', x: 176, y: 118, w: 48, h: 80 },
  { t: 'rect', x: 171, y: 113, w: 58, h: 6 },
  { t: 'rect', x: 181, y: 102, w: 38, h: 11 },
] as const

function delhi(p: ScenePalette): Layer[] {
  const ARCH = 'M191 198 V156 Q200 140 209 156 V198'
  return [
    { key: 'sky', draw: sky('del', p, 90, 56) },
    ...starLayers(27, p),
    ...cloudLayers(p),
    ...birdLayers(p),
    {
      key: 'city',
      draw: (
        <>
          {skyline(
            [[0, 22, 26], [24, 16, 40], [42, 26, 20], [70, 14, 32], [260, 20, 24], [360, 18, 30], [380, 20, 22]],
            200, 41, p.far, p,
          )}
          {/* Kartavya Path across the lawns */}
          <Rect x={0} y={198} width={400} height={62} fill={p.tree2} />
          <Path d="M170 260 L190 204 L210 204 L230 260 Z" fill={p.shade} opacity={0.7} />
          {/* India Gate */}
          {shapes(INDIA_GATE, p.stone)}
          <Path d={`${ARCH} Z`} fill={p.shade} />
          <Ellipse cx={200} cy={101} rx={11} ry={4} fill={p.shade} />
          <Rect x={168} y={198} width={64} height={6} fill={p.shade} />
          {bulbs(p, <>{shapes(INDIA_GATE)}<Path d={ARCH} /></>)}
          {/* Qutub Minar: fluted sandstone, banded by its balconies */}
          <Path d="M314 204 L319 64 L327 64 L332 204 Z" fill={p.sandstone} />
          {[168, 134, 104, 80].map((y, i) => {
            const hw = 11 - i * 1.4
            return <Rect key={y} x={323 - hw} y={y} width={hw * 2} height={3.5} fill={p.shade} />
          })}
          <Rect x={320} y={56} width={6} height={8} fill={p.sandstone} />
          {/* The kite's string, from someone on the lawn */}
          <Path d="M252 150 Q262 186 268 214" fill="none" stroke={p.ink} strokeOpacity={0.5} strokeWidth={0.6} />
        </>
      ),
    },
    blinkLayer('qutub-light', 323, 55, 1.5),
    treeLayer('tree-0', 40, 214, 'rain', 51, p),
    treeLayer('tree-1', 110, 214, 'rain', 52, p),
    treeLayer('tree-2', 270, 214, 'gul', 53, p),
    treeLayer('tree-3', 380, 214, 'rain', 54, p),
    {
      key: 'kite',
      box: { x: 244, y: 131, w: 16, h: 22 },
      origin: 'bottom',
      motion: { kind: 'wave', duration: 8000, rotate: [-7, 6], y: [0, -4] },
      draw: (
        <>
          <Path d="M252 132 L259 142 L252 152 L245 142 Z" fill={FIX.kite} />
          <Line x1={252} y1={132} x2={252} y2={152} stroke={FIX.kiteSpine} strokeWidth={0.6} />
        </>
      ),
    },
  ]
}

export function buildScene(city: CityArtKey, p: ScenePalette): Layer[] {
  if (city === 'bom') return mumbai(p)
  if (city === 'del') return delhi(p)
  return bengaluru(p)
}
