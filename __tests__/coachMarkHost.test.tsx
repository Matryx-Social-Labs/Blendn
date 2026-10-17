/**
 * The coach-mark layer (components/ds/CoachMarkHost.tsx): one root host draws
 * every mark and its dim over the whole app. The dim is four rects around the
 * target, a tap on it does nothing, Got it closes.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'
import React, { useRef } from 'react'
import { View } from 'react-native'

import { CoachMarkHost, spotlightMeasure, spotlightRects, useCoachMarkSpot } from '../components/ds/CoachMarkHost'

const WINDOW = { width: 400, height: 800 }

describe('spotlightRects', () => {
  it('four rects around the target grown by the pad, the hole left open', () => {
    const rects = spotlightRects({ x: 24, y: 200, width: 300, height: 100 }, WINDOW, 8)
    expect(rects).toEqual([
      { x: 0, y: 0, width: 400, height: 192 },
      { x: 0, y: 308, width: 400, height: 492 },
      { x: 0, y: 192, width: 16, height: 116 },
      { x: 332, y: 192, width: 68, height: 116 },
    ])
  })

  it('clips to the window when the target runs past an edge', () => {
    const [above, below, left, right] = spotlightRects({ x: -4, y: 760, width: 410, height: 60 }, WINDOW, 8)
    expect(above.height).toBe(752)
    expect(below.height).toBe(0)
    expect(left.width).toBe(0)
    expect(right.width).toBe(0)
  })
})

describe('<CoachMarkHost>', () => {
  beforeEach(() => {
    spotlightMeasure.inWindow = (_node, done) => done({ x: 24, y: 200, width: 300, height: 100 })
  })

  function Screen({ onDismiss, onTarget }: { onDismiss: () => void; onTarget: () => void }) {
    const target = useRef<View>(null)
    useCoachMarkSpot(true, { target, text: 'Hold an event.', place: 'below', radius: 16, onDismiss, onLost: jest.fn(), testID: 'mark' })
    return <View ref={target} testID="target" onStartShouldSetResponder={() => true} onResponderRelease={onTarget} />
  }

  it('a tap on the dim does nothing; Got it closes', async () => {
    const onDismiss = jest.fn()
    await render(
      <>
        <Screen onDismiss={onDismiss} onTarget={jest.fn()} />
        <CoachMarkHost />
      </>
    )
    await act(async () => {})
    for (const dim of screen.getAllByTestId(/^coach-mark-dim-/, { includeHiddenElements: true })) {
      expect(dim.props.onStartShouldSetResponder()).toBe(true)
      fireEvent.press(dim)
    }
    expect(onDismiss).not.toHaveBeenCalled()
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Got it' })))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('draws nothing inline: the screens register a target and the root draws the tip, last in the tree', () => {
    const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8')
    for (const f of ['app/(tabs)/events.tsx', 'app/(tabs)/_layout.tsx', 'components/blendn/BlendnScreen.tsx']) {
      expect(read(f)).not.toMatch(/<CoachMark\b/)
      expect(read(f)).toMatch(/useCoachMarkSpot\(/)
    }
    const root = read('app/_layout.tsx')
    const host = root.indexOf('<CoachMarkHost />')
    expect(host).toBeGreaterThan(root.indexOf('</Stack>'))
    expect(host).toBeGreaterThan(root.indexOf('<SheetHost />'))
    // Nothing after it inside the root view.
    expect(root.slice(host + '<CoachMarkHost />'.length).trimStart().startsWith('</View>')).toBe(true)
  })
})
