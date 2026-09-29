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

const chatSource = readFileSync(CHAT_SCREEN, 'utf8')

// "A withheld message is not shown as sent" and "the caught error is bound and
// its sentence shown" are pinned for the room and the DM together in
// `withheldMessage.test.ts`; `errorCode` reaching the caller is pinned against
// a real 403 body in `roomLeaveMuteApi.test.ts`.

describe('a removed message is a placeholder, not a blank', () => {
  /*
   * The history serves a sender their own hidden messages with `content: null`
   * and `moderation_hidden: true` so they know it happened; the screen mapped
   * `content ?? ''` and drew an empty bubble — a column of blanks after a
   * moderator removed three messages, seen on the simulator 2026-09-12.
   */
  const bubble = readFileSync(require.resolve('../components/chat/ChatBubble.tsx'), 'utf8')

  it('carries moderation_hidden from the history into the message', () => {
    expect(chatSource).toMatch(/removed: Boolean\(msg\.moderation_hidden\)/)
  })

  it("keeps your own live removal as a placeholder and drops everyone else's", () => {
    expect(chatSource).toMatch(/const ownRemoval = data\.moderation && data\.userId && data\.userId === currentUser\?\.id/)
    expect(chatSource).toMatch(/\{ \.\.\.m, removed: true, message_text: '' \}/)
  })

  it('the bubble says so, in its own style, with no actions', () => {
    expect(bubble).toContain('This message was removed by moderation.')
    expect(bubble).toMatch(/onLongPress=\{removed \? undefined : onLongPress\}/)
    expect(bubble).toMatch(/bubbleRemoved: \{[\s\S]*?borderStyle: 'dashed'/)
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
