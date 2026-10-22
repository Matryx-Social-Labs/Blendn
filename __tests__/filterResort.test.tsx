/**
 * Filter re-sort (motion #38): the list jumps to the top; leaving rows fade over quick; arriving rows rise 8 pt over base with an
 * 18 ms stagger down the first six; up to twelve rows reflow on a spring, more crossfade; Reduce Motion is a quick crossfade.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

import { DURATION, RISE, STAGGER } from '../lib/design/tokens'
import { RESORT_REFLOW_MAX, RESORT_STAGGER_ROWS, RESORT_WINDOW_MS, reflowsOnSpring, resortDelay } from '../lib/resort'

const src = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('the rules', () => {
  it('the stagger is 18 ms a row, and stops after the sixth', () => {
    expect(STAGGER.tight).toBe(18)
    expect([0, 1, 2, 5, 6, 7, 40].map(resortDelay)).toEqual([0, 18, 36, 90, 108, 108, 108])
    expect(resortDelay(-3)).toBe(0)
    expect(RESORT_STAGGER_ROWS).toBe(6)
  })

  it('a re-sort is over when the last row has arrived, with a little margin', () => {
    expect(RESORT_WINDOW_MS).toBeGreaterThan(resortDelay(RESORT_STAGGER_ROWS) + DURATION.base)
    expect(RESORT_WINDOW_MS).toBeLessThan(500)
  })

  it('up to twelve rows reflow on a spring; thirteen or more crossfade; Reduce Motion never reflows', () => {
    expect(reflowsOnSpring(RESORT_REFLOW_MAX, false)).toBe(true)
    expect(reflowsOnSpring(RESORT_REFLOW_MAX + 1, false)).toBe(false)
    expect(reflowsOnSpring(3, true)).toBe(false)
  })
})

describe('Places wires them', () => {
  const list = src('components/home/PlacesList.tsx')
  const presence = src('components/motion/presence.ts')

  it('jumps to the top when the kind or a filter changes, not when the search is typed', () => {
    expect(list).toContain('const resortKey = `${venueType ?? \'-\'}|${whatsOn}|${radiusKm ?? \'-\'}`')
    expect(list).toContain('scrollToOffset({ offset: 0, animated: false })')
  })

  it('the window opens when the answer is on screen, and only the rows there at the re-sort fade out', () => {
    expect(list).toContain("const answered = state.key === key && state.status === 'ready'")
    expect(list).toMatch(/if \(!resorting \|\| !answered\) return\s*const timer = setTimeout\(\(\) => setSettledKey\(resortKey\), RESORT_WINDOW_MS\)/)
    // Not on the tap: a read slower than the window would lose the rows that arrive.
    expect(list).not.toMatch(/scrollToOffset[^}]*setTimeout/)
    expect(list).toContain('exiting={resorting ? resortOut : undefined}')
  })

  it('rows arrive as a re-sort only while it is under way, so scrolling never replays it', () => {
    expect(list).toContain('entering={resorting ?')
    expect(list).toContain('const resorting = settledKey !== resortKey')
    expect(list).toMatch(/item\.kind === 'title' \|\| item\.kind === 'search'\) return row/)
  })

  it('the rise is RISE.list over base, the exit is quick, and the worklet says so (release crash rule)', () => {
    expect(RISE.list).toBe(8)
    expect(presence).toMatch(/export const resortIn = \(delay: number\) => \(\) => \{\s*'worklet'/)
    expect(presence).toContain('translateY: RISE.list')
    expect(presence).toContain('duration: DURATION.base')
    expect(presence).toMatch(/resortOut = FadeOut\.duration\(DURATION\.quick\)/)
  })

  it('Reduce Motion is the quick crossfade, with no rise', () => {
    expect(list).toContain('reduceMotion ? resortFadeIn')
    expect(presence).toMatch(/resortFadeIn = FadeIn\.duration\(REDUCE_MOTION\.duration\.quick\)/)
  })

  it('the list reflows through the rule, not a flat spring', () => {
    expect(list).toContain('reflowsOnSpring(rows.length, reduceMotion) ? UNFOLD : undefined')
  })
})
