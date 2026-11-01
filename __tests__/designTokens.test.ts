/*
 * Every screen takes its type, spacing and icon sizes from `lib/theme.ts`.
 *
 * The app reached 24 font sizes and 15 horizontal paddings one reasonable
 * local decision at a time; nothing noticed, because each value was fine on
 * its own screen. This is the thing that notices. The rules and the escape
 * hatch are in `scripts/check-design-tokens.js`.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { findViolations, checkSource, staleAllowances, LATE_RULE_ALLOWLIST, GRADIENT_LEGACY } = require('../scripts/check-design-tokens')

describe('design tokens', () => {
  /*
   * A raw size passes the checker with a `design-exception` comment, and seven components had used that hatch for type
   * that sat 1 or 2 points off a role (15/20, 13/16, 32/40): drift, not exceptions (SCRUM-865). What may still carry
   * one is what no role can draw: an emoji, the Google mark's label, the one mono value and a motion moment.
   */
  it('keeps a raw type size to the files where no role can draw it (SCRUM-865)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path')
    const root = path.join(__dirname, '..')
    const walk = (dir: string): string[] =>
      fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((d) =>
        d.isDirectory() ? walk(path.join(dir, d.name)) : /\.tsx?$/.test(d.name) ? [path.join(dir, d.name)] : []
      )
    const raw = [...walk('app'), ...walk('components')]
      .filter((f) => /\bfontSize:\s*-?\d/.test(fs.readFileSync(path.join(root, f), 'utf8')))
      .sort()
    expect(raw).toEqual([
      'app/index.tsx', // the Google mark's label, drawn to Google's spec
      'components/chat/ChatParts.tsx', // an emoji in flight
      'components/ds/ChatBubble.tsx', // an emoji-only message
      'components/ds/MomentPour.tsx', // motion #9's "You're in."
      'components/ds/shared.ts', // monoValue, the one mono size between 12 and 40
    ])
  })

  it('app/ and components/ use only the design system', () => {
    const violations = findViolations().map(
      (v: { file: string; line: number; message: string }) => `${v.file}:${v.line} ${v.message}`
    )
    expect(violations).toEqual([])
  })

  it('catches the values it is meant to', () => {
    const src = [
      'const a = { fontSize: 14 }',
      'const b = { paddingHorizontal: 14, gap: 10 }',
      'const c = <Ionicons name="x" size={18} />',
      'const d = { fontWeight: "600" }',
      'const e = { padding: 16, marginTop: -8, gap: 24 }',
      '// design-exception: emoji hero',
      'const f = { fontSize: 128 }',
    ].join('\n')
    const lines = checkSource(src, 'x.tsx').map((v: { line: number }) => v.line)
    expect(lines).toEqual([1, 2, 2, 3, 4])
  })

  it('catches colours, radii, shadows, blur and retired tokens', () => {
    const src = [
      "const a = { color: '#FFFFFF' }",
      "const b = { borderColor: 'rgba(255,255,255,0.08)' }",
      'const c = { borderRadius: 999 }',
      'const d = { borderTopLeftRadius: 4 }',
      'const e = { shadowColor: EMBER.accent }',
      '<BlurView intensity={20} />',
      'const f = { ...EMBER_TYPE.helper }',
      'const g = { lineHeight: 26, textTransform: "uppercase" }',
      '<HeartIcon size={18} />',
      // on the scale: none of these should be reported
      'const ok = { color: EMBER.textPrimary, borderRadius: EMBER_RADIUS.pill, backgroundColor: tint(EMBER.success, 0.16) }',
      'const ok2 = { borderRadius: 0 }',
      "// design-exception: Google’s own button chrome",
      "const brand = { backgroundColor: '#FFFFFF' }",
    ].join('\n')
    const lines = checkSource(src, 'x.tsx').map((v: { line: number }) => v.line)
    expect(lines).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 8, 9])
  })

  it('catches inset arithmetic, min/max sizes and opacity literals', () => {
    const src = [
      'const a = { paddingBottom: insets.bottom + 16 }',
      'const b = { maxWidth: 300, minHeight: 108 }',
      'const c = { opacity: 0.7 }',
      'const d = { opacity: .5 }',
      // on the scale: none of these should be reported
      'const ok = { paddingBottom: insets.bottom + SPACE.lg, minHeight: CONTROL.md, opacity: OPACITY.pressed }',
      'const ok2 = { opacity: 0, maxWidth: "80%" }',
      '// design-exception: decorative art',
      'const art = { opacity: 0.4 }',
    ].join('\n')
    const lines = checkSource(src, 'components/x.tsx').map((v: { line: number }) => v.line)
    expect(lines).toEqual([1, 2, 3, 4])
  })

  it('lets allowlisted files off the late rules only', () => {
    const src = 'const a = { opacity: 0.7, fontSize: 14 }'
    const found = checkSource(src, 'app/preview/profile.tsx').map((v: { message: string }) => v.message)
    expect(found).toEqual(['raw fontSize — use a TYPE role'])
  })

  it('allows only the dev-only previews off the late rules', () => {
    // Every shipped screen was converted; a shipped file joining the list is a regression.
    expect(Object.keys(LATE_RULE_ALLOWLIST).every((f: string) => f.startsWith('app/preview/'))).toBe(true)
    const found = checkSource('const a = { opacity: 0.7 }', 'app/chat/[id].tsx')
    expect(found).toHaveLength(1)
  })

  it('only holds lib/ to the legacy-palette and haptics rules', () => {
    const src = ["const a = '#FFFFFF'", 'const b = APP_SPACING.md', "import { BlurView } from 'expo-blur'"].join('\n')
    const found = checkSource(src, 'lib/x.ts', { libOnly: true }).map((v: { line: number }) => v.line)
    expect(found).toEqual([2])
  })

  it('keeps glass and blur inside <Material>', () => {
    const src = ['<BlurView tint="dark" />', "import { BlurView } from 'expo-blur'", "import { GlassView } from 'expo-glass-effect'"].join('\n')
    expect(checkSource(src, 'components/x.tsx').map((v: { line: number }) => v.line)).toEqual([1, 2, 3])
    expect(checkSource(src, 'components/ui/Material.tsx')).toEqual([])
  })

  it('keeps gradients inside <GradientFill>', () => {
    const src = "import { LinearGradient } from 'expo-linear-gradient'"
    expect(checkSource(src, 'components/x.tsx')).toHaveLength(1)
    expect(checkSource(src, 'components/ui/GradientFill.tsx')).toEqual([])
    // react-native-svg's own LinearGradient is drawing, not a surface fill.
    expect(checkSource("import { LinearGradient } from 'react-native-svg'", 'components/x.tsx')).toEqual([])
  })

  it('lets the pre-redesign gradients stay only until their screens move', () => {
    // The list only shrinks: every entry is a pre-redesign screen, and none is clean.
    expect(Object.values(GRADIENT_LEGACY).every((why) => /^pre-redesign/.test(String(why)))).toBe(true)
    expect(staleAllowances()).toEqual([])
  })

  it('keeps haptics in the vocabulary, in lib/ too', () => {
    const src = "import * as Haptics from 'expo-haptics'"
    expect(checkSource(src, 'components/x.tsx')).toHaveLength(1)
    expect(checkSource("const Haptics = require('expo-haptics')", 'components/x.tsx')).toHaveLength(1)
    expect(checkSource("const Haptics = require ( 'expo-haptics' )", 'components/x.tsx')).toHaveLength(1)
    expect(checkSource("const Haptics = await import('expo-haptics')", 'components/x.tsx')).toHaveLength(1)
    // The name alone is not an import.
    expect(checkSource("const name = 'expo-haptics'", 'components/x.tsx')).toEqual([])
    expect(checkSource(src, 'lib/x.ts', { libOnly: true })).toHaveLength(1)
    expect(checkSource(src, 'lib/haptics.ts', { libOnly: true })).toEqual([])
  })

  it('holds <Icon> to the icon sizes too', () => {
    expect(checkSource('<Icon name="heart" size={18} />', 'app/x.tsx')).toHaveLength(1)
    expect(checkSource('<Icon name="heart" size={ICON.control} />', 'app/x.tsx')).toEqual([])
  })

  it('keeps Lucide behind <Icon>', () => {
    const src = "import ChevronLeft from 'lucide-react-native/icons/chevron-left'"
    expect(checkSource(src, 'app/x.tsx')).toHaveLength(1)
    expect(checkSource(src, 'components/ui/Icon.tsx')).toEqual([])
  })
})
