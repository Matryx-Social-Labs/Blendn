#!/usr/bin/env node
/* global __dirname */
/*
 * Writes `lib/design/tokens.ts` from `design/tokens.json`, the redesign's token
 * export (the Claude Design project's `tokens/tokens.json`, copied verbatim).
 *
 *   npm run tokens
 *
 * Plain data out, the shapes React Native takes: camelCase keys, colours as
 * strings, CSS gradients as stops, cubic-beziers as 4-tuples, springs as
 * `{ stiffness, damping, mass }`, and Reduce Motion as its own table.
 * `__tests__/designTokensGenerated.test.ts` fails if the committed file is not
 * what this produces, so a token is changed in the JSON and regenerated, never
 * edited in the output.
 *
 * Not emitted: the map ramps (oklch, which React Native cannot parse; they
 * arrive with the map's redesign), the Apple duration/bounce form of each
 * spring, and `kinds` (the CSS manifest's metadata).
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SOURCE = path.join(ROOT, 'design/tokens.json')
const OUTPUT = path.join(ROOT, 'lib/design/tokens.ts')

const camel = (s) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())
const camelKeys = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [camel(k), v]))
const omit = (o, keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)))

/** Splits on commas outside parentheses: `a(1,2),b` → `['a(1,2)', 'b']`. */
function splitTop(s) {
  const parts = []
  let depth = 0
  let start = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++
    else if (s[i] === ')') depth--
    else if (s[i] === ',' && depth === 0) {
      parts.push(s.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(s.slice(start).trim())
  return parts
}

function fail(what, value) {
  throw new Error(`generate-design-tokens: cannot read ${what}: ${JSON.stringify(value)}`)
}

/** `linear-gradient(135deg,#A 0%,#B 50%,#C 100%)` → `{ angle, colors, locations }`. */
function percentGradient(css) {
  const m = /^linear-gradient\((\d+)deg,(.*)\)$/.exec(css)
  if (!m) fail('gradient', css)
  const stops = splitTop(m[2]).map((stop) => /^(.*\S)\s+(\d+(?:\.\d+)?)%$/.exec(stop) || fail('gradient stop', stop))
  return { angle: Number(m[1]), colors: stops.map((s) => s[1]), locations: stops.map((s) => Number(s[2]) / 100) }
}

/** `linear-gradient(180deg,A 0,B 12px)` → `{ colors, height }`: a highlight `height` pt deep from the top. */
function highlight(css) {
  const m = /^linear-gradient\(180deg,(.*)\)$/.exec(css)
  if (!m) fail('highlight', css)
  const stops = splitTop(m[1]).map((stop) => /^(.*\S)\s+(\d+)(?:px)?$/.exec(stop) || fail('highlight stop', stop))
  return { colors: stops.map((s) => s[1]), height: Number(stops[stops.length - 1][2]) }
}

/** `0.5px solid rgba(…)` → `{ width, color }`. */
function border(css) {
  const m = /^(\d+(?:\.\d+)?)px solid (.+)$/.exec(css) || fail('border', css)
  return { width: Number(m[1]), color: m[2] }
}

/** `0 0 16px rgba(…),0 0 28px rgba(…)` → `[{ radius, color }, …]`, centred glows only. */
function glows(css) {
  return splitTop(css).map((layer) => {
    const m = /^0 0 (\d+)px (.+)$/.exec(layer) || fail('glow', layer)
    return { radius: Number(m[1]), color: m[2] }
  })
}

function bezier(css) {
  if (css === 'linear') return [0, 0, 1, 1]
  const m = /^cubic-bezier\(([^)]*)\)$/.exec(css) || fail('easing', css)
  return m[1].split(',').map(Number)
}

/** The family name `useFonts` registers each weight under: `Satoshi_700Bold`, `GeistMono_500Medium`. */
function fontName(family, weight, weights) {
  const name = Object.keys(weights).find((k) => weights[k] === weight) || fail('weight', weight)
  return `${family.replace(/\s/g, '')}_${weight}${name[0].toUpperCase()}${name.slice(1)}`
}

/** Any CSS left in a value would reach a style prop as a string React Native ignores. */
function assertNoCss(name, value) {
  const text = JSON.stringify(value)
  if (/gradient\(|\dpx\b|solid /.test(text)) fail(`${name} (CSS left in the output)`, value)
  return value
}

function build(json) {
  const { color, material, type, motion, palettes } = json
  const families = { brand: type.families.brand[0], mono: type.families.mono[0] }

  const roles = Object.fromEntries(
    Object.entries(type.roles).map(([role, r]) => [
      camel(role),
      {
        fontFamily: fontName(families[r.family], r.weight, type.weights),
        fontSize: r.size,
        lineHeight: r.lineHeight,
        letterSpacing: r.tracking,
        ...(r.transform ? { textTransform: r.transform } : {}),
      },
    ])
  )
  const maxScale = Object.fromEntries(Object.entries(type.roles).map(([role, r]) => [camel(role), r.maxScale]))

  const tokens = {
    COLOR: camelKeys(omit(color, ['gradient-brand', 'gradient-fill'])),
    GRADIENT: { brand: percentGradient(color['gradient-brand']), fill: percentGradient(color['gradient-fill']) },
    MATERIAL: {
      ...camelKeys(omit(material, ['glass-edge', 'solid-inner-highlight', 'glow-check-in'])),
      glassEdge: border(material['glass-edge']),
      solidInnerHighlight: highlight(material['solid-inner-highlight']),
      glowCheckIn: glows(material['glow-check-in']),
    },
    // Only the weights a role uses: each one is a file every cold start loads.
    FONT_FAMILY: Object.fromEntries(
      Object.entries(families).map(([key, family]) => {
        const used = Object.values(type.roles).filter((r) => r.family === key).map((r) => r.weight)
        if (key === 'mono') used.push(type.numeric.weight)
        const weights = [...new Set(used)].sort((a, b) => a - b)
        return [key, Object.fromEntries(weights.map((w) => [w, fontName(family, w, type.weights)]))]
      })
    ),
    TYPE: roles,
    MAX_FONT_SCALE: maxScale,
    /** The `numeric` role: every price, time, date, count and code. Size is the host role's − 1, never under `TYPE_FLOOR`. */
    NUMERIC: { fontFamily: fontName(families.mono, type.numeric.weight, type.weights), fontVariant: ['tabular-nums'] },
    TYPE_FLOOR: type.floor,
    SPACE: camelKeys(json.space),
    RADIUS: camelKeys(json.radius),
    SIZE: camelKeys(json.size),
    ICON: camelKeys(json.icon),
    SPRING: Object.fromEntries(
      Object.entries(motion.springs).map(([k, s]) => [k, { stiffness: s.stiffness, damping: s.damping, mass: s.mass }])
    ),
    // `hold-staff` is dropped: ROUND3 G3 removed the staff hold (staff type the door pass's rotating code).
    DURATION: camelKeys(omit(motion.durations, ['hold-staff'])),
    EASING: Object.fromEntries(Object.entries(motion.easings).map(([k, v]) => [camel(k), bezier(v)])),
    STAGGER: camelKeys(motion.staggers),
    PRESS: camelKeys(motion.press),
    RISE: camelKeys(motion.rise),
    ORBS: camelKeys(motion.orbs),
    SHAKE: { distance: motion.shake.distance, duration: motion.durations[motion.shake.duration] },
    REDUCE_MOTION: {
      duration: camelKeys(motion.durationsReduceMotion),
      rise: camelKeys(motion.riseReduceMotion),
      orbs: camelKeys(motion.orbsReduceMotion),
      shake: camelKeys(motion.shakeReduceMotion),
    },
    CREATURE_PALETTES: palettes.creature,
    VENUE_PLATES: camelKeys(palettes.plate),
    PALETTE_GLYPH: { creature: palettes.creatureGlyph, plate: palettes.plateGlyph },
  }
  for (const [name, value] of Object.entries(tokens)) assertNoCss(name, value)
  return tokens
}

const DOCS = {
  COLOR: 'Colour, DESIGN-BRIEF §4. Dark only. `textOnGradient` is white on `GRADIENT.fill`; `textOnOrangeFlat` is ink on `brandOrange` (white on it is 3.50:1).',
  GRADIENT: 'The two gradients, 135° top-left → bottom-right (§4.3). `brand` for the mark and graphics, `fill` for any surface with white text on it. Drawn only by `<GradientFill>`.',
  MATERIAL: 'Material tiers (§5): glass (iOS 26+), blur (iOS 16.4–25), solid (Android Tier B, Reduce Transparency). Drawn only by `<Material>`.',
  FONT_FAMILY: 'Registered font names by family and weight (`lib/fonts.ts` loads them). Weight lives in the name: Android ignores `fontWeight` on custom fonts.',
  TYPE: 'Type roles (§6): Satoshi for words, Geist Mono for labels and numbers.',
  MAX_FONT_SCALE: 'How far each role may grow with the phone’s text size.',
  SPRING: 'The seven springs (§9.2), mass 1, one table for both platforms.',
  DURATION: 'Durations in ms. `hold` keeps its speed under Reduce Motion: the hold’s speed is information. The export’s `hold-staff` is dropped: ROUND3 G3 removed the staff hold (staff type the door pass’s rotating code).',
  EASING: 'Cubic-bezier control points, for `Easing.bezier(...)`.',
  REDUCE_MOTION: 'The Reduce Motion values, kept apart so nothing reads them as the defaults (ROUND3 B1). Read through `motionTokens(reduceMotion)` in `lib/motion.ts`.',
}

/** A TS literal in the repo's style: single quotes, bare keys, arrays of scalars on one line. */
function literal(value, indent = '') {
  if (typeof value === 'string') return `'${value.replace(/'/g, "\\'")}'`
  if (typeof value !== 'object') return String(value)
  const inner = indent + '  '
  if (Array.isArray(value)) {
    const items = value.map((v) => literal(v, inner))
    return value.every((v) => typeof v !== 'object') ? `[${items.join(', ')}]` : `[\n${items.map((i) => inner + i).join(',\n')},\n${indent}]`
  }
  const key = (k) => (/^([A-Za-z_$][\w$]*|\d+)$/.test(k) ? k : `'${k}'`)
  const entries = Object.entries(value).map(([k, v]) => `${inner}${key(k)}: ${literal(v, inner)}`)
  return `{\n${entries.join(',\n')},\n${indent}}`
}

function render(json) {
  const tokens = build(json)
  const body = Object.entries(tokens)
    .map(([name, value]) => {
      const doc = DOCS[name] ? `/** ${DOCS[name]} */\n` : ''
      return `${doc}export const ${name} = ${literal(value)} as const\n`
    })
    .join('\n')
  return [
    '/*',
    ' * The redesign’s tokens. GENERATED from design/tokens.json by',
    ' * scripts/generate-design-tokens.js (`npm run tokens`): do not edit by hand.',
    ' * `__tests__/designTokensGenerated.test.ts` fails if this drifts from the JSON.',
    ' *',
    ' * `lib/theme.ts` (EMBER, TYPE, SPACE) is what today’s screens still use; each',
    ' * moves to these as its screen is redesigned.',
    ' */',
    '',
    body,
  ].join('\n')
}

module.exports = { render, build, SOURCE, OUTPUT }

if (require.main === module) {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
  fs.writeFileSync(OUTPUT, render(JSON.parse(fs.readFileSync(SOURCE, 'utf8'))))
  console.log(`wrote ${path.relative(ROOT, OUTPUT)}`)
}
