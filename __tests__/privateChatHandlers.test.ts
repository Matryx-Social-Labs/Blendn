import { readFileSync } from 'fs'
import { join } from 'path'

/*
 * The DM screen's three socket handlers each get the other two payloads.
 *
 * `subscribeToConversation` keeps one callback set per conversation and the
 * socket layer calls every callback for `private:message`, `private:typing`
 * and `private:read` alike. So `handleRead` ran `data.messageIds.includes`
 * on a message payload and threw, unmounting the screen the moment the
 * other person's first message arrived (simulator, 2026-09-12). Each handler
 * must refuse a payload that is not its own before touching it.
 */
const screen = readFileSync(join(__dirname, '..', 'app', 'private-chat', '[conversationId].tsx'), 'utf8')

const handler = (name: string) => {
  const start = screen.indexOf(`const ${name}`)
  expect(start).toBeGreaterThan(-1)
  return screen.slice(start, screen.indexOf('\n    }\n', start))
}

it('handleNewMessage ignores a payload without a message', () => {
  expect(handler('handleNewMessage')).toMatch(/if \(!\('message' in data\) \|\| !data\.message\) return/)
})

it('handleTyping ignores a payload without isTyping', () => {
  expect(handler('handleTyping')).toMatch(/if \(typeof data\.isTyping !== 'boolean'\) return/)
})

it('handleRead ignores a payload without messageIds', () => {
  const body = handler('handleRead')
  const guard = body.indexOf('Array.isArray(data.messageIds)')
  const use = body.indexOf('data.messageIds.includes')
  expect(guard).toBeGreaterThan(-1)
  expect(use).toBeGreaterThan(guard)
})
