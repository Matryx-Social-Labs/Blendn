/*
 * The links Blend'n sends and opens (Flow 16): built in one place, read back by the same place, and the privacy rule
 * for what may be linked at all.
 */
import { eventLink, inviteLink, nativeIntentPath, parseLink, routeFor, shareability, venueLink } from '../lib/shareLinks'

const ID = '7f3a2c4e-91d0-4b8a-a1c2-0d5e6f7a8b9c'
const TOKEN = 'abcdefghijklmnopqrstuv'

describe('building a link', () => {
  it('makes the www links the app is verified for, from the id and never a slug', () => {
    expect(eventLink(ID)).toBe(`https://www.blendn.app/e/${ID}`)
    expect(venueLink(ID)).toBe(`https://www.blendn.app/v/${ID}`)
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
    expect(parseLink(venueLink(ID))).toEqual({ kind: 'venue', id: ID })
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

describe('the native intent: which path the router opens for an incoming link', () => {
  it('rewrites /e/ and /v/, which have no screen, to the event and the venue', () => {
    expect(nativeIntentPath(`https://www.blendn.app/e/${ID}`)).toBe(`/event/${ID}`)
    expect(nativeIntentPath(`blendn://v/${ID}`)).toBe(`/venue/${ID}`)
    expect(nativeIntentPath(`/e/${ID}`)).toBe(`/event/${ID}`)
  })

  it('leaves the organiser QR path and the invite path as they are', () => {
    expect(nativeIntentPath(`https://www.blendn.app/event/${ID}`)).toBe(`/event/${ID}`)
    expect(nativeIntentPath(`/f/${TOKEN}`)).toBe(`/f/${TOKEN}`)
    expect(nativeIntentPath(`https://www.blendn.app/f/${TOKEN}`)).toBe(`https://www.blendn.app/f/${TOKEN}`)
  })

  it('never lets a link carry anything into the Scene: no query on an event or a venue, whatever the form', () => {
    const crafted = 'title=Free%20money&cover=https://attacker.example/x.jpg&description=hi&internal=1&venue=x&interestCount=9'
    for (const link of [
      `https://www.blendn.app/e/${ID}?${crafted}`,
      `https://www.blendn.app/event/${ID}?${crafted}`,
      `https://www.blendn.app/event/${ID}#${crafted}`,
      `blendn://event/${ID}?${crafted}`,
      `blendn://e/${ID}?${crafted}`,
      `/event/${ID}?${crafted}`,
    ]) {
      expect(nativeIntentPath(link)).toBe(`/event/${ID}`)
    }
    for (const link of [`https://www.blendn.app/v/${ID}?${crafted}`, `https://www.blendn.app/venue/${ID}?km=1&${crafted}`, `blendn://venue/${ID}?${crafted}`]) {
      expect(nativeIntentPath(link)).toBe(`/venue/${ID}`)
    }
  })

  it('strips the query even from a path that names an event but is not a clean link', () => {
    expect(nativeIntentPath(`/event/a%2Fb?title=x&cover=https://attacker.example/x.jpg`)).toBe('/event/a%2Fb')
    expect(nativeIntentPath(`/event/${ID}/chat?title=x`)).toBe(`/event/${ID}/chat`)
  })

  it('leaves every unrelated path, query and all, as it came', () => {
    for (const path of ['/(tabs)/events', '/chat/abc?x=1', `https://evil.example/terms?x=1`, '/events?x=1']) {
      expect(nativeIntentPath(path)).toBe(path)
    }
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
