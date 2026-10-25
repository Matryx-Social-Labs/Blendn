/*
 * Every push and pop follows Reduce Motion (DS #3 rm: "system cross-fade"): any `animation:` in the root layout that
 * slides is behind a `reduceMotion ?` ternary. A slide that ignores the setting moves the whole screen across.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const src = readFileSync(join(__dirname, '../app/_layout.tsx'), 'utf8')
const lines = src.split('\n')

describe('the root layout’s transitions', () => {
  const animations = lines.map((text, i) => ({ text: text.trim(), line: i + 1 })).filter((l) => /\banimation:/.test(l.text) && !l.text.startsWith('*') && !l.text.startsWith('//'))

  it('has transitions to check', () => {
    expect(animations.length).toBeGreaterThanOrEqual(5)
  })

  it.each(animations.map((a) => [a.line, a.text]))('line %i (%s) is none, a fade, or behind reduceMotion', (_line, text) => {
    const value = String(text).replace(/^.*\banimation:\s*/, '')
    const own = /^'none'|^'fade'|^reduceMotion \?|^routeTransition/.test(value)
    expect(own).toBe(true)
  })

  it('the stack’s own transition is the cross-fade under Reduce Motion', () => {
    expect(src).toMatch(/const routeTransition = reduceMotion \? 'fade' :/)
  })

  it('reads Reduce Motion through lib/motion, not a second source', () => {
    expect(src).toMatch(/import \{[^}]*\buseReducedMotion\b[^}]*\} from '\.\.\/lib\/motion'/)
  })

  it('leaves the screens that draw their own motion at none', () => {
    expect(src).toMatch(/name="room" options=\{\{ headerShown: false, animation: 'none' \}\}/)
    expect(src).toMatch(/name="crews\/new"[^\n]*animation: 'none'/)
  })
})

/*
 * Audit M2 (a11y-motion 2026-10-24): a nested stack that names its own transition follows the same rule. Onboarding's
 * steps pushed with a slide under Reduce Motion while the root cross-faded.
 */
describe.each(['onboarding', 'preview', 'chat', 'private-chat'])('app/%s/_layout.tsx', (dir) => {
  const nested = readFileSync(join(__dirname, '../app', dir, '_layout.tsx'), 'utf8')
  const set = nested.split('\n').map((l) => l.trim()).filter((l) => /\banimation:/.test(l) && !l.startsWith('*') && !l.startsWith('//'))

  it.each(set.length ? set : ['(none: the platform default, no push inside)'])('%s is none, a fade, or behind reduceMotion', (text) => {
    if (!/\banimation:/.test(text)) return
    expect(/\banimation:\s*('none'|'fade'|reduceMotion \?)/.test(text)).toBe(true)
  })
})
