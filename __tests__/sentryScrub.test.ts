/**
 * What a crash report may carry (security review of RC drive 5's boundary work): nothing that identifies somebody or
 * opens something. The hooks are taken from the options `initSentry` really passes to `Sentry.init`, and fed one event,
 * one transaction and the breadcrumbs that carry an invite (the API's and the app's), a uuid, a board URL and a secret
 * query parameter, including in a console call's arguments. None of the raw values may come out.
 *
 * Negative controls: `scrubReportText` returning its input fails all three; `scrubBreadcrumb` without its `arguments`
 * line fails the event and breadcrumb tests (console arguments); `scrubEvent` without `transaction` fails the event and
 * transaction tests.
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
  expect(JSON.stringify(out)).toContain('/friends/invite/:token?token=:token')
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
  expect(console).toMatchObject({ data: { logger: 'console', arguments: [expect.any(String), expect.any(String), 42, null] } })
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
