/**
 * A check-out of yours that this device did not make — the server's sweeper,
 * another phone — reaches every "am I in" reader at once (the Banter's Live
 * now, the centre button), not after their 30 s poll. The server sends your
 * own id unhandled to you, so the socket can tell it is yours.
 */
jest.mock('../lib/apiClient', () => ({
  apiClient: { forgetEventMatches: jest.fn() },
  TokenStorage: { getUser: jest.fn(async () => ({ id: 'me' })) },
}))
jest.mock('../lib/checkIn', () => ({ checkInChanged: jest.fn() }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
jest.mock('../lib/sentry', () => ({ Sentry: { captureMessage: jest.fn(), captureException: jest.fn() } }))

import { readFileSync } from 'fs'
import { join } from 'path'

import { checkInChanged } from '../lib/checkIn'
import { ifItWasMe } from '../lib/socketClient'

const changed = checkInChanged as jest.Mock

beforeEach(() => changed.mockClear())

it('your own check-out says the check-in changed, with its event', async () => {
  await ifItWasMe({ eventId: 'e1', userId: 'me' })
  expect(changed).toHaveBeenCalledWith('e1')
})

it('somebody else leaving the room (a handle) changes nothing of yours', async () => {
  await ifItWasMe({ eventId: 'e1', userId: 'rh_abc' })
  expect(changed).not.toHaveBeenCalled()
})

it('is what the event:checkout handler runs', () => {
  const src = readFileSync(join(__dirname, '..', 'lib', 'socketClient.ts'), 'utf8')
  const handler = src.slice(src.indexOf('sock.on("event:checkout"'), src.indexOf('sock.on("event:interestUpdate"'))
  expect(handler).toContain('void ifItWasMe(data)')
})
