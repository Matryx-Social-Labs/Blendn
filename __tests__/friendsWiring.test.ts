import { readFileSync } from 'fs'
import { join } from 'path'

import { ONBOARDING_STEPS } from '../lib/onboarding'

/**
 * How friends are wired into the rest of the app — the parts a screen test
 * cannot see because they live in routing, settings and native config.
 *
 * Each pin names a way the feature was designed to fail quietly:
 *  - an invite link tapped while signed out that is lost at the sign-in screen;
 *  - "Bring your friends" slipped into the step list, where it would move the
 *    progress bar and the resume rule;
 *  - a friend's profile served by the room's endpoint, where a friend is a
 *    pseudonym — which would show an empty profile, or tempt someone to "fix"
 *    that endpoint and undo the room's anonymity;
 *  - the in-rooms switch sent under the wrong name, so it saves nothing;
 *  - a universal link added to app.json alone, which EAS never reads because
 *    `ios/` and `android/` are committed.
 */
const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')

describe('after onboarding', () => {
  it('shows "Bring your friends" once, between the last step and the app', () => {
    expect(read('app/onboarding/ready.tsx')).toContain("router.replace('/onboarding/friends')")
    const intro = read('app/onboarding/friends.tsx')
    expect(intro).toContain("router.replace('/(tabs)/events')")
    // Not a step: the flow still ends at `ready`, which writes `onboarded`.
    expect(ONBOARDING_STEPS).not.toContain('friends' as never)
    // It writes nothing about the person — `ready` already did.
    expect(intro).not.toContain('updateProfile')
  })
})

describe('after "Bring your friends"', () => {
  it('cannot go back into the finished onboarding steps', () => {
    // The steps push forward, so they are still on the stack underneath.
    expect(read('app/onboarding/_layout.tsx')).toContain('<Stack.Screen name="friends" options={{ gestureEnabled: false }} />')
    const intro = read('app/onboarding/friends.tsx')
    expect(intro).toContain("BackHandler.addEventListener('hardwareBackPress'")
    expect(intro).toMatch(/hardwareBackPress', \(\) => \{\s*router\.replace\('\/\(tabs\)\/events'\)\s*return true/)
  })
})

describe('an invite link', () => {
  it('opened by an account that has not finished onboarding waits for it', () => {
    const layout = read('app/_layout.tsx')
    const signedIn = layout.slice(layout.indexOf("if (pathname.startsWith('/f/')) {"))
    expect(signedIn).toMatch(/resumeStep\(\{[\s\S]*?\}\);\s*if \(resume\) \{\s*setRouteReady\(false\);\s*openWhenReady\(pathname as Href\);\s*replaceIfNeeded\(ONBOARDING_ROUTES\[resume\]\);/)
  })

  it('opened while signed out is held and opened once they are in', () => {
    const layout = read('app/_layout.tsx')
    const signedOut = layout.slice(layout.indexOf('if (!user) {'), layout.indexOf('removePushTokenFromProfile().catch'))
    expect(signedOut).toContain("if (pathname.startsWith('/f/') || pathname.startsWith('/event/')) openWhenReady(pathname as Href);")
    // Held BEFORE the bounce to sign-in, or the path is gone.
    expect(signedOut.indexOf('openWhenReady')).toBeLessThan(signedOut.indexOf("replaceIfNeeded('/')"))
  })

  it('and every friends screen are declared, so none inherits a native header', () => {
    const layout = read('app/_layout.tsx')
    for (const name of ['friends/index', 'friends/add', 'friends/[userId]', 'f/[token]']) {
      expect(layout).toContain(`<Stack.Screen name="${name}"`)
    }
  })
})

describe('an event\'s public link (https://www.blendn.app/event/<id>, the organiser\'s QR code)', () => {
  it('opened while signed out is held and opened once they are in, like an invite', () => {
    const layout = read('app/_layout.tsx')
    const signedOut = layout.slice(layout.indexOf('if (!user) {'), layout.indexOf('removePushTokenFromProfile().catch'))
    const hold = signedOut.split('\n').find((line) => line.includes('openWhenReady(pathname as Href)'))
    expect(hold).toContain("pathname.startsWith('/event/')")
    expect(signedOut.indexOf('openWhenReady')).toBeLessThan(signedOut.indexOf("replaceIfNeeded('/')"))
  })

  it('lands on the app\'s own event screen, the route the link mirrors', () => {
    expect(read('app/event/[id].tsx')).toContain('EventDetailScreen')
  })
})

describe('a friend\'s profile', () => {
  it('comes from the friends endpoint, never the room\'s', () => {
    const src = read('app/friends/[userId].tsx')
    expect(src).toContain('apiClient.getFriend(')
    expect(src).not.toContain('getPublicProfile')
    expect(src).not.toContain('getProfile(')
  })
})

describe('the Me tab', () => {
  it('counts friends and opens the list, and has Add friends as a bar circle beside Settings', () => {
    const src = read('app/(tabs)/profile.tsx')
    expect(read('components/profile/MeSections.tsx')).toContain('<Stat value={friends} label="Friends" onPress={onFriends} hint="Opens your friends" />')
    expect(src).toContain("const openFriends = () => router.push('/friends')")
    expect(src).toContain("router.push('/friends/add')")
    expect(src).toContain("label: 'Add friends'")
  })
})

describe('the in-rooms switch', () => {
  it('is off by default and saved under the name the API reads', () => {
    const src = read('app/settings.tsx')
    expect(src).toMatch(/friendsSeeMe: false,/)
    // The column name the API reads, sent alone when it is the switch that changed (see settingsAccount.test).
    expect(src).toMatch(/friendsSeeMe: 'friends_see_me_in_rooms'/)
    expect(src).toContain('{ [PREFERENCE_COLUMN[key]]: next[key] }')
    expect(src).toContain('toBoolean(profile.friends_see_me_in_rooms, DEFAULT_PREFERENCES.friendsSeeMe)')
  })
})

describe('the links open the app', () => {
  it('on iOS, from the entitlements the build is signed with', () => {
    expect(read('ios/blendn/blendn.entitlements')).toContain('<string>applinks:www.blendn.app</string>')
    // `www`: the apex answers with a redirect, and Apple refuses an association file behind one.
    expect(JSON.parse(read('app.json')).expo.ios.associatedDomains).toEqual(['applinks:www.blendn.app'])
  })

  it('on iOS, may ask whether WhatsApp is installed, from the committed Info.plist as well as app.json', () => {
    expect(read('ios/blendn/Info.plist')).toMatch(/<key>LSApplicationQueriesSchemes<\/key>\s*<array>\s*<string>whatsapp<\/string>/)
  })

  it('on iOS, from the web page\'s "Open in Blend\'n" button', () => {
    // `blendn://` was in app.json and never reached the committed Info.plist.
    expect(read('ios/blendn/Info.plist')).toMatch(/<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>blendn<\/string>/)
  })

  it('on Android, verified, for /f/, /event/ (the organiser’s QR code), /e/ and /v/ only, the same in app.json and the committed manifest', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml')
    const verified = manifest.match(/<intent-filter android:autoVerify="true">([\s\S]*?)<\/intent-filter>/g) ?? []
    expect(verified).toHaveLength(1)
    const manifestPaths = [...(verified[0] ?? '').matchAll(/<data android:scheme="https" android:host="www.blendn.app" android:pathPrefix="([^"]+)"\/>/g)].map((m) => m[1])
    expect(manifestPaths).toEqual(['/f/', '/event/', '/e/', '/v/'])
    const filters = JSON.parse(read('app.json')).expo.android.intentFilters
    expect(filters).toContainEqual(
      expect.objectContaining({
        autoVerify: true,
        data: [
          { scheme: 'https', host: 'www.blendn.app', pathPrefix: '/f/' },
          { scheme: 'https', host: 'www.blendn.app', pathPrefix: '/event/' },
          { scheme: 'https', host: 'www.blendn.app', pathPrefix: '/e/' },
          { scheme: 'https', host: 'www.blendn.app', pathPrefix: '/v/' },
        ],
      })
    )
  })
})
