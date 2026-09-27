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
})
