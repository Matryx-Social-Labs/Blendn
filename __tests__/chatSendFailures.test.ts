import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The room tells the truth about what it did with your message.
 *
 * ## Why this exists
 *
 * Two ways the chat composer lied, both in the same `try/catch`, both invisible
 * to the type checker because neither is a type error.
 *
 * **1. A moderated-away message looked sent.** When moderation hides content the
 * server returns **200** with `content: null` and `moderation_hidden: true`
 * (`app/api/mobile/chat/groups/[chatGroupId]/messages/route.ts`). The send path
 * checked only `result.success`, which is `true` there — so the optimistic
 * bubble stayed on screen showing the sender their own words while nobody else
 * could see them. Accidental shadowbanning. On reload the same message rendered
 * as an empty bubble, because the text was never stored.
 *
 * **2. Every refusal read "Failed to send message."** The handler ended in a
 * bare `catch {`, which discards the binding. The server distinguishes muted,
 * banned, room-locked, chat-window-closed and spam-blocked, and writes a real
 * sentence for each. All of them arrived as the same generic string, so a muted
 * user retried forever with no idea they were muted.
 *
 * ## Why a source test
 *
 * `app/chat/[id].tsx` is a full screen with sockets, caching and navigation.
 * Rendering it to assert two branches would cost more than it proves, and this
 * repo already prefers a structural assertion where behaviour is impractical to
 * exercise — see `noOrphanComponents.test.ts`. Both invariants are one-line
 * facts about the source, and both regressed silently before.
 */

const CHAT_SCREEN = join(__dirname, '..', 'app', 'chat', '[id].tsx')
const API_CLIENT = join(__dirname, '..', 'lib', 'apiClient.ts')

const chatSource = readFileSync(CHAT_SCREEN, 'utf8')
const apiSource = readFileSync(API_CLIENT, 'utf8')

describe('the chat composer surfaces what the server actually did', () => {
  it('reads moderation_hidden, so a withheld message is not shown as sent', () => {
    expect(chatSource).toContain('moderation_hidden')
  })

  it('binds the caught error instead of discarding it', () => {
    // `catch {` throws away USER_MUTED, CHAT_LOCKED, CHAT_CLOSED and
    // SPAM_BLOCKED, which is every reason the server bothered to distinguish.
    expect(chatSource).not.toMatch(/\}\s*catch\s*\{/)
  })

  it('renders the server sentence rather than a hardcoded failure string', () => {
    expect(chatSource).toMatch(/error instanceof Error \? error\.message/)
  })
})

describe('ApiResponse carries the machine-readable reason', () => {
  it('declares errorCode', () => {
    // Without a field to carry it, every coded refusal degrades to prose and
    // no screen can branch on the reason.
    expect(apiSource).toMatch(/errorCode\?:\s*string/)
  })

  it('populates errorCode from the response body on failure', () => {
    expect(apiSource).toMatch(/errorCode:\s*typeof parsed\.errorCode === 'string'/)
  })
})

/**
 * Moderation events do not share a subscriber set.
 *
 * `chat:messageDeleted` and `chat:memberBanned` read from one
 * `chatModerationSubscriptions` map, so every subscriber received BOTH
 * payloads and each was cast to whichever callback type the emitting branch
 * assumed. `app/chat/[id].tsx` registers a handler for each, so both ran on
 * both events.
 *
 * It was benign only by accident: the delete handler filters on `messageId`,
 * which is undefined on a ban and matches nothing, and the ban handler guards
 * on `banned`, which is undefined on a delete. Either handler gaining a less
 * careful guard turns it into "you have been removed from this chat" shown
 * because somebody's message was deleted.
 */
const socketSource = readFileSync(join(__dirname, '..', 'lib', 'socketClient.ts'), 'utf8')

describe('moderation events have separate subscriber sets', () => {
  it('has one map per event', () => {
    expect(socketSource).toContain('chatMessageDeletedSubscriptions')
    expect(socketSource).toContain('chatMemberBannedSubscriptions')
  })

  it('no longer casts a callback to the other event type', () => {
    // The cast was the tell: it asserted a shape the value did not have.
    expect(socketSource).not.toMatch(/cb as ChatMessageDeletedCallback/)
    expect(socketSource).not.toMatch(/cb as ChatMemberBannedCallback/)
  })

  it('clears both maps on teardown, so neither leaks across reconnects', () => {
    expect(socketSource).toContain('chatMessageDeletedSubscriptions.clear()')
    expect(socketSource).toContain('chatMemberBannedSubscriptions.clear()')
  })
})
