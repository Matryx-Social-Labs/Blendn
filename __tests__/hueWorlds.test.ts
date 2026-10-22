/*
 * One hue per screen (foundations, direction C): rose for people and crews, violet for you, and ember (the default, no
 * provider) for going out. Source-shaped: each listed screen wraps its root in the named hue, no file nests a second
 * provider, and no screen outside this table sets one. Blendn+ (`app/plus.tsx`) is violet: it is yours, not an outing (visual QA R5 M29; the owner may rule otherwise). Onboarding is violet, set once at its stack's layout (its steps inherit).
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8')

const ROSE = [
  'app/crews/index.tsx',
  'app/crews/new.tsx',
  'app/crews/[crewId].tsx',
  'app/crews/invite/[crewId].tsx',
  'app/user/[id].tsx',
  'app/friends/index.tsx',
  'app/room/friends-here.tsx',
  'app/friends/add.tsx',
  'app/friends/requests.tsx',
  'app/friends/[userId].tsx',
  'app/f/[token].tsx',
  'app/notifications.tsx',
  'app/(tabs)/chat.tsx',
  'app/private-chat/[conversationId].tsx',
  'app/rate/[eventId].tsx',
  'components/blendn/BlendnScreen.tsx',
  'app/chat/[id].tsx',
  'app/chat-info/[id].tsx',
  'components/PresenceSheets.tsx',
]
const VIOLET = ['app/plus.tsx', 'app/plus-manage.tsx', 'app/onboarding/_layout.tsx', 'app/edit-about-you.tsx', 'app/edit-profile.tsx', 'app/(tabs)/profile.tsx', 'app/settings.tsx', 'app/notification-settings.tsx', 'app/muted-rooms.tsx', 'app/blocked-users.tsx', 'app/tips.tsx', 'app/event-preferences/[eventId].tsx']
/** Mounted app-level, outside every screen: they take the hue their caller names (`lib/sheet`'s `hue`), ember when none. */
const CARRIED: Record<string, string> = {
  'components/SheetHost.tsx': "<HueProvider value={current.hue ?? 'ember'}>",
  'components/share/ShareHost.tsx': "<HueProvider value={target.kind === 'invite' ? 'rose' : 'ember'}>",
  // Blend'n+ is yours, not an outing, wherever its sheet is raised from (the venue, Going, the expiry prompt).
  'components/plus/TonightHost.tsx': '<HueProvider value="violet">',
}
/** Going out: ember is the default, so none of these sets a hue. */
const EMBER = [
  'app/(tabs)/events.tsx',
  'app/(tabs)/going.tsx',
  'app/venue/[id].tsx',
  'app/event/[id].tsx',
  'app/board/[eventId].tsx',
  'app/offer/[id].tsx',
  'app/sign-in.tsx',
  'components/home/HomeShell.tsx',
  'components/home/PlacesList.tsx',
  'components/places/PlacesFilterSheet.tsx',
  'components/pulse/FilterControl.tsx',
]

const walk = (dir: string): string[] =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) return rel.startsWith('app/preview') ? [] : walk(rel)
    return /\.tsx$/.test(entry.name) ? [rel] : []
  })
const providers = (src: string) => src.match(/<HueProvider\b/g)?.length ?? 0

describe('the worlds', () => {
  it.each(ROSE)('%s is rose', (file) => {
    expect(read(file)).toContain('<HueProvider value="rose">')
  })

  it.each(VIOLET)('%s is violet', (file) => {
    expect(read(file)).toContain('<HueProvider value="violet">')
  })

  it.each(EMBER)('%s is ember: it sets no hue', (file) => {
    expect(providers(read(file))).toBe(0)
  })
})

describe('one hue per screen', () => {
  it.each([...ROSE, ...VIOLET])('%s holds exactly one provider, so none nests a second', (file) => {
    expect(providers(read(file))).toBe(1)
  })

  it('no file outside the table sets a hue (components inherit their screen’s)', () => {
    const allowed = new Set([...ROSE, ...VIOLET, ...Object.keys(CARRIED)])
    const stray = [...walk('app'), ...walk('components')].filter((file) => !allowed.has(file) && providers(read(file)) > 0)
    expect(stray).toEqual([])
  })

  it.each(Object.entries(CARRIED))('%s takes the hue of what it was opened for, ember by default', (file, provider) => {
    expect(read(file)).toContain(provider)
  })

  it('a screen is never both: no file names two different hues', () => {
    for (const file of [...ROSE, ...VIOLET]) {
      const hues = new Set([...read(file).matchAll(/<HueProvider value="(\w+)"/g)].map((m) => m[1]))
      expect(hues.size).toBe(1)
    }
  })
})
