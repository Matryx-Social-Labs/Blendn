/*
 * The links Blend'n sends and opens (Flow 16): built in one place, read back by the same place, and the privacy rule
 * for what may be linked at all.
 */
import { redirectSystemPath } from '../app/+native-intent'
import { eventLink, inviteLink, nativeIntentPath, parseLink, routeFor, SHARE_ORIGIN, shareability, venueLink, WEB_PAGES_LIVE } from '../lib/shareLinks'

const ID = '7f3a2c4e-91d0-4b8a-a1c2-0d5e6f7a8b9c'
const TOKEN = 'abcdefghijklmnopqrstuv'

describe('building a link', () => {
  // SCRUM-738: the live associated-domain file lists only /f/* and /event/*, and /e/ and /v/ serve the homepage.
  it('makes only links the live site is verified for, from the id and never a slug', () => {
    expect(WEB_PAGES_LIVE).toBe(false)
    expect(eventLink(ID)).toBe(`https://www.blendn.app/event/${ID}`)
    expect(venueLink(ID)).toBe('https://www.blendn.app')
    expect(inviteLink(TOKEN)).toBe(`https://www.blendn.app/f/${TOKEN}`)
  })

  it('maps each kind to the screen that answers it', () => {
    expect(routeFor({ kind: 'event', id: ID })).toBe(`/event/${ID}`)
    expect(routeFor({ kind: 'venue', id: ID })).toBe(`/venue/${ID}`)
    expect(routeFor({ kind: 'invite', id: TOKEN })).toBe(`/f/${TOKEN}`)
  })
})

describe('reading a link', () => {
  it('reads back what it built', () => {
    expect(parseLink(eventLink(ID))).toEqual({ kind: 'event', id: ID })
    expect(parseLink(`${SHARE_ORIGIN}/v/${ID}`)).toEqual({ kind: 'venue', id: ID })
    expect(parseLink(`${SHARE_ORIGIN}/e/${ID}`)).toEqual({ kind: 'event', id: ID })
    expect(parseLink(inviteLink(TOKEN))).toEqual({ kind: 'invite', id: TOKEN })
  })

  it('takes the bare domain, the app scheme, a bare path, the organiser QR path and a query string', () => {
    expect(parseLink(`https://blendn.app/e/${ID}`)).toEqual({ kind: 'event', id: ID })
    expect(parseLink(`blendn://e/${ID}`)).toEqual({ kind: 'event', id: ID })
    expect(parseLink(`blendn:///v/${ID}`)).toEqual({ kind: 'venue', id: ID })
    expect(parseLink(`/e/${ID}`)).toEqual({ kind: 'event', id: ID })
    expect(parseLink(`e/${ID}`)).toEqual({ kind: 'event', id: ID })
    expect(parseLink(`https://www.blendn.app/event/${ID}`)).toEqual({ kind: 'event', id: ID })
    expect(parseLink(`https://www.blendn.app/e/${ID}?utm_source=x#top`)).toEqual({ kind: 'event', id: ID })
  })

  it('refuses another site, another path, a deeper path and an id that could climb out of its segment', () => {
    expect(parseLink(`https://evil.example/e/${ID}`)).toBeNull()
    expect(parseLink(`https://blendn.app.evil.example/e/${ID}`)).toBeNull()
    expect(parseLink('https://www.blendn.app/terms')).toBeNull()
    expect(parseLink(`https://www.blendn.app/e/${ID}/chat`)).toBeNull()
    expect(parseLink('/e/..')).toBeNull()
    expect(parseLink('/e/a%2Fb')).toBeNull()
    expect(parseLink('/e/%E0%A4%A')).toBeNull()
    expect(parseLink('/e/')).toBeNull()
    expect(parseLink('')).toBeNull()
    expect(parseLink(null)).toBeNull()
  })
})

describe('reading a link, in any form', () => {
  it('decides on the normalised path: scheme, case, encoding, slashes and whitespace do not change what it is', () => {
    const event = { kind: 'event', id: ID }
    for (const form of [
      `https://WWW.Blendn.App/E/${ID}`,
      `https://www.blendn.app//e//${ID}//`,
      `https://www.blendn.app/%65vent/${ID}`,
      `https://www.blendn.app/%45VENT/${ID}`,
      `blendn:event/${ID}`,
      `blendn:/event/${ID}`,
      `blendn://EVENT/${ID}`,
      `BLENDN:///event///${ID}`,
      `https:\\\\www.blendn.app\\e\\${ID}`,
      ` /ev\tent/${ID}\n`,
    ]) {
      expect({ form, got: parseLink(form) }).toEqual({ form, got: event })
    }
  })

  it('refuses a host that is only dressed as ours', () => {
    for (const form of [`https://www.blendn.app@evil.example/e/${ID}`, `https://www.blendn.app:8443/e/${ID}`, `https://www.blendn.app.evil.example/e/${ID}`, `https://evil.example/www.blendn.app/e/${ID}`]) {
      expect(parseLink(form)).toBeNull()
    }
  })
})

describe('the native intent: what the router gets for an incoming link', () => {
  const CRAFTED = 'title=Free%20money&cover=https://attacker.example/x.jpg&description=hi&internal=1&seed=1&draft=pay%20me&otherUserName=Mum&notice=Verify%20here&email=a@b.c&km=1'

  it('rewrites /e/ and /v/, which have no screen, to the event and the venue; an invite keeps its path', () => {
    expect(nativeIntentPath(`https://www.blendn.app/e/${ID}`)).toBe(`/event/${ID}`)
    expect(nativeIntentPath(`blendn://v/${ID}`)).toBe(`/venue/${ID}`)
    expect(nativeIntentPath(`/e/${ID}`)).toBe(`/event/${ID}`)
    expect(nativeIntentPath(`https://www.blendn.app/f/${TOKEN}`)).toBe(`/f/${TOKEN}`)
    expect(nativeIntentPath(`/event/${ID}`)).toBe(`/event/${ID}`)
  })

  it('an invite by the app scheme reaches the invite screen in every slash form, a token the server will refuse included (rc7 R1)', () => {
    // The drive's iOS link was `blendn:///f/<token>` (an empty host); `blendn://f/<token>` is what the web page opens.
    for (const link of [`blendn:///f/${TOKEN}`, `blendn://f/${TOKEN}`, 'blendn:///f/RC5NOTATOKEN']) {
      expect(nativeIntentPath(link)).toMatch(/^\/f\/[A-Za-z0-9_-]+$/)
    }
    expect(nativeIntentPath('blendn:///f/RC5NOTATOKEN')).toBe('/f/RC5NOTATOKEN')
  })

  it.each([
    ['https event', `https://www.blendn.app/event/${ID}`, `/event/${ID}`],
    ['https short event', `https://www.blendn.app/e/${ID}`, `/event/${ID}`],
    ['mixed case', `https://www.blendn.app/EvEnT/${ID}`, `/event/${ID}`],
    ['encoded route word', `https://www.blendn.app/%65vent/${ID}`, `/event/${ID}`],
    ['no slashes after the scheme', `blendn:event/${ID}`, `/event/${ID}`],
    ['double slashes', `blendn://event//${ID}`, `/event/${ID}`],
    ['backslashes', `https:\\\\www.blendn.app\\event\\${ID}`, `/event/${ID}`],
    ['venue', `https://www.blendn.app/venue/${ID}`, `/venue/${ID}`],
    ['venue, custom scheme', `blendn://v/${ID}`, `/venue/${ID}`],
    ['invite', `https://www.blendn.app/f/${TOKEN}`, `/f/${TOKEN}`],
    ['a DM (draft, otherUserName)', `blendn://private-chat/abc`, '/private-chat/abc'],
    ['sign-in (notice)', 'blendn://sign-in', '/sign-in'],
    ['forgot-password (email)', 'blendn://forgot-password', '/forgot-password'],
    ['a chat room', 'blendn://chat/abc', '/chat/abc'],
    ['a profile', 'blendn://user/abc', '/user/abc'],
    ['the encoded form of a screen', 'blendn://%70rivate-chat/abc', '/%70rivate-chat/abc'],
  ])('%s: whatever it carries, the router gets the path alone', (_name, link, route) => {
    for (const tail of [`?${CRAFTED}`, `#${CRAFTED}`, `/?${CRAFTED}`, `?${CRAFTED}#x`, `?`, `??internal=1`]) {
      expect(nativeIntentPath(link + tail)).toBe(route)
    }
    expect(nativeIntentPath(link)).toBe(route)
  })

  it('drops the query even when the path is not a clean link: a bad id, an extra segment, another host', () => {
    expect(nativeIntentPath(`/event/a%2Fb?${CRAFTED}`)).toBe('/event/a%2Fb')
    expect(nativeIntentPath(`/event/${ID}/chat?${CRAFTED}`)).toBe(`/event/${ID}/chat`)
    expect(nativeIntentPath(`https://evil.example/event/${ID}?${CRAFTED}`)).toBe('/')
    expect(nativeIntentPath(`https://www.blendn.app@evil.example/e/${ID}?${CRAFTED}`)).toBe('/')
    expect(nativeIntentPath(`?${CRAFTED}`)).toBe('/')
  })

  it('never hands the router a decoded "?" or "#": a smuggled one stays encoded', () => {
    expect(nativeIntentPath('blendn://private-chat%3Fdraft=pay')).toBe('/private-chat%3Fdraft=pay')
    expect(nativeIntentPath('blendn://private-chat%23x')).toBe('/private-chat%23x')
  })

  it('keeps the dev client’s launch link as it is, and nothing that merely starts like it', () => {
    const launch = 'exp+blendn://expo-development-client/?url=http%3A%2F%2F192.168.1.2%3A8081'
    expect(nativeIntentPath(launch)).toBe(launch)
    expect(nativeIntentPath('exp+blendn://expo-development-client?url=x')).toBe('exp+blendn://expo-development-client?url=x')
    expect(nativeIntentPath('exp+blendn://expo-development-client/private-chat/abc?draft=x')).toBe('/expo-development-client/private-chat/abc')
    expect(nativeIntentPath('exp+blendn://private-chat/abc?draft=x')).toBe('/private-chat/abc')
  })
})

describe('what may be put in a link', () => {
  it('shares a public event, shares an unlisted one as area-only, and never a private one or a draft', () => {
    expect(shareability({ visibility: 'public', status: 'published' })).toBe('public')
    expect(shareability({ visibility: 'unlisted', status: 'published' })).toBe('unlisted')
    expect(shareability({ visibility: 'private', status: 'published' })).toBe('never')
    expect(shareability({ visibility: 'public', status: 'draft' })).toBe('never')
    expect(shareability({ visibility: 'public', status: 'deleted' })).toBe('never')
  })

  it('keeps a cancelled event shareable (it has its own card) and says "unknown" when the row does not say', () => {
    expect(shareability({ visibility: 'public', status: 'cancelled' })).toBe('public')
    expect(shareability({ status: 'published' })).toBe('unknown')
    expect(shareability({ visibility: null })).toBe('unknown')
  })
})

describe('what the router is handed for each screen a link could name', () => {
  const via = (path: string, initial = false) => redirectSystemPath({ path, initial })

  it.each([
    ['a DM: draft and otherUserName', 'blendn://private-chat/c1?draft=Send%20money&otherUserName=Mum&otherUserId=u9', '/private-chat/c1'],
    ['sign-in: notice', 'blendn://sign-in?notice=Your%20account%20is%20locked.%20Verify%20at%20x.example', '/sign-in'],
    ['forgot-password: email', 'blendn://forgot-password?email=victim@example.com', '/forgot-password'],
    ['the Scene: title, cover, description', `https://www.blendn.app/event/${ID}?title=Free&cover=https://attacker.example/x.jpg&description=hi`, `/event/${ID}`],
    ['the venue page: km', `https://www.blendn.app/v/${ID}?km=0.1`, `/venue/${ID}`],
  ])('%s', async (_name, link, route) => {
    // With the app open it waits for any modal route to close first (`dismissModals`), so it answers a promise.
    await expect(via(link)).resolves.toBe(route)
    expect(via(link, true)).toBe(route)
  })
})

describe('a room link keeps its countdown (R6-5)', () => {
  const OPENS = '2026-10-25T15:30:00.000Z'
  it('keeps a crew’s or a Blend’s kind and id on /chat/<id>, checked, so the room is not read as an event’s (rc7)', () => {
    expect(nativeIntentPath('blendn:///chat/abc?kind=blend&blendId=b_1&roomName=Hi')).toBe('/chat/abc?kind=blend&blendId=b_1')
    expect(nativeIntentPath('blendn://chat/abc?kind=crew&crewId=c1')).toBe('/chat/abc?kind=crew&crewId=c1')
    expect(nativeIntentPath('blendn://chat/abc?kind=event&blendId=a%2Fb')).toBe('/chat/abc')
  })

  it('keeps a checked eventId and opensAt on /chat/<id>, and nothing else', () => {
    expect(nativeIntentPath(`blendn://chat/abc?eventId=${ID}&opensAt=${OPENS}&roomName=Support&draft=x`)).toBe(
      `/chat/abc?eventId=${ID}&opensAt=${encodeURIComponent(OPENS)}`
    )
    expect(nativeIntentPath(`https://www.blendn.app/chat/abc?opensAt=${encodeURIComponent(OPENS)}#x`)).toBe(`/chat/abc?opensAt=${encodeURIComponent(OPENS)}`)
  })

  it('drops a param that is not what it claims, a repeat, and the query of any other path', () => {
    expect(nativeIntentPath('blendn://chat/abc?eventId=a%2Fb&opensAt=soon')).toBe('/chat/abc')
    expect(nativeIntentPath(`blendn://chat/abc?eventId=${ID}&eventId=other`)).toBe(`/chat/abc?eventId=${ID}`)
    expect(nativeIntentPath(`blendn://chat/a%2Fb?eventId=${ID}`)).toBe('/chat/a%2Fb')
    expect(nativeIntentPath(`blendn://chat/abc/more?eventId=${ID}`)).toBe('/chat/abc/more')
    expect(nativeIntentPath(`blendn://private-chat/abc?eventId=${ID}&opensAt=${OPENS}`)).toBe('/private-chat/abc')
    expect(nativeIntentPath(`https://evil.example/chat/abc?eventId=${ID}`)).toBe('/')
  })
})
