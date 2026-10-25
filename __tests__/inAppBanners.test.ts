import { bannerFor, bannerPresentation, claimBannerHost, MERGE_WINDOW_MS, nextBanner } from '../lib/inAppBanners'

describe('which push becomes a banner (Flow 9 · 9.4)', () => {
  it('is the system banner where nothing has claimed the host (signed out, a pushed screen over the tabs)', () => {
    expect(bannerPresentation({ type: 'friend_request' })).toBe('system')
  })

  it('is the capsule for people, crew and today’s event changes while the tabs show', () => {
    const release = claimBannerHost('tabs')
    for (const type of ['friend_request', 'match', 'reveal_request', 'message_request', 'crew_invite', 'crew_here', 'blend', 'event_update']) {
      expect(bannerPresentation({ type })).toBe('in-app')
    }
    release()
  })

  it('is nothing for the kinds that only fill the bell', () => {
    const release = claimBannerHost('tabs')
    for (const type of ['announcement', 'rating_request', 'waitlist_promoted', 'message_request_response', 'board_request_accepted', 'friend_accepted']) {
      expect(bannerPresentation({ type })).toBe('none')
    }
    release()
  })

  it('leaves a kind it does not know to the system', () => {
    const release = claimBannerHost('tabs')
    expect(bannerPresentation({ type: 'venue_offer' })).toBe('system')
    expect(bannerPresentation(undefined)).toBe('system')
    release()
  })

  it('is nothing at all on the Notifications screen: the row is inserted instead', () => {
    const release = claimBannerHost('notifications')
    expect(bannerPresentation({ type: 'friend_request' })).toBe('none')
    expect(bannerPresentation({ type: 'event_update' })).toBe('none')
    release()
  })

  it('gives the host back to whoever held it before', () => {
    const tabs = claimBannerHost('tabs')
    const screen = claimBannerHost('notifications')
    screen()
    expect(bannerPresentation({ type: 'match' })).toBe('in-app')
    tabs()
    expect(bannerPresentation({ type: 'match' })).toBe('system')
  })
})

describe('the capsule’s words', () => {
  it('names nobody a nameless push does not: a glyph tile, the push’s title, “Just now”', () => {
    const b = bannerFor({ title: 'New friend request', body: 'Someone wants to be friends.', data: { type: 'friend_request', requestId: 'r1' } }, 1000)
    expect(b).toMatchObject({ visual: { type: 'glyph', icon: 'user-plus' }, title: 'New friend request', context: 'Just now', data: { requestId: 'r1' }, merged: 1 })
  })

  it('says “Someone from Nebula is here” for a crew, from the crew’s name in the push title', () => {
    expect(bannerFor({ title: 'Nebula', body: 'x', data: { type: 'crew_here', crewId: 'c' } }, 1)?.title).toBe('Someone from Nebula is here')
  })

  it('draws an event change as the event tile, saying what changed', () => {
    const b = bannerFor({ title: 'Vinyl Night', body: 'New start time: 9:30 pm', data: { type: 'event_update', eventId: 'e1', reason: 'venue' } }, 1)
    expect(b).toMatchObject({ visual: { type: 'event', badge: 'map-pin', cancelled: false }, title: 'New start time: 9:30 pm', context: 'Vinyl Night · just now' })
  })

  it('shows a message’s text under its sender line, and a banner is never made for a silent kind', () => {
    expect(bannerFor({ title: 'Aisha', body: 'see you at 9', data: { type: 'private_message', conversationId: 'c' } }, 1)?.context).toBe('see you at 9')
    expect(bannerFor({ title: 'x', body: 'y', data: { type: 'announcement' } }, 1)).toBeNull()
  })

  it('drops payload values that are not strings', () => {
    expect(bannerFor({ title: 'x', body: 'y', data: { type: 'match', n: 3, conversationId: 'c' } }, 1)?.data).toEqual({ type: 'match', conversationId: 'c' })
  })
})

describe('merging', () => {
  const match = (at: number) => bannerFor({ title: 'You have a new match', body: 'x', data: { type: 'match', conversationId: `c${at}` } }, at)!

  it('merges a same-kind arrival inside the window into “2 new matches”, then 3', () => {
    const two = nextBanner(match(1000), match(2000))
    expect(two).toMatchObject({ title: '2 new matches', merged: 2, data: {} })
    expect(nextBanner(two, match(3000))).toMatchObject({ title: '3 new matches', merged: 3 })
  })

  it('does not merge after the window, across kinds, or a kind that never merges', () => {
    expect(nextBanner(match(0), match(MERGE_WINDOW_MS + 1)).merged).toBe(1)
    const req = bannerFor({ title: 'r', body: 'x', data: { type: 'friend_request' } }, 10)!
    expect(nextBanner(match(0), req)).toBe(req)
    const ev = (at: number) => bannerFor({ title: 'e', body: 'b', data: { type: 'event_update', eventId: 'e' } }, at)!
    expect(nextBanner(ev(0), ev(100)).merged).toBe(1)
    expect(nextBanner(null, req)).toBe(req)
  })

  it('a merged banner keeps the key of the one on screen, so it updates in place instead of landing again', () => {
    const first = match(1000)
    const two = nextBanner(first, match(2000))
    expect(two.key).toBe(first.key)
    expect(nextBanner(two, match(3000)).key).toBe(first.key)
    // A fresh arrival after the window is a new banner.
    expect(nextBanner(two, match(MERGE_WINDOW_MS * 3)).key).not.toBe(first.key)
  })
})
