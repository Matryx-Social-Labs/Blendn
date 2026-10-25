/*
 * Sign in | Create account is the design system's SegmentedControl (the sweep §1): no thumb, width or segment style of its own,
 * and the haptic is the control's (H.select on landing), not the screen's.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const src = readFileSync(join(__dirname, '../app/sign-in.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

it('draws the mode switch with the DS control, disabled while busy', () => {
  expect(src).toMatch(/<SegmentedControl[\s\S]*?items=\{MODE_LABELS\}[\s\S]*?disabled=\{busy\}/)
  expect(src).toMatch(/const MODE_LABELS = \['Sign in', 'Create account'\]/)
})

it('keeps no thumb, segment width or segment style of its own', () => {
  expect(src).not.toMatch(/segmentWidth|thumbX|thumbStyle|segmentThumb|styles\.segment|SEGMENT_EASE/)
})

it('plays no haptic of its own for the switch', () => {
  expect(src).not.toMatch(/H\.select/)
})
