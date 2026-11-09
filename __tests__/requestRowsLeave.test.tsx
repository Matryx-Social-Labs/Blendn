/**
 * Motion audit M6 + M13 (2026-11-01): answering a friend request, withdrawing one or unblocking somebody.
 *
 * M6: both answers dimmed to 45% with no spinner and no `busy`, so the wait looked like a dead row; then the row left in
 * one frame and the list snapped up. Now the answer that was pressed carries the wait (`loading`: busy to a screen reader,
 * a spinner after the grace), the other dims, and the row leaves the way Going's saved rows do (DS #16): a fade over
 * `quick`, the rows below closing the gap on `M.settle`. Reduce Motion: the row goes and the list updates at once.
 *
 * M13: Withdraw (Add friends › Sent) and Unblock removed their row the same way, with no exit.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'
import React from 'react'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))

/* eslint-disable import/first */
import { IncomingRequestRow } from '../components/friends/IncomingRequestRow'
/* eslint-enable import/first */

const request = { id: 'req-ben', person: { userId: 'u_ben', name: 'Ben', photo: null }, createdAt: '2026-09-27T20:00:00Z' }
const state = (label: string) => screen.getByLabelText(label).props.accessibilityState

describe('IncomingRequestRow: the answer in flight', () => {
  it.each([
    ['accept', 'Accept Ben', 'Not now, Ben'],
    ['dismiss', 'Not now, Ben', 'Accept Ben'],
  ] as const)('%s: the pressed answer is busy, the other is dimmed', async (action, pressed, other) => {
    const onRespond = jest.fn()
    const { rerender } = await render(<IncomingRequestRow request={request} busy={false} onRespond={onRespond} />)

    await fireEvent.press(screen.getByLabelText(pressed))
    expect(onRespond).toHaveBeenCalledWith(action)
    await rerender(<IncomingRequestRow request={request} busy onRespond={onRespond} />)

    expect(state(pressed)).toEqual(expect.objectContaining({ busy: true }))
    expect(state(other)).toEqual(expect.objectContaining({ disabled: true, busy: false }))
  })

  it('a failed answer gives the row back: neither is busy or dimmed', async () => {
    const onRespond = jest.fn()
    const { rerender } = await render(<IncomingRequestRow request={request} busy={false} onRespond={onRespond} />)
    await fireEvent.press(screen.getByLabelText('Accept Ben'))
    await rerender(<IncomingRequestRow request={request} busy onRespond={onRespond} />)
    await rerender(<IncomingRequestRow request={request} busy={false} onRespond={onRespond} />)

    expect(state('Accept Ben')).toEqual(expect.objectContaining({ busy: false, disabled: false }))
    expect(state('Not now, Ben')).toEqual(expect.objectContaining({ busy: false, disabled: false }))
  })
})

const ROOT = join(__dirname, '..')
const code = (path: string) =>
  readFileSync(join(ROOT, path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('rows that are answered away leave, and the list closes the gap (DS #16)', () => {
  it('the shared presets are Going’s: a quick fade on the exit curve, the reflow on M.settle', () => {
    const presence = code('components/motion/presence.ts')
    expect(presence).toContain('export const rowOut = FadeOut.duration(DURATION.quick).easing(Easing.bezier(...EASING.exit))')
    expect(presence).toContain(
      'export const rowReflow = LinearTransition.springify().stiffness(SPRING.settle.stiffness).damping(SPRING.settle.damping).mass(SPRING.settle.mass)'
    )
  })

  it.each(['components/friends/IncomingRequestRow.tsx', 'app/friends/add.tsx', 'app/blocked-users.tsx'])('%s: the row fades out, not under Reduce Motion', (path) => {
    expect(code(path)).toContain('exiting={reduceMotion ? undefined : rowOut}')
  })

  it.each(['app/friends/requests.tsx', 'app/friends/add.tsx', 'app/blocked-users.tsx'])('%s: the list closes the gap, not under Reduce Motion', (path) => {
    expect(code(path)).toContain('itemLayoutAnimation={reduceMotion ? undefined : rowReflow}')
  })

  it('Add friends’ request preview is not a list: the rows close the gap themselves', () => {
    expect(code('components/friends/IncomingRequestRow.tsx')).toContain('layout={reduceMotion ? undefined : rowReflow}')
  })
})

/*
 * iOS drive 2026-11-09: the last row's fade ran under the empty state, which arrived at full opacity in the same frame, so
 * "No requests waiting" was drawn across the fading card for the length of the fade. The empty state now waits out the
 * row's `quick` exit and fades in over `base`. Reduce Motion: both are instant, so nothing overlaps.
 */
describe('the empty state after the last row leaves', () => {
  it('the shared preset starts once the row is gone', () => {
    expect(code('components/motion/presence.ts')).toContain(
      'export const emptyAfterRowOut = FadeIn.duration(DURATION.base).delay(DURATION.quick).easing(GENTLE).reduceMotion(ReduceMotion.Never)'
    )
  })

  it.each(['app/friends/requests.tsx', 'app/blocked-users.tsx', 'app/message-requests.tsx'])('%s: the empty state waits for the row, not under Reduce Motion', (path) => {
    expect(code(path)).toContain('entering={reduceMotion ? undefined : emptyAfterRowOut}')
  })
})
