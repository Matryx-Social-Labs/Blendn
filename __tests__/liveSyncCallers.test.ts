/*
 * Launch gate 1 (SCRUM-1173), the callers' half. The room and the DM apply each message from its own socket handler, so
 * a `chat` mark must not re-read them; the Board's posts are on no dirty domain at all (its 30 s poll reads them). An
 * empty `domains` means EVERY domain (lib/useLiveSync.ts), so it is never the way to switch a sync off.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')
/** The options object of a file's (only) `useLiveSync({ ... })` call. */
function liveSyncOptions(path: string): string {
  const src = read(path)
  const start = src.indexOf('useLiveSync({')
  expect(start).toBeGreaterThan(-1)
  return src.slice(start, src.indexOf('\n  })', start))
}

it.each(['components/chat/RoomChat.tsx', 'app/private-chat/[conversationId].tsx'])(
  '%s: no re-read on a chat mark, still on focus and reconnect',
  (path) => {
    const options = liveSyncOptions(path)
    expect(options).toMatch(/syncOnDirty: false/)
    expect(options).toMatch(/domains: \['chat'\]/)
    expect(options).toMatch(/syncOnReconnect: true/)
    expect(options).not.toMatch(/syncOnFocus: false/)
  }
)

it('the Board ignores chat, check-in and interest marks, and keeps its poll', () => {
  const options = liveSyncOptions('app/board/[eventId].tsx')
  expect(options).toMatch(/syncOnDirty: false/)
  expect(options).toMatch(/connectedIntervalMs: BOARD_POLL_MS/)
})

it('no caller passes an empty domains list', () => {
  const files: string[] = []
  const walk = (dir: string) =>
    readdirSync(join(root, dir)).forEach((name) => {
      const path = join(dir, name)
      if (statSync(join(root, path)).isDirectory()) walk(path)
      else if (/\.tsx?$/.test(name)) files.push(path)
    })
  ;['app', 'components', 'lib'].forEach(walk)
  expect(files.filter((f) => /domains:\s*\[\s*\]/.test(read(f)))).toEqual([])
})

it('the event page takes the here-count from a check-in, and re-reads the detail only from a server that sends none', () => {
  const src = read('components/screens/EventDetailScreen.tsx')
  const handler = src.slice(src.indexOf('const handleCheckIn'), src.indexOf('const handleInterest'))
  expect(handler).toMatch(/typeof data\.hereCount !== 'number'/)
  expect(handler).toMatch(/setHereNow\(data\.hereCount\)/)
  // The only detail read left in the handler is the old-server fallback.
  expect(handler.match(/fetchEventDetails\(\)/g)).toHaveLength(1)
  expect(handler).toMatch(/if \(typeof data\.hereCount !== 'number'\) return void fetchEventDetails\(\)/)
})
