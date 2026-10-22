/*
 * Where sharing is wired (Flow 16): every surface goes through the one tray, the one link builder and the one host, and
 * the app answers to the links it sends. Source-shape checks, because a screen that quietly goes back to the OS sheet
 * with its own text would pass every render test.
 */
import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')
const walk = (dir: string): string[] =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name)
    return e.isDirectory() ? (e.name === 'preview' ? [] : walk(rel)) : /\.(ts|tsx)$/.test(e.name) ? [rel] : []
  })

describe('one tray for every surface', () => {
  it('nothing outside the host calls the OS share sheet with its own text', () => {
    const offenders = [...walk('app'), ...walk('components'), ...walk('lib')].filter((f) => /Share\.share\(/.test(read(f)))
    expect(offenders).toEqual(['components/share/ShareHost.tsx'])
  })

  it('the host is mounted once, at the root, where the other app-wide sheets are', () => {
    expect(read('app/_layout.tsx')).toMatch(/<ShareHost \/>/)
  })

  it.each([
    ['the Scene', 'components/screens/EventDetailScreen.tsx', /openShare\(shareTarget\)/],
    ['the venue page', 'app/venue/[id].tsx', /openShare\(venueTarget\(/],
    ['Add friends and the onboarding step (both through the one invite hook)', 'lib/useFriendInvite.ts', /openShare\(\{ kind: 'invite', url: inviteLink\(/],
    ['the Going card', 'app/(tabs)/going.tsx', /shareEvent\(event\)/],
    ['the Pulse’s peek', 'app/(tabs)/events.tsx', /shareEvent\(event\)/],
  ])('%s opens the tray', (_name, file, shape) => {
    expect(read(file)).toMatch(shape)
  })

  it('links are built in `lib/shareLinks.ts` alone: no other code writes the host in front of an id', () => {
    const building = /blendn\.app\/(e|v|f)\/\$\{/
    const builders = [...walk('app'), ...walk('components'), ...walk('lib')].filter((f) => building.test(read(f)))
    expect(builders).toEqual([])
    expect(read('lib/shareLinks.ts')).toMatch(/WEB_PAGES_LIVE \? 'e' : 'event'/)
  })
})

describe('a link we send is one the app is verified for (SCRUM-738)', () => {
  // The live site's associated-domain file (curl https://www.blendn.app/.well-known/apple-app-site-association) lists these
  // and no others; `/e/` and `/v/` serve the homepage until SCRUM-689. A new outbound path must be added here on purpose.
  const LIVE_AASA_PATHS = ['/f/', '/event/']
  const { eventLink, inviteLink, venueLink } = jest.requireActual('../lib/shareLinks') as typeof import('../lib/shareLinks')

  it.each([
    ['event', eventLink('abc')],
    ['invite', inviteLink('abc')],
    ['venue', venueLink('abc')],
  ])('%s link opens a page the live site answers', (_name, url) => {
    const { pathname } = new URL(url)
    expect(pathname === '/' || LIVE_AASA_PATHS.some((p) => pathname.startsWith(p))).toBe(true)
  })
})

describe('no route param seeds the Scene', () => {
  const sources = () => [...walk('app'), ...walk('components'), ...walk('lib')]

  it('the Scene takes an id and a one-time token from its route, and nothing else', () => {
    const scene = read('components/screens/EventDetailScreen.tsx')
    expect(scene).toMatch(/useLocalSearchParams<\{ id\?: string; seed\?: string \}>\(\)/)
    expect(scene).toMatch(/takeSceneSeed\(seedToken, id\)/)
    // The words come from the seed, not from anything the route said.
    expect(scene).not.toMatch(/descriptionParam|interestCountParam|trustedParams|internalSeed/)
  })

  it('no flag in a URL is a trust signal: nothing in the app reads or writes an `internal` param', () => {
    const offenders = sources().filter((f) => /internalSeed|trustedParams|INTERNAL_PARAM|params\??\.internal|\binternal: '1'/.test(read(f)))
    expect(offenders).toEqual([])
  })

  it('an in-app push to the Scene carries an id and a token, and the words go through the store', () => {
    const pushes = sources().flatMap((f) => [...read(f).matchAll(/pathname: '\/event\/\[id\]'/g)].map((m) => ({ f, near: read(f).slice(m.index, m.index! + 300) })))
    expect(pushes.length).toBeGreaterThan(0)
    for (const { near } of pushes) expect(near).not.toMatch(/\b(title|cover|description|venue):/)
    for (const f of ['app/(tabs)/events.tsx', 'app/nearby-events.tsx']) {
      expect(read(f)).toMatch(/putSceneSeed\(\{/)
      expect(read(f)).toMatch(/params: \{ id: event\.id, seed \}/)
    }
  })

  it('the host sweeps the last Story picture at launch', () => {
    expect(read('components/share/ShareHost.tsx')).toMatch(/sweepStoryCaptures\(\)/)
  })
})

describe('only links lose their query; the app’s own navigation keeps its params', () => {
  it('nativeIntentPath is called for system URLs by +native-intent alone, never by an in-app push', () => {
    const callers = [...walk('app'), ...walk('components'), ...walk('lib')].filter((f) => /nativeIntentPath\(/.test(read(f)) && f !== 'lib/shareLinks.ts')
    expect(callers).toEqual(['app/+native-intent.tsx'])
  })

  it.each([
    ['a DM from a friend’s profile keeps otherUserName', 'app/friends/[userId].tsx', /otherUserName: friend\.name/],
    ['a DM from a room keeps otherUserName and the draft', 'components/blendn/BlendnScreen.tsx', /otherUserName: p\.name[^}]*draft/],
    ['sign-in keeps the notice it is sent with', 'app/index.tsx', /pathname: '\/sign-in', params: \{ notice \}/],
    ['forgot-password keeps the email it is sent with', 'app/sign-in.tsx', /pathname: '\/forgot-password', params: \{ email: trimmedEmail \}/],
  ])('%s', (_name, file, shape) => {
    expect(read(file)).toMatch(shape)
  })
})

describe('the app answers to the links it sends', () => {
  it('rewrites /e/ and /v/ before the router sees them', () => {
    expect(read('app/+native-intent.tsx')).toMatch(/redirectSystemPath/)
    expect(read('app/+native-intent.tsx')).toMatch(/nativeIntentPath/)
  })

  it('Android verifies /e/, /v/, /f/ and the organiser’s /event/ on www; iOS asks about WhatsApp', () => {
    const app = JSON.parse(read('app.json')).expo
    const prefixes = app.android.intentFilters.flatMap((f: { data: { host?: string; pathPrefix?: string }[] }) => f.data.filter((d) => d.host === 'www.blendn.app').map((d) => d.pathPrefix))
    expect(prefixes).toEqual(expect.arrayContaining(['/e/', '/v/', '/f/', '/event/']))
    expect(app.ios.associatedDomains).toEqual(['applinks:www.blendn.app'])
    expect(app.ios.infoPlist.LSApplicationQueriesSchemes).toContain('whatsapp')
  })

  it('the arrival banner rides the Pulse', () => {
    expect(read('app/(tabs)/events.tsx')).toMatch(/<PulseArrival \/>/)
  })
})
