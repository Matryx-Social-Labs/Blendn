/**
 * A composer's text belongs to the thread it was typed in (RC drive 2 D-B, D-E; `useThreadDraft`).
 *
 * D-E (privacy): a deep link or a push from one open DM to another reused the screen with a new id, and DM 1's text was
 * saved as DM 2's draft. D-B: a text-size remount rendered the new composer before the old one's unmount stored the
 * draft, so it showed the placeholder over the draft it held.
 */
import { act, renderHook } from '@testing-library/react-native'

import { clearOutbox, dmThread, draftOf, readOutbox, setDraft, useThreadDraft } from '../lib/chatOutbox'

const ME = 'user-a'
const DM1 = dmThread('c1', ME)
const DM2 = dmThread('c2', ME)

beforeEach(() => clearOutbox())

it('switching the thread on a mounted composer never writes DM 1’s text under DM 2', async () => {
  setDraft(DM2, 'kai’s own')
  const { result, rerender } = await renderHook(({ thread }: { thread: string | null }) => useThreadDraft(thread), {
    initialProps: { thread: DM1 },
  })
  await act(async () => result.current[1]('only for zoe'))
  // The same screen, given DM 2 (router.push / replace with a new conversationId).
  await rerender({ thread: DM2 })
  expect(result.current[0]).toBe('kai’s own')
  expect(draftOf(DM1)).toBe('only for zoe')
  expect(draftOf(DM2)).toBe('kai’s own')
  // Typing now is DM 2's; DM 1 keeps its own.
  await act(async () => result.current[1]('kai, new'))
  expect(draftOf(DM2)).toBe('kai, new')
  expect(draftOf(DM1)).toBe('only for zoe')
})

it('a thread with no draft shows none of the last thread’s text', async () => {
  const { result, rerender } = await renderHook(({ thread }: { thread: string | null }) => useThreadDraft(thread), {
    initialProps: { thread: DM1 },
  })
  await act(async () => result.current[1]('only for zoe'))
  await rerender({ thread: DM2 })
  expect(result.current[0]).toBe('')
  expect(draftOf(DM2)).toBe('')
})

it('a remount shows the draft it held: stored as typed, not on unmount (D-B)', async () => {
  const first = await renderHook(() => useThreadDraft(DM1))
  await act(async () => first.result.current[1]('draft survives size'))
  // TextSizeBoundary renders the new composer BEFORE the old one unmounts.
  const second = await renderHook(() => useThreadDraft(DM1))
  expect(second.result.current[0]).toBe('draft survives size')
  await act(async () => first.unmount())
  expect(second.result.current[0]).toBe('draft survives size')
})

it('the opener fills an empty composer, and what you typed wins over it on a remount', async () => {
  const first = await renderHook(() => useThreadDraft(DM1, 'Try: which talk?'))
  expect(first.result.current[0]).toBe('Try: which talk?')
  await act(async () => first.result.current[1]('my words'))
  const second = await renderHook(() => useThreadDraft(DM1, 'Try: which talk?'))
  expect(second.result.current[0]).toBe('my words')
})

it('keystrokes are stored quietly; the Banter hears once, when the thread is left', async () => {
  const before = readOutbox()
  const { result, unmount } = await renderHook(() => useThreadDraft(DM1))
  await act(async () => result.current[1]('a'))
  // Stored (a new snapshot) without a listener being called per keystroke.
  expect(readOutbox()).not.toBe(before)
  const heard = jest.fn()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useOutbox } = require('../lib/chatOutbox') as typeof import('../lib/chatOutbox')
  const banter = await renderHook(() => {
    heard()
    return useOutbox()
  })
  const renders = heard.mock.calls.length
  await act(async () => result.current[1]('ab'))
  expect(heard.mock.calls.length).toBe(renders)
  await act(async () => unmount())
  expect(heard.mock.calls.length).toBeGreaterThan(renders)
  expect(banter.result.current.drafts.get(DM1 as string)).toBe('ab')
})
