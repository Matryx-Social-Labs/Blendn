/*
 * The fields blendn-admin #716 (`feat/client-gaps`) adds and this client reads: `photo_states`, `badges`, `changedAt` /
 * `changedFields` / `changedFrom`, `days` / `dayCount` / `dayNumber`, `badgeCount`, a row's `display` and `open`, and the
 * `ORGANISER_SUSPENDED` reason.
 *
 * Every fixture is copied from that branch's own tests (`__tests__/integration/event-changed-scene.itest.ts`,
 * `notification-feed-details.itest.ts`, `profile-friends-push-gaps.itest.ts`, `profile-badges.itest.ts`) or its API doc, never
 * written from this client's types. Every field is optional: an installed server sends none of them, and each case below that
 * names an "older server" is the answer today's builds already get.
 */
process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'

import { changeLines, parseEventChange } from '../lib/eventChange'
import { dayLabel, dayOfWords, eventToday, parseEventDays, sessionDay, sessionIsToday } from '../lib/eventDays'
import { eventLoadFailure } from '../lib/eventLinkRefusal'
import { mainWasPulled, pulledPhotos } from '../lib/photoStates'
import { BADGE_MEANING, parseBadges } from '../lib/profileBadges'
import { iconBadgeAfterRead, iconBadgeFor } from '../lib/appBadge'
import { checkInRefusal, isExpectedRefusal } from '../lib/checkInRefusal'
import { isOrganiserSuspended, NO_LONGER_AVAILABLE } from '../lib/noLongerAvailable'
import { reasonOf } from '../lib/sessionEnd'
import { spokenAge } from '../components/scene/SceneChange'
import type { NotificationItem } from '../lib/notificationFormat'
import { rowFor } from '../lib/notificationRows'

const NOW = Date.parse('2031-01-01T12:00:00Z')

describe('photo_states (your own profile)', () => {
  // profile-friends-push-gaps.itest.ts: the photo that is up, then the one moderation pulled, whose URL is never sent.
  const states = [
    { url: 'https://cdn.test/profile/p1/live.jpg', pulled: false, pulled_at: null, was_main: false },
    { url: null, pulled: true, pulled_at: '2026-10-21T09:15:00.000Z', was_main: true },
  ]

  it('reads the pulled slots only: the live photos are already `photos`', () => {
    expect(pulledPhotos(states)).toEqual([{ pulledAt: '2026-10-21T09:15:00.000Z', wasMain: true }])
    expect(mainWasPulled(pulledPhotos(states))).toBe(true)
  })

  it('reads an older server, an empty list and a malformed one as none', () => {
    expect(pulledPhotos(undefined)).toEqual([])
    expect(pulledPhotos([])).toEqual([])
    expect(pulledPhotos('pulled')).toEqual([])
    expect(pulledPhotos([null, 3, { pulled: 'yes' }])).toEqual([])
    expect(mainWasPulled(pulledPhotos([{ url: null, pulled: true, pulled_at: null, was_main: false }]))).toBe(false)
  })
})

describe('badges', () => {
  // profile-badges.itest.ts: `{ kind, label }` for what check-ins earned; `[]` earned none; the key is absent when badges are off.
  it('reads what the server sent, in its order', () => {
    expect(parseBadges([{ kind: 'shows_up', label: 'Shows up' }])).toEqual([{ kind: 'shows_up', label: 'Shows up' }])
    expect(parseBadges([{ kind: 'nights_out', label: '5+ nights this month' }, { kind: 'shows_up', label: 'Shows up' }])?.map((b) => b.kind)).toEqual([
      'nights_out',
      'shows_up',
    ])
  })

  it('keeps "none earned yet" and "none sent" apart', () => {
    expect(parseBadges([])).toEqual([])
    expect(parseBadges(undefined)).toBeNull()
    expect(parseBadges(null)).toBeNull()
  })

  it('drops a kind this build has no pill for, and a repeat, rather than crashing the pill', () => {
    expect(parseBadges([{ kind: 'brand_new', label: 'x' }, { kind: 'shows_up' }, { kind: 'shows_up', label: 'Shows up' }])).toEqual([{ kind: 'shows_up', label: '' }])
  })

  it('has one line of meaning for each of the four kinds', () => {
    expect(Object.keys(BADGE_MEANING).sort()).toEqual(['nights_out', 'nights_together', 'regular_here', 'shows_up'])
  })
})

describe('what changed (GET /events/:id)', () => {
  // event-changed-scene.itest.ts "a time and a venue moved": changedFrom names what they were, the live values stay in the event.
  const changed = {
    changedAt: '2031-01-01T11:00:00.000Z',
    changedFields: ['time', 'venue'],
    changedFrom: { startTime: '2031-01-01T19:00:00.000Z', endTime: '2031-01-01T22:00:00.000Z', venueName: 'The Old Room' },
  }
  const current = { start_time: '2031-01-01T21:00:00.000Z', end_time: '2031-01-02T00:00:00.000Z', venue_name: 'The New Room', address: '1 Road' }

  it('is a line for the time and one for the venue, with what it was and what it is', () => {
    const change = parseEventChange(changed)
    expect(change?.fields).toEqual(['time', 'venue'])
    const lines = changeLines(change!, current, NOW)
    expect(lines.map((l) => [l.key, l.label])).toEqual([
      ['time', 'Updated · new start time'],
      ['venue', 'Updated · new venue'],
    ])
    expect(lines[1]).toMatchObject({ was: 'The Old Room', now: 'The New Room' })
    expect(lines[0].was).not.toBe(lines[0].now)
  })

  it('is no change for an event that has not changed (null, [] and null), or from an older server (nothing)', () => {
    expect(parseEventChange({ changedAt: null, changedFields: [], changedFrom: null })).toBeNull()
    expect(parseEventChange({})).toBeNull()
  })

  it('leaves a cancel to the Scene\'s banner: it is a change, and no line', () => {
    // itest "cancelled": changedFields ["cancelled"], changedFrom null.
    const change = parseEventChange({ changedAt: '2031-01-01T11:00:00.000Z', changedFields: ['cancelled'], changedFrom: null })
    expect(change?.fields).toEqual(['cancelled'])
    expect(changeLines(change!, current, NOW)).toEqual([])
  })

  it('reads an end time that moved alone, and an address that moved alone', () => {
    const end = parseEventChange({ changedAt: changed.changedAt, changedFields: ['time'], changedFrom: { endTime: '2031-01-01T22:00:00.000Z' } })
    expect(changeLines(end!, current, NOW)[0].label).toBe('Updated · new end time')
    const address = parseEventChange({ changedAt: changed.changedAt, changedFields: ['venue'], changedFrom: { address: '2 Other Rd' } })
    expect(changeLines(address!, current, NOW)[0]).toMatchObject({ was: '2 Other Rd', now: '1 Road' })
  })

  it('a venue that had no name falls back to the address, never a line that says "null"', () => {
    // changedFrom.venueName is null when the event had no name before (event-changed-scene.itest.ts "put back": `{ venue_name }`).
    const change = parseEventChange({ changedAt: changed.changedAt, changedFields: ['venue'], changedFrom: { venueName: null, address: '2 Other Rd' } })
    expect(changeLines(change!, current, NOW)[0]).toMatchObject({ was: '2 Other Rd', now: '1 Road' })
  })

  it('draws no line it cannot say both halves of', () => {
    const noFrom = parseEventChange({ changedAt: changed.changedAt, changedFields: ['time', 'venue'], changedFrom: null })
    expect(changeLines(noFrom!, current, NOW)).toEqual([])
  })

  it('ignores a field name this build does not know', () => {
    expect(parseEventChange({ changedAt: changed.changedAt, changedFields: ['organiser'], changedFrom: null })).toBeNull()
  })
})

describe('the days of a run (GET /events/:id, #716 and the #724 window)', () => {
  // event-changed-scene.itest.ts "the days of a run": three days, the third called off, today the second. `cancelledAt` is the
  // timestamp beside `cancelled`, and `daysFrom` is 1 for an ordinary event (blendn-admin event-days.itest.ts, `body`).
  const at = (n: number) => ({ startTime: `2031-01-0${n}T19:00:00.000Z`, endTime: `2031-01-0${n}T22:00:00.000Z` })
  const run = {
    days: [
      { date: '2031-01-01', ...at(1), cancelled: false, cancelledAt: null },
      { date: '2031-01-02', ...at(2), cancelled: false, cancelledAt: null },
      { date: '2031-01-03', ...at(3), cancelled: true, cancelledAt: '2030-12-30T10:00:00.000Z' },
    ],
    dayCount: 3,
    daysFrom: 1,
    dayNumber: 2,
  }

  it('says "Day 2 of 3" and names each day by its own calendar date, in any time zone', () => {
    const days = parseEventDays(run)!
    expect(dayOfWords(days)).toBe('Day\u00a02 of\u00a03')
    expect(days.days.map((d) => d.cancelled)).toEqual([false, false, true])
    expect(days.days.map((d) => dayLabel(d.date))).toEqual(['Wed 1', 'Thu 2', 'Fri 3'])
    expect(days).toMatchObject({ daysFrom: 1, dayCount: 3, dayNumber: 2 })
  })

  it('a day is called off by `cancelled` or by `cancelledAt`, whichever the server sent', () => {
    const only = { ...run, days: [run.days[0], { date: '2031-01-02', cancelledAt: '2030-12-30T10:00:00.000Z' }, run.days[1]] }
    expect(parseEventDays(only)!.days.map((d) => d.cancelled)).toEqual([false, true, false])
  })

  // event-days.itest.ts "caps a 120-day run at a window around today and still says 120": `days` is at most 31 (EVENT_DAYS_WINDOW),
  // from two days before today's, `dayCount` and `dayNumber` are the whole run. A 60-day run, today day 40: the window is days
  // 30..60 (`first = min(index - 2, 60 - 31)`).
  const window60 = {
    days: Array.from({ length: 31 }, (_, i) => ({
      date: new Date(Date.UTC(2031, 0, 30 + i)).toISOString().slice(0, 10),
      startTime: '2031-01-01T19:00:00.000Z',
      endTime: '2031-01-01T22:00:00.000Z',
      cancelled: false,
      cancelledAt: null,
    })),
    dayCount: 60,
    daysFrom: 30,
    dayNumber: 40,
  }

  it('reads a window of a long run: the whole run\'s count and day number, and where the window starts', () => {
    const days = parseEventDays(window60)!
    expect(days.days).toHaveLength(31)
    expect(days).toMatchObject({ daysFrom: 30, dayCount: 60, dayNumber: 40 })
    expect(dayOfWords(days)).toBe('Day\u00a040 of\u00a060')
    expect(sessionDay(days)).toEqual(days.days[10])
  })

  it('does not trust a window that would run past the end of the run: it starts at 1 then', () => {
    expect(parseEventDays({ ...window60, daysFrom: 38 })!.daysFrom).toBe(1)
    expect(parseEventDays({ ...window60, daysFrom: 0 })!.daysFrom).toBe(1)
    expect(parseEventDays({ ...window60, daysFrom: undefined })!.daysFrom).toBe(1)
  })

  it('never counts fewer days than it was given, and a run with one day has nothing to strip', () => {
    expect(parseEventDays({ ...run, dayCount: 2 })!.dayCount).toBe(3)
    expect(parseEventDays({ ...run, dayCount: undefined })!.dayCount).toBe(3)
    expect(parseEventDays({ days: [run.days[0]], dayCount: 1, daysFrom: 1, dayNumber: 1 })).toBeNull()
    expect(parseEventDays({})).toBeNull()
  })

  it('says no day is running when every day is cancelled (dayNumber null), and does not trust a dayNumber outside the run', () => {
    expect(dayOfWords(parseEventDays({ ...run, dayNumber: null })!)).toBeNull()
    expect(parseEventDays({ ...run, dayNumber: 9 })!.dayNumber).toBeNull()
    expect(parseEventDays({ ...window60, dayNumber: 61 })!.dayNumber).toBeNull()
    expect(sessionDay(parseEventDays({ ...window60, dayNumber: 3 })!)).toBeNull()
  })

  it('"today" is the event\'s own date in its zone, not the phone\'s', () => {
    // 2031-01-01T20:00Z is already Jan 2 in Kolkata and still Jan 1 in Los Angeles.
    const instant = Date.parse('2031-01-01T20:00:00Z')
    expect(eventToday('Asia/Kolkata', instant)).toBe('2031-01-02')
    expect(eventToday('America/Los_Angeles', instant)).toBe('2031-01-01')
    expect(sessionIsToday(parseEventDays(run)!, 'Asia/Kolkata', instant)).toBe(true)
    expect(sessionIsToday(parseEventDays(run)!, 'America/Los_Angeles', instant)).toBe(false)
  })

  it('an unknown zone falls back to the phone\'s date rather than throwing', () => {
    expect(eventToday('Not/AZone', Date.parse('2031-01-01T12:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('the organiser was suspended (SCRUM-749)', () => {
  // event-changed-scene.itest.ts: `withReason` and `plain`.
  const withReason = { success: false, errorCode: 'NOT_FOUND', reasonCode: 'ORGANISER_SUSPENDED', error: 'Event not found' }
  const plain = { success: false, error: 'Event not found', errorCode: 'NOT_FOUND' }

  it('is the "No longer available" landing by its code, whatever the sentence says', () => {
    expect(eventLoadFailure(withReason)).toBe('notFound')
    expect(eventLoadFailure({ ...withReason, error: 'This event is not available.' })).toBe('notFound')
    expect(eventLoadFailure(plain)).toBe('notFound')
  })

  it('names the suspension by its own code, with no errorCode beside it', () => {
    expect(eventLoadFailure({ reasonCode: 'ORGANISER_SUSPENDED', error: 'Gone.' })).toBe('notFound')
  })

  it('reads a reason this build does not know, on the 404 that says the event is gone, as gone, not as a bad connection', () => {
    expect(eventLoadFailure({ errorCode: 'NOT_FOUND', reasonCode: 'SOME_NEW_REASON', error: 'Gone.' })).toBe('notFound')
  })

  it('still reads a failure with no code and no such sentence as a connection that failed', () => {
    expect(eventLoadFailure({ error: 'Network request failed' })).toBe('network')
  })

  it('does not turn the age or profile refusals into a landing', () => {
    expect(eventLoadFailure({ errorCode: 'AGE_RESTRICTED', reasonCode: 'AGE_UNKNOWN', error: 'Add your age' })).toBe('age_unknown')
    expect(eventLoadFailure({ errorCode: 'FORBIDDEN', reasonCode: 'PROFILE_INCOMPLETE', error: 'Finish your profile' })).toBe('profile')
  })
})

describe('the suspension on the other routes that refuse the event (check-in, chat, crews)', () => {
  // The same body on every one of them (blendn-admin ce249325 `eventAccessResponse`): 404, errorCode NOT_FOUND, reasonCode beside it.
  const withReason = { success: false, errorCode: 'NOT_FOUND', reasonCode: 'ORGANISER_SUSPENDED', error: 'Event not found' }

  it('the door says the one sentence, offers no directions and no retry, and is a refusal by design', () => {
    const refusal = checkInRefusal(reasonOf(withReason), withReason.error)
    expect(refusal).toMatchObject({ title: NO_LONGER_AVAILABLE.title, message: NO_LONGER_AVAILABLE.body, offerDirections: false })
    expect(refusal.fix).toBeUndefined()
    expect(isExpectedRefusal(reasonOf(withReason))).toBe(true)
  })

  it('is recognised by its code, and a plain 404 is not it', () => {
    expect(isOrganiserSuspended(withReason)).toBe(true)
    expect(isOrganiserSuspended({ errorCode: 'NOT_FOUND' } as { reasonCode?: string })).toBe(false)
    expect(isOrganiserSuspended(undefined)).toBe(false)
  })
})

it('the room chat says the same sentence when it was the suspension that closed it (the screen has no harness: pinned at its source)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const src = require('fs').readFileSync(require('path').join(__dirname, '../components/blendn/BlendnScreen.tsx'), 'utf8') as string
  // The lookup and its sentences are `eventRoomDoor`'s, tested by behaviour in eventRoomDoor.test.ts; the screen says its line.
  expect(src).toMatch(/const door = await eventRoomDoor\(eventId, eventTitle\)\s+if \(door\.kind === 'say'\) say\(door\.line\)/)
})

describe('how the change was long ago, said aloud', () => {
  it('is lowercase and in words', () => {
    expect(spokenAge('2 h ago')).toBe('2 hours ago')
    expect(spokenAge('1 h ago')).toBe('1 hour ago')
    expect(spokenAge('5 min ago')).toBe('5 minutes ago')
    expect(spokenAge('Just now')).toBe('just now')
    expect(spokenAge('Yesterday')).toBe('yesterday')
  })
})

describe('badgeCount (GET /notifications)', () => {
  // notification-feed-details.itest.ts "badgeCount": two unseen rows and a conversation with something unread.
  const feed = { unreadCount: 2, badgeCount: 3 }

  it('is the app icon\'s number, and what is left of it once the bell\'s rows are seen is the conversations', () => {
    expect(iconBadgeFor(feed)).toBe(3)
    expect(iconBadgeAfterRead(feed)).toBe(1)
  })

  it('leaves the icon alone when the server sent none (an older server), or a number that is not a count', () => {
    expect(iconBadgeFor({ unreadCount: 2 })).toBeNull()
    expect(iconBadgeAfterRead({ unreadCount: 2 })).toBeNull()
    expect(iconBadgeFor({ badgeCount: -1 })).toBeNull()
    expect(iconBadgeFor({ badgeCount: '3' })).toBeNull()
    expect(iconBadgeFor({ badgeCount: 2.5 })).toBeNull()
  })

  it('never goes below zero', () => {
    expect(iconBadgeAfterRead({ unreadCount: 5, badgeCount: 3 })).toBe(0)
    expect(iconBadgeAfterRead({ unreadCount: 0, badgeCount: 0 })).toBe(0)
  })
})

describe('a notification row\'s display and open (GET /notifications)', () => {
  // notification-feed-details.itest.ts: the row as the server returns it.
  const row = (over: Partial<NotificationItem> & Pick<NotificationItem, 'id' | 'kind'>): NotificationItem => ({
    title: 'New friend request',
    body: 'Someone wants to be friends.',
    data: null,
    readAt: null,
    createdAt: '2031-01-01T11:55:00.000Z',
    ...over,
  })

  it('a waiting friend request is the asker\'s first name and photo, and only that and the time', () => {
    const item = row({
      id: 'n1',
      kind: 'friend_request',
      data: { type: 'friend_request', requestId: '11111111-1111-4111-8111-111111111111' },
      open: true,
      display: { title: 'Asha wants to be friends', visual: { type: 'photo', uri: 'https://cdn.test/a/1.jpg' } },
    })
    expect(rowFor(item, NOW)).toMatchObject({
      title: 'Asha wants to be friends',
      visual: { type: 'photo', uri: 'https://cdn.test/a/1.jpg' },
      context: '5 min ago',
      waiting: true,
    })
  })

  it('never carries an event or a room onto a friend row, whatever display.context names (PERSON_ONLY)', () => {
    const item = row({
      id: 'n2',
      kind: 'friend_request',
      open: true,
      display: { title: 'Asha wants to be friends', context: 'Vinyl Night · The Room', visual: { type: 'photo', uri: 'https://cdn.test/a/1.jpg' } },
    })
    expect(rowFor(item, NOW).context).toBe('5 min ago')
    const accepted = row({ id: 'n3', kind: 'friend_accepted', display: { title: 'Asha', context: 'Vinyl Night' } })
    expect(rowFor(accepted, NOW).context).toBe('5 min ago')
  })

  it('a request that is gone (open false, no display) is history with the kind\'s own tile, never a wrong face', () => {
    const gone = rowFor(row({ id: 'n4', kind: 'friend_request', open: false }), NOW)
    expect(gone.waiting).toBe(false)
    expect(gone.actions).toEqual([])
    expect(gone.visual).toEqual({ type: 'glyph', icon: 'user-plus' })
  })

  it('a crew invite is the crew\'s emblem seed and no name; a match is the room pseudonym', () => {
    const invite = rowFor(row({ id: 'n5', kind: 'crew_invite', title: 'Invited', open: true, display: { visual: { type: 'emblem', seed: 'seed-nebula' } } }), NOW)
    expect(invite.visual).toEqual({ type: 'emblem', seed: 'seed-nebula' })
    const match = rowFor(row({ id: 'n6', kind: 'match', display: { visual: { type: 'creature', pseudonym: 'Amber Fox' } } }), NOW)
    expect(match.visual).toEqual({ type: 'creature', pseudonym: 'Amber Fox' })
  })

  it('an event change is its cover and the kind\'s badge, a venue change the pin', () => {
    const changed = rowFor(
      row({
        id: 'n7',
        kind: 'event_changed' as NotificationItem['kind'],
        title: 'Vinyl Night',
        body: 'New venue',
        data: { type: 'event_changed', eventId: 'e1', reason: 'venue', changed: 'venue' },
        display: { visual: { type: 'event', cover: 'https://cdn.test/e.jpg', badge: 'map-pin', cancelled: false } },
      }),
      NOW
    )
    expect(changed.visual).toEqual({ type: 'event', cover: 'https://cdn.test/e.jpg', badge: 'map-pin', cancelled: false })
  })

  it('a row with no display or open (an older server) draws as it always did', () => {
    const plainRow = rowFor(row({ id: 'n8', kind: 'friend_request', data: { requestId: 'r1' } }), NOW)
    expect(plainRow).toMatchObject({ title: 'New friend request', waiting: true })
    expect(plainRow.visual).toEqual({ type: 'glyph', icon: 'user-plus' })
  })

  it('a shape that is not one of the visuals reads as absent', () => {
    const bad = rowFor(row({ id: 'n9', kind: 'friend_request', display: { title: 'Asha wants to be friends', visual: { type: 'hologram' } } }), NOW)
    expect(bad.visual).toEqual({ type: 'glyph', icon: 'user-plus' })
    expect(bad.title).toBe('Asha wants to be friends')
  })
})
