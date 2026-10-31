/*
 * A chat opens at its newest message, however long it is.
 *
 * The DM screen scrolled to the end once, 50ms after the first page landed —
 * measuring a list that had laid out 25 of 50 variable-height rows, so a long
 * conversation opened somewhere above where you left off (SCRUM-406). The room
 * found and fixed the same bug on 2026-09-13 by following the end as content
 * lays out, until a real drag. One hook now, used by both.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { followEnd, scrollListToEnd } from '../lib/useFollowEnd'

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')

describe('followEnd', () => {
  it('follows every layout pass until the reader drags', () => {
    const toEnd = jest.fn()
    const f = followEnd(toEnd)
    f.onContentSizeChange()
    f.onContentSizeChange()
    expect(toEnd).toHaveBeenCalledTimes(2)

    f.onScrollBeginDrag()
    f.onContentSizeChange()
    expect(toEnd).toHaveBeenCalledTimes(2)
  })

  it('follows again once the reader is back at the end by hand', () => {
    const toEnd = jest.fn()
    const f = followEnd(toEnd)
    f.onScrollBeginDrag()
    f.noteAtEnd(false)
    f.onContentSizeChange()
    expect(toEnd).not.toHaveBeenCalled()

    f.noteAtEnd(true)
    f.onContentSizeChange()
    expect(toEnd).toHaveBeenCalledTimes(1)
  })

  it('can be told to stop, for a thread opened at its first unread', () => {
    const toEnd = jest.fn()
    const f = followEnd(toEnd)
    f.stop()
    f.onContentSizeChange()
    expect(toEnd).not.toHaveBeenCalled()
  })
})

describe('a thread opened at its first unread (SCRUM-958)', () => {
  // The jump to the rule overshoots a list that has laid out a few rows: the clamped offset reads as "at the end", and
  // following the end from there dragged the thread to its newest message, away from the rule.
  it('is not pulled to its end by the jump landing short', () => {
    const toEnd = jest.fn()
    const f = followEnd(toEnd)
    f.stop()
    f.noteScroll(true)
    f.onContentSizeChange()
    expect(toEnd).not.toHaveBeenCalled()
  })

  it('follows again once the reader has dragged back to the end', () => {
    const toEnd = jest.fn()
    const f = followEnd(toEnd)
    f.stop()
    f.onScrollBeginDrag()
    f.noteScroll(true)
    f.onContentSizeChange()
    expect(toEnd).toHaveBeenCalledTimes(1)
  })

  it('follows at once when the reader sends', () => {
    const toEnd = jest.fn()
    const f = followEnd(toEnd)
    f.stop()
    f.noteAtEnd(true)
    f.onContentSizeChange()
    expect(toEnd).toHaveBeenCalledTimes(1)
  })
})

describe('scrollListToEnd', () => {
  it("asks the ScrollView, not FlatList’s estimate", () => {
    const native = { scrollToEnd: jest.fn() }
    const list = { getScrollResponder: () => native, scrollToEnd: jest.fn() }
    scrollListToEnd(list as never, true)
    expect(native.scrollToEnd).toHaveBeenCalledWith({ animated: true })
    expect(list.scrollToEnd).not.toHaveBeenCalled()
  })
  it('does nothing before the list mounts', () => {
    expect(() => scrollListToEnd(null, false)).not.toThrow()
  })
})

describe('both chat screens use it', () => {
  it.each([
    ['app', 'private-chat', '[conversationId].tsx'],
    ['app', 'chat', '[id].tsx'],
  ])('%s/%s/%s', (...p) => {
    const src = read(...p)
    expect(src).toMatch(/useFollowEnd\(/)
    // The DM hands it over only while the thread has rows (RC drive 3 D-A: an empty thread opens at its opener).
    expect(src).toMatch(/onContentSizeChange=\{(?:follow\.onContentSizeChange|followFeed)\}/)
    expect(src).toMatch(/follow\.onContentSizeChange/)
    // The timer that measured half a list.
    expect(src).not.toMatch(/setTimeout\(\(\) => scrollToBottom\(false\), 50\)/)
  })

  // FlatList.scrollToEnd aims at the last row by an estimate until that row is
  // measured, and a message just sent never is: on build 121 a reply sent from
  // a little way up stayed below the composer (driven 2026-09-28).
  it.each([
    ['app', 'private-chat', '[conversationId].tsx'],
    ['app', 'chat', '[id].tsx'],
  ])('%s/%s/%s scrolls the native view to its real end', (...p) => {
    const src = read(...p)
    expect(src).toMatch(/scrollListToEnd\(flatListRef\.current, animated\)/)
    expect(src).not.toMatch(/flatListRef\.current\?\.scrollToEnd\(/)
  })

  // Touching the conversation to scroll it puts the keyboard away (owner, 2026-09-28).
  it.each([
    ['app', 'private-chat', '[conversationId].tsx'],
    ['app', 'chat', '[id].tsx'],
  ])('%s/%s/%s closes the keyboard on a drag', (...p) => {
    // iOS interactively, with the drag; Android on the drag (R3-D5 5.3).
    const src = read(...p)
    expect(src).toContain("const KEYBOARD_DISMISS = Platform.OS === 'ios' ? 'interactive' : 'on-drag'")
    expect(src).toContain('keyboardDismissMode={KEYBOARD_DISMISS}')
  })
})

describe('the reply quote', () => {
  it('widens a short reply to fit, rather than wrapping in the width "Ok" leaves', () => {
    // flex: 1 is a zero basis: the quote never asked for width, and a reply
    // saying "Repro" drew its quote as "Vikra… / unrea / d se…" (simulator, 2026-09-28).
    // The DS quote asks for its width (no zero-basis flex) and stays one line.
    const quote = read('components', 'ds', 'ReplyPreview.tsx')
    expect(quote).toMatch(/quote: \{ borderLeftWidth: 2,/)
    expect(quote).not.toMatch(/quote: \{[^}]*flex: 1/)
  })
})

describe('the read tick', () => {
  it('is white, not the grey delivered wears — two greys a step apart read as one on the phone', () => {
    expect(read('components', 'ds', 'ReceiptMark.tsx')).toContain("const color = state === 'read' ? COLOR.textPrimary : COLOR.textTertiary")
  })
})
