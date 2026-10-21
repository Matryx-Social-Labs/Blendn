#!/usr/bin/env node
/* global __dirname */
/*
 * Fails on UI values that bypass the design system: `lib/theme.ts` for the
 * screens not yet redesigned, `lib/design/tokens.ts` (generated from
 * `design/tokens.json`) for the redesign.
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
 * - a raw colour (`'#hex'`, `rgba()`) — use `COLOR` (or `EMBER` on an
 *   unmigrated screen), or `tint(COLOR.x, a)`
 * - a raw `borderRadius` — use `RADIUS` / `EMBER_RADIUS` (circles are capsules)
 * - a raw `lineHeight` or `textTransform` — the TYPE role sets both
 * - shadows — content is flat (DESIGN-BRIEF §5.5)
 * - glass and blur outside `<Material>`: `BlurView`, `expo-blur` and
 *   `expo-glass-effect` belong to `components/ui/Material.tsx` alone (§5.4)
 * - a gradient outside `<GradientFill>`: `expo-linear-gradient` belongs to
 *   `components/ui/GradientFill.tsx` (and `<Material>`'s Tier B highlight);
 *   the screens drawn before the redesign are listed in `GRADIENT_LEGACY`
 * - a haptic outside the vocabulary: `expo-haptics` belongs to
 *   `lib/haptics.ts` (§10), in `lib/` as well
 * - an icon outside `<Icon>`: `lucide-react-native` belongs to
 *   `components/ui/Icon.tsx`, which keeps the name map and the outline
 * - retired tokens: `EMBER_TYPE`, `EMBER_GRADIENT` and its `gradientFrom/To`,
 *   `EMBER_CONTROL_HEIGHT`, `EMBER_RADIUS.input` — use `TYPE`, a flat
 *   `EMBER.accent`, `CONTROL.lg`, `EMBER_RADIUS.pill`
 * - the legacy `APP_*` palette and the old `Typography` component (also in
 *   `lib/`, where a screen's constants can hide it)
 * - a number added to a safe-area inset (`insets.bottom + 16`) — use SPACE
 * - a literal `minWidth` / `maxWidth` / `minHeight` / `maxHeight` — use
 *   CONTROL, SPACE or a named constant
 * - a literal `opacity: 0.x` — use OPACITY (pressed / disabled) or name it
 *
 * The last three arrived after most screens were written. Every shipped file
 * now follows them; `LATE_RULE_ALLOWLIST` holds only the dev-only previews.
 *
 * A value that genuinely cannot come from the scale (an emoji hero, a glyph
 * drawn to match an image) is allowed with `// design-exception: <reason>` on
 * the same line or the line above. The reason is required.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DIRS = ['app', 'components']
// `lib/` holds constants screens read (tray specs, map styles). Only the rules
// marked `lib` apply there (the legacy palette, haptics); `theme.ts` is where
// the old tokens live.
const LIB_DIR = 'lib'
const LIB_SKIP = new Set(['theme.ts'])
/* The scales come from the redesign's tokens; they are the scales `lib/theme.ts` already used. */
const TOKENS = require('../design/tokens.json')
const SPACE = new Set([0, ...Object.values(TOKENS.space)])
const ICON = new Set([TOKENS.icon.inline, TOKENS.icon.control, TOKENS.icon.nav])

/*
 * Screens drawn before the redesign that use `expo-linear-gradient` directly
 * (photo scrims, avatar discs, the old cards). Each moves to `<GradientFill>`,
 * or to the redesign's own scrim, with its screen. Nothing new joins: the list
 * only shrinks, and `npm run lint:design` names an entry that is clean.
 */
const GRADIENT_LEGACY = Object.fromEntries(
  [
    'components/NearbyEventCard.tsx',
    'components/blendn/Face.tsx',
    'components/scene/SceneHero.tsx',
    'components/scene/SceneSections.tsx',
    'components/screens/EventDetailScreen.tsx',
  ].map((f) => [f, 'pre-redesign: moves to <GradientFill> or the redesign scrim with its screen'])
)

/** An import of `pkg` in any form: `from '…'`, `require('…')`, `import('…')`, spaces allowed. */
const importOf = (pkg) => new RegExp(`(\\bfrom\\s*|\\b(require|import)\\s*\\(\\s*)['"]${pkg}`)

const RULES = [
  {
    id: 'raw-font-size',
    test: /\bfontSize:\s*-?\d/,
    message: 'raw fontSize — use a TYPE role',
  },
  {
    id: 'font-weight',
    test: /\bfontWeight:/,
    message: 'fontWeight — pick the weight through the TYPE role / FONT_FAMILY (EMBER_FONTS) family',
  },
  {
    id: 'legacy-palette',
    test: /\bAPP_(COLORS|SPACING|RADIUS|SIZE|CTA|ELEVATION)\b/,
    message: 'legacy APP_* token — use EMBER / SPACE / ICON / CONTROL / EMBER_RADIUS',
    lib: true,
  },
  {
    id: 'raw-colour',
    test: /['"`]#[0-9a-fA-F]{3,8}['"`]|\brgba?\(/,
    message: 'raw colour — use a COLOR token (EMBER on an unmigrated screen), or tint(COLOR.x, alpha)',
  },
  {
    id: 'raw-radius',
    test: /\bborder(TopLeft|TopRight|BottomLeft|BottomRight|TopStart|TopEnd|BottomStart|BottomEnd)?Radius(:\s*|=\{)[1-9]/,
    message: 'raw borderRadius — use RADIUS / EMBER_RADIUS (a circle is RADIUS.capsule)',
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
    message: 'shadow — content is flat; separate with surface steps or a hairline (COLOR.hairline)',
  },
  {
    id: 'blur',
    test: new RegExp(`<BlurView\\b|${importOf("expo-(blur|glass-effect)['\"]").source}`),
    message: 'glass or blur outside <Material> — use <Material role>',
    allow: ['components/ui/Material.tsx'],
  },
  {
    id: 'gradient',
    test: importOf("expo-linear-gradient['\"]"),
    message: 'gradient outside <GradientFill> — use <GradientFill gradient="fill" | "brand">',
    allow: ['components/ui/GradientFill.tsx', 'components/ui/Material.tsx'],
    legacy: GRADIENT_LEGACY,
  },
  {
    id: 'haptics',
    test: importOf("expo-haptics['\"]"),
    message: 'expo-haptics outside lib/haptics.ts — use the vocabulary, H.* (DESIGN-BRIEF §10)',
    allow: ['lib/haptics.ts'],
    lib: true,
  },
  {
    id: 'icon',
    test: importOf('lucide-react-native'),
    message: 'lucide-react-native outside <Icon> — use <Icon name> (add the glyph to its map)',
    allow: ['components/ui/Icon.tsx'],
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

/*
 * The three late rules, and the files allowed to break them. Every shipped
 * screen was converted (2026-09-29); only the dev-only design previews remain,
 * and nothing new should join them. `npm run lint:design` names any entry that
 * no longer needs to be here.
 */
const LATE_RULES = [
  {
    id: 'inset-literal',
    test: /\binsets\.(top|bottom|left|right)\s*[-+]\s*[1-9]/,
    message: 'number added to a safe-area inset — use SPACE (insets.bottom + SPACE.lg)',
  },
  {
    id: 'size-literal',
    test: /\b(min|max)(Width|Height):\s*[1-9]/,
    message: 'literal min/max width or height — use CONTROL, SPACE or a named constant',
  },
  {
    id: 'opacity-literal',
    test: /\bopacity:\s*0?\.\d/,
    message: 'literal opacity — use OPACITY.pressed / OPACITY.disabled, or name it',
  },
]

const LATE_RULE_ALLOWLIST = {
  'app/preview/profile.tsx': 'dev-only design preview, not shipped',
}

const SPACING_RE = /\b(padding|margin)(Top|Bottom|Left|Right|Horizontal|Vertical|Start|End)?:\s*(-?\d+(\.\d+)?)\b/g
const GAP_RE = /\b(gap|rowGap|columnGap):\s*(\d+(\.\d+)?)\b/g
const ICON_RE = /<(Ionicons|MaterialIcons|MaterialCommunityIcons|Feather|\w*Icon)\b[^>]*?\bsize=\{(\d+)\}/g

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

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k)
const ruleApplies = (rule, rel, libOnly) =>
  (!libOnly || rule.lib) && !(rule.allow || []).includes(rel) && !has(rule.legacy || {}, rel)

function checkSource(source, file, { libOnly = false } = {}) {
  const rel = file.split(path.sep).join('/')
  const lateAllowed = has(LATE_RULE_ALLOWLIST, rel)
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
      if (ruleApplies(rule, rel, libOnly) && rule.test.test(code)) add(i, rule.message)
    }
    if (libOnly) return

    if (!lateAllowed) {
      for (const rule of LATE_RULES) {
        if (rule.test.test(code)) add(i, rule.message)
      }
    }

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

/**
 * Allowlisted files that no longer break a late rule. The entry should go:
 * a stale allowance is a hole the next literal walks through unseen.
 */
function staleAllowances() {
  const clean = (rel, rules) => {
    const abs = path.join(ROOT, rel)
    if (!fs.existsSync(abs)) return true
    const lines = fs.readFileSync(abs, 'utf8').split('\n')
    return !lines.some((line, i) => !excepted(lines, i) && rules.some((rule) => rule.test.test(line.replace(/(^|[^:])\/\/.*$/, '$1'))))
  }
  const gradient = RULES.find((r) => r.id === 'gradient')
  return [
    ...Object.keys(LATE_RULE_ALLOWLIST).filter((rel) => clean(rel, LATE_RULES)),
    ...Object.keys(GRADIENT_LEGACY).filter((rel) => clean(rel, [gradient])),
  ]
}

module.exports = { findViolations, checkSource, staleAllowances, LATE_RULE_ALLOWLIST, GRADIENT_LEGACY }

if (require.main === module) {
  const args = process.argv.slice(2)
  const violations = findViolations(args.length ? args : undefined)
  for (const v of violations) console.log(`${v.file}:${v.line}  ${v.message}\n    ${v.text}`)
  const files = new Set(violations.map((v) => v.file)).size
  console.log(violations.length ? `\n${violations.length} violations in ${files} files` : 'design tokens: clean')
  if (!args.length) {
    for (const rel of staleAllowances()) console.log(`note: ${rel} is clean — remove its allowance (LATE_RULE_ALLOWLIST / GRADIENT_LEGACY)`)
  }
  process.exit(violations.length ? 1 : 0)
}
