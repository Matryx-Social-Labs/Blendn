#!/usr/bin/env node
/* global __dirname */
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
 * - the legacy `APP_*` palette and the old `Typography` component
 *
 * A value that genuinely cannot come from the scale (an emoji hero, a glyph
 * drawn to match an image) is allowed with `// design-exception: <reason>` on
 * the same line or the line above. The reason is required.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DIRS = ['app', 'components']
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
    test: /\bAPP_(COLORS|SPACING|RADIUS|SIZE|CTA)\b/,
    message: 'legacy APP_* token — use EMBER / SPACE / ICON / CONTROL / EMBER_RADIUS',
  },
  {
    id: 'legacy-typography',
    test: /from ['"][./]*(lib\/typography|components\/Typography|\.\/Typography)['"]/,
    message: 'old Typography — use components/ui/Text',
  },
]

const SPACING_RE = /\b(padding|margin)(Top|Bottom|Left|Right|Horizontal|Vertical|Start|End)?:\s*(-?\d+(\.\d+)?)\b/g
const GAP_RE = /\b(gap|rowGap|columnGap):\s*(\d+(\.\d+)?)\b/g
const ICON_RE = /<(Ionicons|MaterialIcons|MaterialCommunityIcons|Feather)\b[^>]*?\bsize=\{(\d+)\}/g

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

function excepted(lines, i) {
  return /design-exception:\s*\S/.test(lines[i]) || (i > 0 && /design-exception:\s*\S/.test(lines[i - 1]))
}

function checkSource(source, file) {
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

    for (const rule of RULES) if (rule.test.test(code)) add(i, rule.message)

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

function findViolations(files = allFiles()) {
  return files.flatMap((f) => {
    const abs = path.resolve(ROOT, f)
    return checkSource(fs.readFileSync(abs, 'utf8'), path.relative(ROOT, abs))
  })
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
