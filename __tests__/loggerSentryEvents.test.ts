/**
 * What a logged error turns into in Sentry (lib/logger `reportToSentry`). Sentry triage, 2026-10-31:
 * - one sentence was split over many issues titled by a minified frame ("b", "baseLog", "reportToSentry"): "[socket]
 *   Connection error" alone was BLENDN-1C (208 events), W, 2G and 2. A logged sentence is one issue, named by itself.
 * - the network not carrying a request (offline, no route, our own deadline) is not a defect: BLENDN-1V, 24, 1M, 25, 23
 *   ("fetch failed: …") and 1K, S (AbortError) were each an Error passed to `Logger.error`. They stay breadcrumbs.
 */
import { Logger } from '../lib/logger'
import { Sentry } from '../lib/sentry'

jest.mock('../lib/sentry', () => ({ Sentry: { addBreadcrumb: jest.fn(), captureException: jest.fn(), captureMessage: jest.fn() } }))
jest.spyOn(console, 'error').mockImplementation(() => {})
jest.spyOn(console, 'warn').mockImplementation(() => {})

const capturedException = Sentry.captureException as jest.Mock
const capturedMessage = Sentry.captureMessage as jest.Mock

beforeEach(() => jest.clearAllMocks())

it('a logged sentence is one issue, fingerprinted by its context and words, not by a minified frame', () => {
  Logger.error('socket', 'Server error', { code: 'x' })
  expect(capturedMessage).toHaveBeenCalledWith('[socket] Server error', expect.objectContaining({ fingerprint: ['logger', 'socket', 'Server error'] }))

  Logger.error('events', 'detail:fetch:error', { error: new Error('Bad gateway') })
  expect(capturedException).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ fingerprint: ['logger', 'events', 'detail:fetch:error'] }))
})

it.each([
  ['expo/fetch offline (Android)', Object.assign(new Error('fetch failed: java.net.UnknownHostException: Unable to resolve host "staging-api.blendn.app"'))],
  ['expo/fetch offline (iOS)', new Error('fetch failed: UnexpectedException: The Internet connection appears to be offline.')],
  ['the XHR transport', new TypeError('Network request failed')],
  ['our own deadline', Object.assign(new Error('Request timed out'), { name: 'AbortError' })],
])('%s is a breadcrumb, not an event', (_label, error) => {
  Logger.error('api', 'Request failed', { error })
  expect(capturedException).not.toHaveBeenCalled()
  expect(capturedMessage).not.toHaveBeenCalled()
  expect(Sentry.addBreadcrumb).toHaveBeenCalled()
})

it('any other error is still an event', () => {
  Logger.error('api', 'Request failed', { error: new Error('Unexpected token < in JSON') })
  expect(capturedException).toHaveBeenCalledTimes(1)
})

/* Not drivable here without a socket server: the shape is pinned. A transport failure warns (a breadcrumb); a refusal errors. */
it('the socket logs a transport failure as a warning and anything else as an error', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../lib/socketClient.ts'), 'utf8') as string
  expect(src).toMatch(/const log = detail\.type === "TransportError" \? Logger\.warn : Logger\.error\s+log\("socket", "Connection error"/)
})
