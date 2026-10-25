import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { makeMutable } from 'react-native-reanimated'

import { MONOGRAM_PATH } from '../components/ds/DiscMark'
import { OUTLINE_LENGTH, PullIndicator } from '../components/pulse/PullIndicator'

/** The length of each subpath of the monogram's outline, by sampling its curves. */
function subpathLengths(d: string): number[] {
  const tokens = d.match(/[MLCZ]|-?\d+\.?\d*/g) ?? []
  const lengths: number[] = []
  let cur = [0, 0]
  let start = [0, 0]
  let total = 0
  const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1])
  for (let i = 0; i < tokens.length; ) {
    const c = tokens[i++]
    if (c === 'M') {
      if (total) lengths.push(total)
      total = 0
      cur = [Number(tokens[i]), Number(tokens[i + 1])]
      start = cur
      i += 2
    } else if (c === 'L') {
      const p = [Number(tokens[i]), Number(tokens[i + 1])]
      i += 2
      total += dist(cur, p)
      cur = p
    } else if (c === 'C') {
      const [p1, p2, p3] = [0, 2, 4].map((k) => [Number(tokens[i + k]), Number(tokens[i + k + 1])])
      i += 6
      let prev = cur
      for (let k = 1; k <= 40; k++) {
        const t = k / 40
        const u = 1 - t
        const q = [0, 1].map((a) => u ** 3 * cur[a] + 3 * u * u * t * p1[a] + 3 * u * t * t * p2[a] + t ** 3 * p3[a])
        total += dist(prev, q)
        prev = q
      }
      cur = p3
    } else if (c === 'Z') {
      total += dist(cur, start)
      cur = start
    }
  }
  if (total) lengths.push(total)
  return lengths
}

it('the dash is at least as long as the longest stroke of the outline, so every stroke finishes tracing', () => {
  expect(OUTLINE_LENGTH).toBeGreaterThanOrEqual(Math.max(...subpathLengths(MONOGRAM_PATH)))
})

it('draws the outline as a stroke (a dash, not a clip) and hides it from a screen reader', async () => {
  await render(<PullIndicator progress={makeMutable(0.5)} />)
  const mark = screen.getByTestId('pull-indicator', { includeHiddenElements: true })
  expect(mark.props.accessibilityElementsHidden).toBe(true)
  expect(mark.props.pointerEvents).toBe('none')
  const [path] = screen.root!.queryAll((n) => n.props.strokeDasharray !== undefined)
  expect(path.props.strokeDasharray).toEqual([OUTLINE_LENGTH, OUTLINE_LENGTH])
  expect(path.props.d).toBe(MONOGRAM_PATH)
})
