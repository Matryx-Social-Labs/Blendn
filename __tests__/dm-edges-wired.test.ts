import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Two things the DM screens must keep doing (SCRUM-165, driven 2026-09-18).
 *
 * A thread the other side closed — or where they blocked you — answers
 * "not found", and the screen drew that as "Start the conversation! Send a
 * wave" over a week of vanished messages. And a request card that was just
 * declined came straight back from the cached list until a pull-to-refresh.
 *
 * Literal substrings, like `eventDetails-wired.test.ts`: the failure is a line
 * being deleted, not a line being wrong.
 */
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('a thread that has ended', () => {
  const src = read('app/private-chat/[conversationId].tsx')
  it('treats NOT_FOUND on history as ended, not as empty', () => {
    expect(src).toContain("result.errorCode === 'NOT_FOUND'")
    expect(src).toContain('setEnded(true)')
    expect(src).toContain('This conversation has ended')
  })
  it('does not offer a wave into it', () => {
    // The wave lives in the other branch only.
    const ended = src.indexOf('This conversation has ended')
    const wave = src.indexOf('emptyCtaText}>Send a wave')
    expect(ended).toBeGreaterThan(-1)
    expect(wave).toBeGreaterThan(ended)
  })
})

describe('answering a request', () => {
  it('reloads the list past the cache, so the card stays gone', () => {
    const src = read('app/(tabs)/chat.tsx')
    const at = src.indexOf('Message request ${action}ed')
    const after = src.slice(at, at + 900)
    expect(after).toContain('loadChats(true, true)')
    expect(after).not.toContain('loadChats(false, true)')
  })
})
