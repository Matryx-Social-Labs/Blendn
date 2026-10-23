/**
 * What a crash report may carry (security review of RC drive 5's boundary work): nothing that identifies somebody or
 * opens something. The hooks are taken from the options `initSentry` really passes to `Sentry.init`, and fed one event,
 * one transaction and the breadcrumbs that carry an invite (the API's and the app's), a uuid, a board URL and a secret
 * query parameter, including in a console call's arguments. None of the raw values may come out.
 *
 * Negative controls: `scrubReportText` returning its input fails all three; `scrubBreadcrumb` without its `arguments`
 * line fails the event and breadcrumb tests (console arguments); `scrubEvent` without `transaction` fails the event and
 * transaction tests.
 *
 * Review HIGH-1 / MED-1: every string at any key. Controls: `scrubTransaction` without the span `data` line fails the
 * traced-fetch and span tests; `scrubEvent` without `extra` fails the traced-fetch, logger-details and depth tests.
 * Keys (security review): scrubbing values only fails the keys test; dropping `freeKey` loses a value and fails it too.
 */
const mockInit = jest.fn()
jest.mock('@sentry/react-native', () => ({
  init: (options: unknown) => mockInit(options),
  breadcrumbsIntegration: () => ({}),
  reactNativeTracingIntegration: () => ({}),
}))

type Hooks = {
  beforeSend: (event: object) => object
  beforeBreadcrumb: (breadcrumb: object) => object
  beforeSendTransaction: (event: object) => object
}

const ID = '0b8e6c1e-3d2a-4f7b-9c1d-2a3b4c5d6e7f'
const INVITE = 'inv_Secret42'
const LINK = 'tok_Link77'
const SECRET = 'sig_ABCdef123'
const RAW = [ID, INVITE, LINK, SECRET]
const URL_ = `https://api.blendn.app/api/mobile/friends/invite/${INVITE}?token=${SECRET}`

function hooks(): Hooks {
  let options: Hooks | undefined
  jest.isolateModules(() => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@example.ingest.sentry.io/1'
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../lib/sentry').initSentry()
    options = mockInit.mock.calls.at(-1)?.[0]
  })
  delete process.env.EXPO_PUBLIC_SENTRY_DSN
  if (!options) throw new Error('initSentry did not call Sentry.init')
  return options
}
const leaks = (value: object) => RAW.filter((raw) => JSON.stringify(value).includes(raw))

it('an event: its request, message, transaction, exception and breadcrumbs', () => {
  const { beforeSend } = hooks()
  const out = beforeSend({
    request: { url: URL_ },
    message: `could not open blendn:///f/${LINK}`,
    transaction: `/private-chat/${ID}`,
    exception: { values: [{ type: 'Error', value: `no room ${ID} at /f/${LINK}` }] },
    breadcrumbs: [{ category: 'console', message: `opened ${URL_}`, data: { arguments: ['opened', URL_] } }],
  })
  expect(leaks(out)).toEqual([])
  expect(JSON.stringify(out)).toContain('/friends/invite/:token?token=:redacted')
  expect(JSON.stringify(out)).toContain('/private-chat/:id')
})

it('a breadcrumb as it is recorded: a fetch, a navigation, and a console call with string and object arguments', () => {
  const { beforeBreadcrumb } = hooks()
  const fetch = beforeBreadcrumb({ category: 'fetch', data: { url: URL_, method: 'GET', status_code: 200 } })
  const navigation = beforeBreadcrumb({ category: 'navigation', data: { from: `/f/${LINK}`, to: `/chat/${ID}` } })
  const console = beforeBreadcrumb({
    category: 'console',
    message: `[error-boundary] at /f/${LINK}`,
    data: { logger: 'console', arguments: [`at /f/${LINK}`, { url: URL_, room: ID }, 42, null] },
  })
  for (const crumb of [fetch, navigation, console]) expect(leaks(crumb)).toEqual([])
  // What is not a secret stays as it was.
  expect(fetch).toMatchObject({ data: { method: 'GET', status_code: 200 } })
  expect(console).toMatchObject({ data: { logger: 'console', arguments: [expect.any(String), { url: expect.any(String), room: ':id' }, 42, null] } })
})

it('a transaction: its name and every span, a board fetch among them', () => {
  const { beforeSendTransaction } = hooks()
  const out = beforeSendTransaction({
    transaction: `/f/${LINK}`,
    spans: [
      { description: `GET ${URL_}`, data: { url: URL_ } },
      { description: `GET https://x/api/mobile/events/${ID}/board/${ID}/requests` },
    ],
  })
  expect(leaks(out)).toEqual([])
})

describe('every string, at any key (review HIGH-1, MED-1)', () => {
  // As Sentry 7.11's traced fetch writes a span (`getFetchSpanAttributes`): `url`, `http.url`, `http.query`.
  const traced = 'https://api.blendn.app/api/mobile/friends/invite/abc?q=secret'
  const raw = (value: object) => ['/invite/abc', 'secret'].filter((r) => JSON.stringify(value).includes(r))

  it('a traced fetch to /friends/invite/abc?q=secret leaves neither value anywhere in the transaction', () => {
    const { beforeSendTransaction } = hooks()
    const out = beforeSendTransaction({
      transaction: 'GET /friends/invite/abc',
      contexts: { trace: { op: 'http.client', data: { url: traced, 'http.query': '?q=secret', nested: { deeper: [traced] } } } },
      extra: { request: { url: traced } },
      spans: [
        {
          description: `GET ${traced}`,
          data: { url: traced, 'http.url': traced, 'http.query': '?q=secret', 'http.method': 'GET', 'server.address': 'api.blendn.app' },
        },
      ],
    })
    expect(raw(out)).toEqual([])
    // What is not a value stays: the method, the host, the parameter's name.
    expect(JSON.stringify(out)).toContain('"http.method":"GET"')
    expect(JSON.stringify(out)).toContain('"http.query":"?q=:redacted"')
  })

  it("the logger's details (extra), contexts and breadcrumb data, at any depth, on an error event", () => {
    const { beforeSend } = hooks()
    const out = beforeSend({
      extra: { message: 'failed', details: { body: { link: traced, ids: [ID] } } },
      contexts: { app: { last: `/f/${LINK}` } },
      breadcrumbs: [{ category: 'api', data: { response: { url: traced, room: ID } } }],
    })
    expect(raw(out)).toEqual([])
    expect(leaks(out)).toEqual([])
  })

  it('stops at a bounded depth, and a cycle ends there instead of recursing forever', () => {
    const { beforeSend } = hooks()
    const loop: { self?: unknown; url: string } = { url: traced }
    loop.self = loop
    const out = beforeSend({ extra: { loop } })
    expect(raw(out)).toEqual([])
    expect(JSON.stringify(out)).toContain('[scrubbed: too deep]')
  })

  it('keys too: an object keyed by two uuids and an invite path keeps every value, and no raw key', () => {
    const { beforeSend } = hooks()
    const other = '1c9d7f2e-4b3a-4e8c-8d2f-3a4b5c6d7e8f'
    const out = beforeSend({
      extra: { byEvent: { [ID]: 'first', [other]: 'second', [`/friends/invite/${INVITE}`]: 'third', plain: 'fourth' } },
    }) as { extra: { byEvent: Record<string, string> } }
    expect(leaks(out)).toEqual([])
    expect(JSON.stringify(out)).not.toContain(other)
    expect(Object.values(out.extra.byEvent).sort()).toEqual(['first', 'fourth', 'second', 'third'])
    expect(Object.keys(out.extra.byEvent).sort()).toEqual(['/friends/invite/:token', ':id', ':id#2', 'plain'])
  })
})
