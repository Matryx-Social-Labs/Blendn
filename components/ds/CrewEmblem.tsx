import { memo } from 'react'
import { View } from 'react-native'
import { SvgXml } from 'react-native-svg'

import { fnv1a } from '../../lib/pseudonymAvatar'

/*
 * The crew emblem (DESIGN-BRIEF §21.3, SCREENS-ADDITIONS "Emblems and
 * identity"): a crew's face that is not a face. Ported from the design
 * export's guidelines/round2/emblem.js (`window.BNE`) string for string, so
 * the markup below is the design's own; `__tests__/dsCrewEmblem.test.tsx`
 * holds every motif to the design's bytes. An edit here is a design change,
 * made there first.
 */

export const EMBLEM_MOTIFS = ['crescent', 'sunburst', 'tiles', 'rings', 'tide', 'stars', 'bolt', 'arch', 'chevrons', 'orbit', 'sparks', 'waves'] as const
export type EmblemMotif = (typeof EMBLEM_MOTIFS)[number]
export type EmblemVariant = 'glyph' | 'field'

/**
 * OKLCH → sRGB hex (Björn Ottosson's OKLab matrices, the ones CSS Color 4
 * uses), clipped to the sRGB gamut. The design writes its palettes as
 * `oklch()`, which React Native cannot parse.
 */
export function oklchToHex(l: number, c: number, hue: number): string {
  const h = (hue * Math.PI) / 180
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear = [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ]
  const channel = (x: number) => {
    const v = Math.min(1, Math.max(0, x))
    const encoded = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
    return Math.round(encoded * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${linear.map(channel).join('')}`
}

/** emblem.js `PALETTES`: twelve hues 30° apart, a deep base and a mid tone at one luminance each, so no crew looks louder. */
const HUES = [20, 50, 80, 110, 140, 170, 200, 230, 260, 290, 320, 350]
export const EMBLEM_PALETTES = HUES.map((hue) => ({ base: oklchToHex(0.34, 0.07, hue), mid: oklchToHex(0.66, 0.11, hue) }))

/** The squircle (continuous corners) every emblem is cut to, in its 100 × 100 box. */
export const EMBLEM_SQUIRCLE = 'M50 0C86 0 100 14 100 50C100 86 86 100 50 100C14 100 0 86 0 50C0 14 14 0 50 0Z'

const wave = (y: number, x0: number, x1: number, amp: number, len: number) => {
  let d = `M${x0} ${y}`
  for (let x = x0; x < x1; x += len) d += ` q${len / 4} ${-amp} ${len / 2} 0 t${len / 2} 0`
  return d
}
const scallops = (y: number, x0: number, n: number, r: number) => {
  let d = `M${x0} ${y}`
  for (let i = 0; i < n; i++) d += ` a${r} ${r} 0 0 1 ${2 * r} 0`
  return d
}
const plus = (x: number, y: number, s: number) =>
  `<rect x="${x - s / 6}" y="${y - s / 2}" width="${s / 3}" height="${s}"/><rect x="${x - s / 2}" y="${y - s / 6}" width="${s}" height="${s / 3}"/>`
const rays = (cx: number, cy: number, n: number, r0: number, r1: number, half: number, phase: number) => {
  let o = ''
  for (let i = 0; i < n; i++) {
    const a = phase + (i * Math.PI * 2) / n
    const a1 = a - half
    const a2 = a + half
    o += `<polygon points="${cx + r0 * Math.cos(a)},${cy + r0 * Math.sin(a)} ${cx + r1 * Math.cos(a1)},${cy + r1 * Math.sin(a1)} ${cx + r1 * Math.cos(a2)},${cy + r1 * Math.sin(a2)}"/>`
  }
  return o
}
const STARS = [[34, 36, 7], [60, 30, 4], [66, 56, 9], [40, 64, 5], [52, 50, 3]]
const STARFIELD = [
  [12, 18, 3], [30, 10, 5], [52, 22, 2], [74, 12, 6], [90, 30, 3], [22, 40, 7], [46, 46, 3], [68, 38, 4],
  [88, 56, 5], [14, 66, 4], [36, 74, 6], [60, 66, 2], [80, 78, 7], [26, 92, 3], [52, 90, 4], [92, 92, 2],
]

type Draw = (mid: string, base: string) => string

/** `glyph`: one centred shape. */
const GLYPH: Record<EmblemMotif, Draw> = {
  crescent: (m, b) => `<circle cx="50" cy="52" r="30" fill="${m}"/><circle cx="60" cy="45" r="26" fill="${b}"/>`,
  sunburst: (m) => `<g fill="${m}">${rays(50, 50, 12, 14, 40, 0.07, 0)}<circle cx="50" cy="50" r="10"/></g>`,
  tiles: (m) => {
    let o = ''
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if ((r + c) % 2 === 0) o += `<rect x="${23 + c * 18}" y="${23 + r * 18}" width="14" height="14" rx="1"/>`
    return `<g fill="${m}">${o}</g>`
  },
  rings: (m) => `<g fill="none" stroke="${m}" stroke-width="5"><circle cx="50" cy="50" r="12"/><circle cx="50" cy="50" r="24"/><circle cx="50" cy="50" r="36"/></g>`,
  tide: (m) => `<g fill="none" stroke="${m}" stroke-width="5" stroke-linecap="round">${[32, 44, 56, 68].map((y) => `<path d="${wave(y, 16, 84, 5, 17)}"/>`).join('')}</g>`,
  stars: (m) => `<g fill="${m}">${STARS.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`,
  bolt: (m) => `<polygon fill="${m}" points="56,14 32,54 50,54 44,86 68,44 52,44"/>`,
  arch: (m) => `<path fill="${m}" d="M26 82V50a24 24 0 0 1 48 0v32H60V52a10 10 0 0 0-20 0v30Z"/>`,
  chevrons: (m) =>
    `<g fill="none" stroke="${m}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">${[28, 46, 64].map((y) => `<path d="M28 ${y}l22 13 22-13"/>`).join('')}</g>`,
  orbit: (m) =>
    `<g fill="none" stroke="${m}" stroke-width="4"><ellipse cx="50" cy="50" rx="38" ry="13" transform="rotate(-30 50 50)"/></g><circle cx="50" cy="50" r="11" fill="${m}"/><circle cx="${50 + 38 * Math.cos(0.6) * Math.cos(-0.52) - 13 * Math.sin(0.6) * Math.sin(-0.52)}" cy="${50 + 38 * Math.cos(0.6) * Math.sin(-0.52) + 13 * Math.sin(0.6) * Math.cos(-0.52)}" r="4.5" fill="${m}"/>`,
  sparks: (m) => {
    let o = ''
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o += plus(26 + c * 24, 26 + r * 24, 10)
    return `<g fill="${m}">${o}</g>`
  },
  waves: (m) =>
    `<g fill="none" stroke="${m}" stroke-width="5" stroke-linecap="round">${[38, 58, 78].map((y, i) => `<path d="${scallops(y, 14 + (i % 2) * 9, i % 2 ? 3 : 4, 9)}"/>`).join('')}</g>`,
}

/** `field`: the motif runs edge to edge. */
const FIELD: Record<EmblemMotif, Draw> = {
  crescent: (m, b) => `<circle cx="54" cy="58" r="50" fill="${m}"/><circle cx="72" cy="40" r="46" fill="${b}"/>`,
  sunburst: (m) => {
    let o = ''
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + ((i + 0.5) * (Math.PI / 2)) / 6
      const h = 0.055
      o += `<polygon points="0,100 ${160 * Math.cos(a - h)},${100 + 160 * Math.sin(a - h)} ${160 * Math.cos(a + h)},${100 + 160 * Math.sin(a + h)}"/>`
    }
    return `<g fill="${m}">${o}</g>`
  },
  tiles: (m) => {
    let o = ''
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if ((r + c) % 2 === 0) o += `<rect x="${c * 20}" y="${r * 20}" width="20" height="20"/>`
    return `<g fill="${m}">${o}</g>`
  },
  rings: (m) => `<g fill="none" stroke="${m}" stroke-width="6">${[8, 22, 36, 50, 64].map((r) => `<circle cx="50" cy="50" r="${r}"/>`).join('')}</g>`,
  tide: (m) => `<g fill="none" stroke="${m}" stroke-width="5">${[6, 20, 34, 48, 62, 76, 90].map((y) => `<path d="${wave(y, -10, 120, 5, 20)}"/>`).join('')}</g>`,
  stars: (m) => `<g fill="${m}">${STARFIELD.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`,
  bolt: (m) => `<polygon fill="${m}" points="70,-10 24,56 50,56 36,112 86,36 60,36"/>`,
  arch: (m) => `<g fill="${m}">${[-16, 24, 64].map((x) => `<path d="M${x} 112V56a20 20 0 0 1 40 0v56H${x + 30}V58a10 10 0 0 0-20 0v54Z"/>`).join('')}</g>`,
  chevrons: (m) =>
    `<g fill="none" stroke="${m}" stroke-width="7" stroke-linejoin="round">${[-4, 16, 36, 56, 76, 96].map((y) => `<path d="M-6 ${y}l56 18 56-18"/>`).join('')}</g>`,
  orbit: (m) =>
    `<g fill="none" stroke="${m}" stroke-width="3.5">${[0, 60, 120].map((a) => `<ellipse cx="50" cy="50" rx="56" ry="16" transform="rotate(${a} 50 50)"/>`).join('')}</g><circle cx="50" cy="50" r="7" fill="${m}"/>`,
  sparks: (m) => {
    let o = ''
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) o += plus(10 + c * 20, 10 + r * 20, 9)
    return `<g fill="${m}">${o}</g>`
  },
  waves: (m) =>
    `<g fill="none" stroke="${m}" stroke-width="5">${[12, 32, 52, 72, 92].map((y, i) => `<path d="${scallops(y, i % 2 ? -10 : 0, 7, 10)}"/>`).join('')}</g>`,
}

/** One motif's markup in a 100 × 100 box, painted `mid` (and `base` where the motif cuts back into the plate). */
export function motifMarkup(motif: EmblemMotif, variant: EmblemVariant, mid: string, base: string): string {
  return (variant === 'field' ? FIELD : GLYPH)[motif](mid, base)
}

/**
 * A crew's palette and motif, from the server's random `emblemSeed` and
 * nothing else, so the emblem never changes on a rename or as people come and
 * go (a stranger watching could tell). emblem.js takes a number; the server's
 * seed is a string, so it goes through FNV-1a first (the hash a pseudonym's
 * creature uses): palette `n mod 12`, motif `⌊n / 12⌋ mod 12`.
 */
export function emblemFor(seed: string): { palette: number; motif: EmblemMotif } {
  const n = Math.abs(fnv1a(seed))
  return { palette: n % EMBLEM_PALETTES.length, motif: EMBLEM_MOTIFS[Math.floor(n / EMBLEM_PALETTES.length) % EMBLEM_MOTIFS.length] }
}

function emblemXml(seed: string, variant: EmblemVariant) {
  const { palette, motif } = emblemFor(seed)
  const { base, mid } = EMBLEM_PALETTES[palette]
  return `<svg viewBox="0 0 100 100"><defs><clipPath id="sq"><path d="${EMBLEM_SQUIRCLE}"/></clipPath></defs><g clip-path="url(#sq)"><path d="${EMBLEM_SQUIRCLE}" fill="${base}"/>${motifMarkup(motif, variant, mid, base)}</g></svg>`
}

/**
 * A crew's emblem (§21.3): a squircle on one of the 12 palettes, carrying one
 * of the 12 night motifs. A crew is a square; a person is round. No text,
 * creature, face, initials or brand gradient, ever.
 *
 * `field` (the default, as the flows draw it) runs the motif edge to edge;
 * `glyph` is one centred shape. Sizes 24 (chips), 40 (rows), 56 (Banter), 96
 * (cards), 160 (crew detail, the Blend moment).
 *
 * Decorative: the crew's name beside it is what is read. Memoised, so a list
 * of crews re-parses only the emblems that changed.
 *
 * ponytail: drawn through `SvgXml` so the design's markup stays verbatim; if a
 * long list of emblems ever shows up in a profile, render the motifs as
 * react-native-svg elements instead of parsing.
 */
export const CrewEmblem = memo(function CrewEmblem({
  seed,
  size,
  variant = 'field',
  testID,
}: {
  /** The server's `emblemSeed`. Never a crew id or name. */
  seed: string
  size: number
  variant?: EmblemVariant
  testID?: string
}) {
  return (
    <View testID={testID} style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SvgXml testID={testID && `${testID}-xml`} xml={emblemXml(seed, variant)} width={size} height={size} />
    </View>
  )
})
