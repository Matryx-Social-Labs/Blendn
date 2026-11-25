/*
 * One site host per build (SCRUM-1364, SCRUM-1365): a staging build (EAS `preview`, `EXPO_PUBLIC_SITE_HOST=staging.blendn.app`)
 * sends and opens `https://staging.blendn.app/...`; a production build, with the variable unset, `https://www.blendn.app/...`.
 * Both binaries claim both hosts natively (one bundle id), so the other build's link reaches the app and is handed to
 * the browser, never opened against an API that does not have its id, and never dropped.
 */
import fs from 'fs'
import path from 'path'

const ID = '7f3a2c4e-91d0-4b8a-a1c2-0d5e6f7a8b9c'

type ShareLinks = typeof import('../lib/shareLinks')
type Links = typeof import('../lib/links')
type NativeIntent = typeof import('../app/+native-intent')
type Loaded = { share: ShareLinks; links: Links; intent: NativeIntent; open: jest.Mock; warn: jest.SpyInstance }

/** The modules as a build with this `EXPO_PUBLIC_SITE_HOST` sees them (read once, at load). */
function buildWith(host: string | undefined): Loaded {
  const saved = process.env.EXPO_PUBLIC_SITE_HOST
  if (host === undefined) delete process.env.EXPO_PUBLIC_SITE_HOST
  else process.env.EXPO_PUBLIC_SITE_HOST = host
  let loaded!: Loaded
  try {
    jest.isolateModules(() => {
      const { Logger } = require('../lib/logger')
      const warn = jest.spyOn(Logger, 'warn').mockImplementation(() => {})
      loaded = {
        share: require('../lib/shareLinks'),
        links: require('../lib/links'),
        intent: require('../app/+native-intent'),
        open: require('expo-web-browser').openBrowserAsync,
        warn,
      }
    })
  } finally {
    if (saved === undefined) delete process.env.EXPO_PUBLIC_SITE_HOST
    else process.env.EXPO_PUBLIC_SITE_HOST = saved
  }
  return loaded
}

afterEach(() => jest.restoreAllMocks())

describe('a production build (the variable unset)', () => {
  const b = () => buildWith(undefined)

  it('builds every link on www, and the policy pages too', () => {
    const { share, links } = b()
    expect(share.SITE_HOST).toBe('www.blendn.app')
    expect(share.eventLink(ID)).toBe(`https://www.blendn.app/event/${ID}`)
    expect(share.inviteLink('abc')).toBe('https://www.blendn.app/f/abc')
    expect(links.BLENDN_LINKS.terms).toBe('https://www.blendn.app/terms')
    expect(links.BLENDN_LINKS.guidelines).toBe('https://www.blendn.app/community-guidelines')
  })

  it('places www and the apex; a staging link is not its own', () => {
    const { share, links } = b()
    expect(share.parseLink(`https://www.blendn.app/e/${ID}`)).toEqual({ kind: 'event', id: ID })
    expect(share.parseLink(`https://blendn.app/e/${ID}`)).toEqual({ kind: 'event', id: ID })
    expect(share.parseLink(`https://staging.blendn.app/event/${ID}`)).toBeNull()
    expect(links.isOurPage('https://staging.blendn.app/terms')).toBe(false)
  })

  it('a staging link that reaches it opens in the browser; the apex is its own and opens in the app', async () => {
    const { intent, open } = b()
    open.mockClear()
    expect(await intent.redirectSystemPath({ path: `https://staging.blendn.app/event/${ID}`, initial: false })).toBe('')
    expect(open).toHaveBeenCalledWith(`https://staging.blendn.app/event/${ID}`)
    open.mockClear()
    expect(await intent.redirectSystemPath({ path: `https://blendn.app/event/${ID}`, initial: true })).toBe(`/event/${ID}`)
    expect(open).not.toHaveBeenCalled()
  })
})

describe('a staging build (EXPO_PUBLIC_SITE_HOST=staging.blendn.app)', () => {
  const b = () => buildWith('staging.blendn.app')

  it('builds every link on staging: share, invite, venue, policy and help pages', () => {
    const { share, links } = b()
    expect(share.SITE_ORIGIN).toBe('https://staging.blendn.app')
    expect(share.eventLink(ID)).toBe(`https://staging.blendn.app/event/${ID}`)
    expect(share.venueLink(ID)).toBe('https://staging.blendn.app')
    expect(share.inviteLink('abc')).toBe('https://staging.blendn.app/f/abc')
    for (const url of Object.values(links.BLENDN_LINKS)) expect(url.startsWith('https://staging.blendn.app/')).toBe(true)
  })

  it('places a staging link; www and the apex are production’s', () => {
    const { share, links } = b()
    expect(share.parseLink(`https://staging.blendn.app/e/${ID}`)).toEqual({ kind: 'event', id: ID })
    expect(share.nativeIntentPath(`https://staging.blendn.app/event/${ID}`)).toBe(`/event/${ID}`)
    expect(share.parseLink(`https://www.blendn.app/e/${ID}`)).toBeNull()
    expect(share.parseLink(`https://blendn.app/e/${ID}`)).toBeNull()
    expect(share.nativeIntentPath(`https://www.blendn.app/event/${ID}`)).toBe('/')
    expect(links.isOurPage('https://staging.blendn.app/terms')).toBe(true)
    expect(links.isOurPage('https://www.blendn.app/terms')).toBe(false)
  })

  it('a www link that reaches the app (both hosts are claimed) opens in the browser, and the app stays where it is', async () => {
    const { intent, open } = b()
    open.mockClear()
    expect(await intent.redirectSystemPath({ path: `https://www.blendn.app/event/${ID}?utm=x`, initial: false })).toBe('')
    expect(open).toHaveBeenCalledWith(`https://www.blendn.app/event/${ID}`)
  })

  it('a cold start from a www link lands on the root and opens the page', async () => {
    const { intent, open } = b()
    open.mockClear()
    expect(await intent.redirectSystemPath({ path: `https://www.blendn.app/f/abc`, initial: true })).toBe('/')
    expect(open).toHaveBeenCalledWith('https://www.blendn.app/f/abc')
  })

  it('the apex is production’s too: it opens in the browser', async () => {
    const { intent, open } = b()
    open.mockClear()
    expect(await intent.redirectSystemPath({ path: `https://blendn.app/e/${ID}`, initial: false })).toBe('')
    expect(open).toHaveBeenCalledWith(`https://blendn.app/e/${ID}`)
  })

  it('a browser that will not open is logged by host, and the app still stays where it is', async () => {
    const { intent, open, warn } = b()
    open.mockRejectedValueOnce(new Error('no browser'))
    expect(await intent.redirectSystemPath({ path: 'https://www.blendn.app/f/abc', initial: false })).toBe('')
    await new Promise((resolve) => setImmediate(resolve))
    expect(warn).toHaveBeenCalledWith('general', expect.any(String), expect.objectContaining({ host: 'www.blendn.app' }))
  })

  it('control: its own link opens in the app, and no browser', async () => {
    const { intent, open } = b()
    open.mockClear()
    expect(await intent.redirectSystemPath({ path: `https://staging.blendn.app/event/${ID}`, initial: true })).toBe(`/event/${ID}`)
    expect(open).not.toHaveBeenCalled()
  })

  it('a host that is not ours at all goes nowhere, browser included', async () => {
    const { intent, open } = b()
    open.mockClear()
    expect(await intent.redirectSystemPath({ path: `https://evil.example/event/${ID}`, initial: true })).toBe('/')
    expect(await intent.redirectSystemPath({ path: `https://staging.blendn.app.evil.example/event/${ID}`, initial: true })).toBe('/')
    expect(open).not.toHaveBeenCalled()
  })
})

describe('the variable is checked: only blendn.app or one of its subdomains', () => {
  it.each(['evil.example', 'staging.blendn.app.evil.example', 'evilblendn.app', 'https://staging.blendn.app', 'staging.blendn.app/x', ' '])(
    '%p falls back to www, said in a warning',
    (host) => {
      const { share, warn } = buildWith(host)
      expect(share.SITE_HOST).toBe('www.blendn.app')
      if (host.trim()) expect(warn).toHaveBeenCalled()
    }
  )

  it('control: a subdomain of blendn.app is taken, case-folded', () => {
    expect(buildWith('Staging.Blendn.App').share.SITE_HOST).toBe('staging.blendn.app')
  })
})

describe('the native claim: both hosts, in every binary', () => {
  const root = path.resolve(__dirname, '..')
  const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')
  const HOSTS = ['www.blendn.app', 'staging.blendn.app']

  it('iOS entitlements claim exactly www and staging', () => {
    const claims = [...read('ios/blendn/blendn.entitlements').matchAll(/<string>applinks:([^<]+)<\/string>/g)].map((m) => m[1])
    expect(claims.sort()).toEqual([...HOSTS].sort())
  })

  it('every Android autoVerify https path is verified on both hosts, and no other host', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml')
    const data = [...manifest.matchAll(/android:scheme="https" android:host="([^"]+)" android:pathPrefix="([^"]+)"/g)].map((m) => [m[1], m[2]])
    const prefixes = [...new Set(data.map(([, p]) => p))]
    expect(prefixes).toEqual(expect.arrayContaining(['/f/', '/event/', '/e/', '/v/']))
    expect([...new Set(data.map(([h]) => h))].sort()).toEqual([...HOSTS].sort())
    for (const host of HOSTS) for (const p of prefixes) expect(data).toContainEqual([host, p])
  })

  it('app.json says the same, so a future prebuild agrees', () => {
    const app = JSON.parse(read('app.json')).expo
    expect([...app.ios.associatedDomains].sort()).toEqual(HOSTS.map((h) => `applinks:${h}`).sort())
    const hosts = new Set(app.android.intentFilters.flatMap((f: { data: { scheme?: string; host?: string }[] }) => f.data.filter((d) => d.scheme === 'https').map((d) => d.host)))
    expect([...hosts].sort()).toEqual([...HOSTS].sort())
  })
})
