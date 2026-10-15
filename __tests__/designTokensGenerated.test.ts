/*
 * `lib/design/tokens.ts` is generated from `design/tokens.json`, the redesign's
 * token export. A hand edit to the output, or a JSON change nobody regenerated,
 * would leave the app and the design system quietly disagreeing; this fails
 * instead. The fix is `npm run tokens`.
 */
import fs from 'fs'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { render, SOURCE, OUTPUT } = require('../scripts/generate-design-tokens')
import { DURATION, REDUCE_MOTION, SPRING } from '../lib/design/tokens'

describe('generated design tokens', () => {
  it('match what the generator makes from design/tokens.json', () => {
    const expected = render(JSON.parse(fs.readFileSync(SOURCE, 'utf8')))
    expect(fs.readFileSync(OUTPUT, 'utf8')).toBe(expected)
  })

  it('ship the base motion values, with Reduce Motion apart (ROUND3 B1)', () => {
    // The export once listed the Reduce Motion values as the defaults: a motionless app.
    expect(DURATION.base).toBe(220)
    expect(REDUCE_MOTION.duration.base).toBe(200)
    expect(Object.keys(SPRING)).toEqual(['press', 'snap', 'settle', 'travel', 'fling', 'pop', 'celebrate'])
    expect(Object.values(SPRING).every((s) => s.mass === 1)).toBe(true)
    expect('holdStaff' in DURATION).toBe(false)
  })

  it('refuses a CSS value it cannot turn into a React Native one', () => {
    const json = JSON.parse(fs.readFileSync(SOURCE, 'utf8'))
    json.material['glass-edge'] = '1px dashed red'
    expect(() => render(json)).toThrow(/glass-edge|border/)
  })
})
