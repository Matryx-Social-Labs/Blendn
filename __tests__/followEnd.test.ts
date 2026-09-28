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
import { followEnd } from '../lib/useFollowEnd'

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

describe('both chat screens use it', () => {
  it.each([
    ['app', 'private-chat', '[conversationId].tsx'],
    ['app', 'chat', '[id].tsx'],
  ])('%s/%s/%s', (...p) => {
    const src = read(...p)
    expect(src).toMatch(/useFollowEnd\(/)
    expect(src).toMatch(/onContentSizeChange=\{follow\.onContentSizeChange\}/)
    // The timer that measured half a list.
    expect(src).not.toMatch(/setTimeout\(\(\) => scrollToBottom\(false\), 50\)/)
  })
})
