#!/usr/bin/env node
/*
 * Fails on UI values that bypass the design system in `lib/theme.ts`.
 *
 * Why a script and not an ESLint rule: the values live in `StyleSheet.create`
 * objects and JSX props, and a line-level check over source is enough to catch
 * all of them without a custom plugin. `__tests__/designTokens.test.ts` runs it
 * on every `npm test`; `npm run lint:design [files…]` runs it by hand.
 *
 * What it rejects, in `app/` and `components/`:
 * - a raw `fontSize` — use a `TYPE` role (`<Text variant>` or `...TYPE.x`)
 * - `fontWeight` — custom fonts ignore it on Android; weight is the family
 * - padding, margin or gap off `SPACE` (0 2 4 8 12 16 24 32 48)
 * - an icon `size={n}` other than 16, 20, 24, or a decorative 28+
 * - a raw colour (`'#hex'`, `rgba()`) — use `EMBER`, or `tint(EMBER.x, a)`
 * - a raw `borderRadius` — use `EMBER_RADIUS` (circles are `pill`)
 * - a raw `lineHeight` or `textTransform` — the TYPE role sets both
 * - shadows and `BlurView` — surfaces are flat (tasks/lessons.md: no glows,
 *   no glass stacks)
 * - retired tokens: `EMBER_TYPE`, `EMBER_GRADIENT` and its `gradientFrom/To`,
 *   `EMBER_CONTROL_HEIGHT`, `EMBER_RADIUS.input` — use `TYPE`, a flat
 *   `EMBER.accent`, `CONTROL.lg`, `EMBER_RADIUS.pill`
 * - the legacy `APP_*` palette and the old `Typography` component (also in
 *   `lib/`, where a screen's constants can hide it)
 *
 * A value that genuinely cannot come from the scale (an emoji hero, a glyph
 * drawn to match an image) is allowed with `// design-exception: <reason>` on
 * the same line or the line above. The reason is required.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DIRS = ['app', 'components']
// `lib/` holds constants screens read (tray specs, map styles). Only the
// legacy-palette rule applies there; `theme.ts` is where the tokens live.
const LIB_DIR = 'lib'
const LIB_SKIP = new Set(['theme.ts'])
const SPACE = new Set([0, 2, 4, 8, 12, 16, 24, 32, 48])
const ICON = new Set([16, 20, 24])

const RULES = [
  {
    id: 'raw-font-size',
    test: /\bfontSize:\s*-?\d/,
    message: 'raw fontSize — use a TYPE role',
  },
  {
    id: 'font-weight',
    test: /\bfontWeight:/,
    message: 'fontWeight — pick the weight through the TYPE role / EMBER_FONTS family',
  },
  {
    id: 'legacy-palette',
    test: /\bAPP_(COLORS|SPACING|RADIUS|SIZE|CTA|ELEVATION)\b/,
    message: 'legacy APP_* token — use EMBER / SPACE / ICON / CONTROL / EMBER_RADIUS',
  },
  {
    id: 'raw-colour',
    test: /['"`]#[0-9a-fA-F]{3,8}['"`]|\brgba?\(/,
    message: 'raw colour — use an EMBER token, or tint(EMBER.x, alpha)',
  },
  {
    id: 'raw-radius',
    test: /\bborder(TopLeft|TopRight|BottomLeft|BottomRight|TopStart|TopEnd|BottomStart|BottomEnd)?Radius(:\s*|=\{)[1-9]/,
    message: 'raw borderRadius — use EMBER_RADIUS (a circle is EMBER_RADIUS.pill)',
  },
  {
    id: 'raw-line-height',
    test: /\blineHeight:\s*\d/,
    message: 'raw lineHeight — the TYPE role sets it',
  },
  {
    id: 'text-transform',
    test: /\btextTransform:/,
    message: 'textTransform — uppercase `label` text in the string',
  },
  {
    id: 'shadow',
    test: /\bshadow(Color|Opacity|Radius|Offset):/,
    message: 'shadow — surfaces are flat; separate with fill contrast or EMBER.separator',
  },
  {
    id: 'blur',
    test: /<BlurView\b/,
    message: 'BlurView — no glass; use a flat EMBER surface',
  },
  {
    id: 'retired-token',
    test: /\b(EMBER_TYPE|EMBER_GRADIENT|EMBER_CONTROL_HEIGHT|EMBER_GLOW|EMBER_ATMOSPHERE)\b|EMBER_RADIUS\.input\b|EMBER\.(gradientFrom|gradientTo|onGradientChip)\b/,
    message: 'retired token — TYPE / flat EMBER.accent / CONTROL.lg / EMBER_RADIUS.pill',
  },
  {
    id: 'legacy-typography',
    test: /from ['"][./]*(lib\/typography|components\/Typography|\.\/Typography)['"]/,
    message: 'old Typography — use components/ui/Text',
  },
]

const SPACING_RE = /\b(padding|margin)(Top|Bottom|Left|Right|Horizontal|Vertical|Start|End)?:\s*(-?\d+(\.\d+)?)\b/g
const GAP_RE = /\b(gap|rowGap|columnGap):\s*(\d+(\.\d+)?)\b/g
const ICON_RE = /<(Ionicons|MaterialIcons|MaterialCommunityIcons|Feather|\w+Icon)\b[^>]*?\bsize=\{(\d+)\}/g

function listFiles(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFiles(full))
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full)
  }
  return out
}

function allFiles() {
  return DIRS.flatMap((d) => listFiles(path.join(ROOT, d)))
}

function libFiles() {
  return listFiles(path.join(ROOT, LIB_DIR)).filter((f) => !LIB_SKIP.has(path.basename(f)))
}

function excepted(lines, i) {
  return /design-exception:\s*\S/.test(lines[i]) || (i > 0 && /design-exception:\s*\S/.test(lines[i - 1]))
}

function checkSource(source, file, { libOnly = false } = {}) {
  const lines = source.split('\n')
  const found = []
  const add = (i, message) => found.push({ file, line: i + 1, message, text: lines[i].trim() })

  let inComment = false
  lines.forEach((line, i) => {
    // Strip block comments (which may span lines, including JSX `{/* */}`) and
    // line comments, so prose that mentions `fontWeight` is not a violation.
    let code = ''
    let rest = line
    while (rest.length) {
      if (inComment) {
        const end = rest.indexOf('*/')
        if (end === -1) { rest = ''; break }
        inComment = false
        rest = rest.slice(end + 2)
      } else {
        const start = rest.indexOf('/*')
        if (start === -1) { code += rest; break }
        code += rest.slice(0, start)
        inComment = true
        rest = rest.slice(start + 2)
      }
    }
    code = code.replace(/(^|[^:])\/\/.*$/, '$1')
    if (!code.trim() || excepted(lines, i)) return

    for (const rule of RULES) {
      if (libOnly && rule.id !== 'legacy-palette') continue
      if (rule.test.test(code)) add(i, rule.message)
    }
    if (libOnly) return

    for (const m of code.matchAll(SPACING_RE)) {
      if (!SPACE.has(Math.abs(Number(m[3])))) add(i, `${m[1]}${m[2] ?? ''}: ${m[3]} is off the SPACE scale`)
    }
    for (const m of code.matchAll(GAP_RE)) {
      if (!SPACE.has(Number(m[2]))) add(i, `${m[1]}: ${m[2]} is off the SPACE scale`)
    }
    for (const m of code.matchAll(ICON_RE)) {
      const n = Number(m[2])
      if (!ICON.has(n) && n < 28) add(i, `icon size ${n} — use ICON.sm/md/lg (16/20/24)`)
    }
  })
  return found
}

function findViolations(files) {
  const check = (f, opts) => {
    const abs = path.resolve(ROOT, f)
    return checkSource(fs.readFileSync(abs, 'utf8'), path.relative(ROOT, abs), opts)
  }
  if (files) return files.flatMap((f) => check(f, { libOnly: path.relative(ROOT, path.resolve(ROOT, f)).startsWith(LIB_DIR + path.sep) }))
  return [...allFiles().flatMap((f) => check(f)), ...libFiles().flatMap((f) => check(f, { libOnly: true }))]
}

module.exports = { findViolations, checkSource }

if (require.main === module) {
  const args = process.argv.slice(2)
  const violations = findViolations(args.length ? args : undefined)
  for (const v of violations) console.log(`${v.file}:${v.line}  ${v.message}\n    ${v.text}`)
  const files = new Set(violations.map((v) => v.file)).size
  console.log(violations.length ? `\n${violations.length} violations in ${files} files` : 'design tokens: clean')
  process.exit(violations.length ? 1 : 0)
}
