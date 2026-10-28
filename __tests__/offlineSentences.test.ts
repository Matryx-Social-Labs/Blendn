/** SYS-16 (E6): two sentences for two meanings, the same words wherever the meaning is the same. */
import { readFileSync } from 'fs'
import { join } from 'path'

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
const ACTIONS = 'Offline. Some actions won’t work until you’re back.'
const CACHED = 'Offline. Showing what you had.'

it('action surfaces (Me, Friends, Requests, a chat) say the actions sentence', () => {
  expect(read('components/profile/OfflineStrip.tsx')).toContain(`OFFLINE_LINE = '${ACTIONS}'`)
  expect(read('components/RealtimeStatusBanner.tsx')).toContain(`OFFLINE = '${ACTIONS}'`)
  expect(read('components/profile/OfflineStrip.tsx')).not.toContain('You’re offline')
})

it('a cached view (Settings) says the cached sentence', () => {
  expect(read('app/settings.tsx')).toContain(`text="${CACHED}"`)
})
