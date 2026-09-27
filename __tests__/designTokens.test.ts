/*
 * Every screen takes its type, spacing and icon sizes from `lib/theme.ts`.
 *
 * The app reached 24 font sizes and 15 horizontal paddings one reasonable
 * local decision at a time; nothing noticed, because each value was fine on
 * its own screen. This is the thing that notices. The rules and the escape
 * hatch are in `scripts/check-design-tokens.js`.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { findViolations, checkSource } = require('../scripts/check-design-tokens')

describe('design tokens', () => {
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

  it('catches colours, radii, shadows, glass and retired tokens', () => {
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
      "// design-exception: Google's own button chrome",
      "const brand = { backgroundColor: '#FFFFFF' }",
    ].join('\n')
    const lines = checkSource(src, 'x.tsx').map((v: { line: number }) => v.line)
    expect(lines).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 8, 9])
  })

  it('only holds lib/ to the legacy-palette rule', () => {
    const src = ["const a = '#FFFFFF'", 'const b = APP_SPACING.md'].join('\n')
    const found = checkSource(src, 'lib/x.ts', { libOnly: true }).map((v: { line: number }) => v.line)
    expect(found).toEqual([2])
  })
})
