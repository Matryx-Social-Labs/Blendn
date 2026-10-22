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
    expect(read('lib/shareLinks.ts')).toMatch(/\$\{SHARE_ORIGIN\}\/e\/\$\{id\}/)
  })
})

describe('the Scene’s seed is the app’s own', () => {
  it('every in-app push to the Scene that passes a title, cover or description marks itself internal', () => {
    const seeding = [...walk('app'), ...walk('components'), ...walk('lib')].filter((f) => {
      const src = read(f)
      return [...src.matchAll(/pathname: '\/event\/\[id\]'/g)].some((m) => /\b(title|cover|description):/.test(src.slice(m.index, m.index + 400)))
    })
    expect(seeding.length).toBeGreaterThan(0)
    for (const f of seeding) expect(read(f)).toMatch(/internalSeed\(/)
  })

  it('the host sweeps the last Story picture at launch', () => {
    expect(read('components/share/ShareHost.tsx')).toMatch(/sweepStoryCaptures\(\)/)
  })

  it('the Scene reads its seed through trustedParams and nowhere else', () => {
    expect(read('components/screens/EventDetailScreen.tsx')).toMatch(/trustedParams\(useLocalSearchParams\(\)\)/)
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
