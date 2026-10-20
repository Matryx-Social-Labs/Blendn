import {
  AREA_SECTIONS_READY,
  categoryChips,
  SECTION_ORDER,
  pulsePeekLine,
  DAY_RESET_HOUR,
  everythingElse,
  FEATURED_CAP,
  featuredLabel,
  featuredPick,
  FOR_YOU_MIN,
  isLiveNow,
  LIVE_FLOOR,
  nextDayReset,
  printable,
  pulseSections,
  seedDateOf,
  WEEKEND_MIN,
  weekendLabel,
  weekendWindow,
  type SectionEvent,
} from '../lib/pulseSections'

/** Tuesday 21 Oct 2026, 19:00 local. */
const NOW = new Date(2026, 9, 20, 19, 0).getTime()
const SEED = seedDateOf(NOW)
const at = (h: number, day = 0, m = 0) => new Date(2026, 9, 20 + day, h, m).toISOString()

type E = SectionEvent & { title?: string }
const ev = (id: string, startH: number, over: Partial<E> = {}, day = 0): E => ({
  id,
  start_time: at(startH, day),
  end_time: at(startH + 3, day),
  ...over,
})
const empty = { weekend: null, forYou: null, now: NOW, hasFix: true, seedDate: SEED }
const keys = (page: E[], extra: Partial<Parameters<typeof pulseSections<E>>[0]> = {}) =>
  pulseSections<E>({ page, ...empty, ...extra }).map((s) => s.key)

describe('time', () => {
  it('live is started and not over; an event with no end runs four hours', () => {
    expect(isLiveNow(ev('a', 18), NOW)).toBe(true)
    expect(isLiveNow(ev('a', 20), NOW)).toBe(false)
    expect(isLiveNow(ev('a', 12), NOW)).toBe(false)
    const open = (h: number): SectionEvent => ({ id: 'b', start_time: at(h), end_time: null })
    expect(isLiveNow(open(17), NOW)).toBe(true)
    expect(isLiveNow(open(14), NOW)).toBe(false)
  })

  it('tonight ends at the next 06:00: today’s before 06:00, tomorrow’s after', () => {
    expect(nextDayReset(NOW)).toBe(new Date(2026, 9, 21, DAY_RESET_HOUR).getTime())
    expect(nextDayReset(new Date(2026, 9, 21, 2).getTime())).toBe(new Date(2026, 9, 21, DAY_RESET_HOUR).getTime())
  })

  it('the weekend window runs Friday 17:00 to Sunday 23:59; a Saturday is inside it; Sunday 18:00 skips', () => {
    const tue = weekendWindow(NOW)
    expect(new Date(tue.startDate).getDay()).toBe(5)
    expect(new Date(tue.startDate).getHours()).toBe(17)
    expect(new Date(tue.endDate).getDay()).toBe(0)
    expect(tue.skip).toBe(false)
    expect(tue.label).toBe('Sat 24 – Sun 25 Oct')
    const sat = weekendWindow(new Date(2026, 9, 24, 12).getTime())
    expect(new Date(sat.startDate).getDate()).toBe(23)
    expect(weekendWindow(new Date(2026, 9, 25, 17, 59).getTime()).skip).toBe(false)
    expect(weekendWindow(new Date(2026, 9, 25, 18, 0).getTime()).skip).toBe(true)
  })

  it('a label across a month break names both months', () => {
    expect(weekendLabel(new Date(2026, 9, 31), new Date(2026, 10, 1))).toBe('Sat 31 Oct – Sun 1 Nov')
  })
})

describe('Happening now', () => {
  it('is absent with nothing live; otherwise most people here first, then earliest start; capped at 8 with the total in the count', () => {
    expect(keys([ev('a', 20)])).not.toContain('now')
    const live = Array.from({ length: 10 }, (_, i) => ev(`l${i}`, 17, { here_count: i }))
    const now = pulseSections<E>({ page: live, ...empty }).find((s) => s.key === 'now')!
    expect(now.events.map((e) => e.id)).toEqual(['l9', 'l8', 'l7', 'l6', 'l5', 'l4', 'l3', 'l2'])
    expect(now.count).toBe(10)
  })
})

describe('Featured', () => {
  const flagged = (id: string, over: Partial<E> = {}) => ev(id, 21, { is_featured: true, ...over })

  it('is only what is featured, never back-filled: with none, the section is absent', () => {
    expect(keys([ev('a', 21, { cover_image_url: 'x' } as never), ev('b', 22)])).not.toContain('featured')
  })

  it('caps at five and rotates by the day, stable within it', () => {
    const page = Array.from({ length: 9 }, (_, i) => flagged(`f${i}`))
    const today = featuredPick(page, NOW, SEED).map((e) => e.id)
    expect(today).toHaveLength(FEATURED_CAP)
    expect(featuredPick(page, NOW + 60_000, SEED).map((e) => e.id)).toEqual(today)
    const tomorrow = featuredPick(page, NOW, '2026-10-21').map((e) => e.id)
    expect(tomorrow).toHaveLength(FEATURED_CAP)
    expect(tomorrow).not.toEqual(today)
  })

  it('the server’s rank wins when it sends one', () => {
    const page = [flagged('a', { featured: { kind: 'editorial', rank: 2 } }), flagged('b', { featured: { kind: 'promoted', rank: 1 } }), flagged('c', { featured: { kind: 'editorial', rank: 3 } })]
    expect(featuredPick(page, NOW, SEED).map((e) => e.id)).toEqual(['b', 'a', 'c'])
  })

  it('the featured request shows an event outside the first page, in the server’s rank order', () => {
    const requested = [flagged('x', { featured: { kind: 'promoted', rank: 1 } }), flagged('y', { featured: { kind: 'editorial', rank: 2 } })]
    const page = [flagged('a', { featured: { kind: 'editorial', rank: 3 } }), ev('plain', 20)]
    const featured = pulseSections<E>({ page, featured: requested, ...empty }).find((s) => s.key === 'featured')!
    expect(featured.events.map((e) => e.id)).toEqual(['x', 'y', 'a'])
  })

  it('an unflagged event from that request is not featured (a server that ignores featured=true)', () => {
    const featured = pulseSections<E>({ page: [], featured: [ev('plain', 20)], ...empty }).find((s) => s.key === 'featured')
    expect(featured).toBeUndefined()
  })

  it('an event that is over is never featured', () => {
    expect(featuredPick([flagged('a', { start_time: at(10), end_time: at(12) })], NOW, SEED)).toEqual([])
  })

  it('only a promoted placement is labelled Promoted (the server’s word; "paid" is not one); an editorial pick and the admin toggle carry none', () => {
    expect(featuredLabel(flagged('a', { featured: { kind: 'promoted', rank: 1 } }))).toBe('Promoted')
    expect(featuredLabel(flagged('a', { featured: { kind: 'editorial', rank: 1 } }))).toBeNull()
    expect(featuredLabel(flagged('a'))).toBeNull()
    expect(featuredLabel(flagged('a', { featured: { kind: 'paid', rank: 1 } as never }))).toBeNull()
  })
})

describe('Tonight', () => {
  it('upcoming before the next 06:00, earliest first, four rows, the count is all of it', () => {
    const page = [ev('late', 23), ev('a', 20), ev('b', 21), ev('c', 22), ev('d', 22, {}, 0), ev('tomorrow', 12, {}, 1), ev('past', 9)]
    const tonight = pulseSections<E>({ page, ...empty }).find((s) => s.key === 'tonight')!
    expect(tonight.events.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(tonight.count).toBe(5)
    expect(tonight.events.map((e) => e.id)).not.toContain('tomorrow')
  })

  it('is absent with nothing tonight', () => {
    expect(keys([ev('t', 12, {}, 1)])).not.toContain('tonight')
  })
})

describe('Nearby', () => {
  const near = (id: string, km: number | null, startH = 21, day = 0) => ev(id, startH, { distance: km }, day)

  it('nearest first, four rows, within seven days, live included, and not deduped against Tonight', () => {
    const page = [near('far', 9), near('a', 0.4), near('live', 1.2, 17), near('c', 2), near('d', 3), near('e', 4), near('later', 0.1, 21, 9)]
    const s = pulseSections<E>({ page, ...empty })
    const nearby = s.find((x) => x.key === 'nearby')!
    expect(nearby.events.map((e) => e.id)).toEqual(['a', 'live', 'c', 'd'])
    // 'a' is also tonight: Nearby is exempt from the one-section rule.
    expect(s.find((x) => x.key === 'tonight')!.events.map((e) => e.id)).toContain('a')
  })

  it('with no fix there is no Nearby (the screen draws the location card); a fix and nothing within reach: absent', () => {
    expect(keys([near('a', 1)], { hasFix: false })).not.toContain('nearby')
    expect(keys([near('a', null)])).not.toContain('nearby')
  })
})

describe('Because you like', () => {
  const forYou = (events: E[]) => ({ interest: { name: 'Live music', slug: 'live-music' }, events })

  it('after dedupe against Now, Featured and Tonight; fewer than three left means absent', () => {
    const tonight = ev('t1', 20)
    const mine = [tonight, ev('a', 21, {}, 1), ev('b', 21, {}, 2)]
    expect(keys([tonight], { forYou: forYou(mine) })).not.toContain('forYou')
    const enough = [tonight, ev('a', 21, {}, 1), ev('b', 21, {}, 2), ev('c', 21, {}, 3)]
    const s = pulseSections<E>({ page: [tonight], ...empty, forYou: forYou(enough) }).find((x) => x.key === 'forYou')!
    expect(s.events.map((e) => e.id)).toEqual(['a', 'b', 'c'])
    expect(s.interest).toEqual({ name: 'Live music', slug: 'live-music' })
    expect(FOR_YOU_MIN).toBe(3)
  })

  it('is absent when there is no interest or the request failed (null)', () => {
    expect(keys([ev('a', 20)], { forYou: null })).not.toContain('forYou')
  })
})

describe('This weekend', () => {
  const sat = (id: string) => ev(id, 21, {}, 4)

  it('absent under two events after dedupe; skipped from Sunday 18:00; a failed request (null) hides it', () => {
    expect(keys([], { weekend: [sat('a')] })).not.toContain('weekend')
    expect(keys([], { weekend: [sat('a'), sat('b')] })).toContain('weekend')
    expect(WEEKEND_MIN).toBe(2)
    const sunEve = new Date(2026, 9, 25, 19).getTime()
    expect(pulseSections<E>({ page: [], ...empty, now: sunEve, weekend: [sat('a'), sat('b')] }).map((s) => s.key)).not.toContain('weekend')
    expect(keys([], { weekend: null })).not.toContain('weekend')
  })

  it('an event Tonight or in Because-you-like is not repeated here', () => {
    const tonight = ev('t', 20)
    const s = pulseSections<E>({ page: [tonight], ...empty, weekend: [tonight, sat('a'), sat('b')] }).find((x) => x.key === 'weekend')!
    expect(s.events.map((e) => e.id)).toEqual(['a', 'b'])
  })
})

describe('the order and the dedupe', () => {
  it('draws Featured first, then Now, Tonight, Nearby, Because you like, This weekend; an event is claimed by the first that wants it', () => {
    const live = ev('live', 17, { is_featured: true, distance: 1 })
    const running = ev('running', 17, { distance: 4 })
    const feat = ev('feat', 22, { is_featured: true, distance: 2 })
    const tonight = ev('tonight', 21, { distance: 3 })
    const s = pulseSections<E>({
      page: [tonight, feat, running, live],
      ...empty,
      forYou: { interest: { name: 'Jazz', slug: 'jazz' }, events: [ev('y1', 21, {}, 1), ev('y2', 21, {}, 2), ev('y3', 21, {}, 3)] },
      weekend: [ev('w1', 21, {}, 4), ev('w2', 21, {}, 5)],
    })
    expect(s.map((x) => x.key)).toEqual(['featured', 'now', 'tonight', 'nearby', 'forYou', 'weekend'])
    // Featured claims first, even a running event: it is not repeated under Happening now.
    expect(s[0].events.map((e) => e.id).sort()).toEqual(['feat', 'live'])
    expect(s[1].events.map((e) => e.id)).toEqual(['running'])
    expect(s[2].events.map((e) => e.id)).toEqual(['tonight'])
  })

  it('Featured is the top section, above Happening now, whatever else is on', () => {
    expect(SECTION_ORDER.slice(0, 2)).toEqual(['featured', 'now'])
    const s = pulseSections<E>({ page: [ev('r', 17), ev('f', 22, { is_featured: true })], ...empty })
    expect(s[0].key).toBe('featured')
  })

  it('"Events in {area}" and "Around {area}" hold their slots (after Now, and after Tonight) but are hidden until the area endpoints exist', () => {
    expect(SECTION_ORDER).toEqual(['featured', 'now', 'inArea', 'tonight', 'aroundArea', 'nearby', 'forYou', 'weekend'])
    expect(AREA_SECTIONS_READY).toBe(false)
    const s = pulseSections<E>({ page: [ev('a', 21, { distance: 1 }), ev('r', 17)], ...empty })
    expect(s.map((x) => x.key)).not.toContain('inArea')
    expect(s.map((x) => x.key)).not.toContain('aroundArea')
    // The sections after Tonight keep their slots.
    expect(s.map((x) => x.key)).toEqual(['now', 'tonight', 'nearby'])
  })

  it('the count floor of five holds: a live event with 4 here prints nothing, with 5 prints 5', () => {
    expect(printable(4)).toBeNull()
    expect(printable(5)).toBe(5)
  })

  it('Everything else is the page minus every event a section drew, Nearby’s included', () => {
    const page = [ev('a', 20, { distance: 1 }), ev('b', 22, { distance: 2 }), ev('x', 21, {}, 3)]
    const s = pulseSections<E>({ page, ...empty })
    // 'a' and 'b' are Tonight (and Nearby); 'x' is in no section, so it is left for Everything else.
    expect(everythingElse(page, s).map((e) => e.id)).toEqual(['x'])
    const quiet = [ev('x', 21, {}, 3), ev('y', 21, {}, 4)]
    expect(everythingElse(quiet, pulseSections<E>({ page: quiet, ...empty, hasFix: false })).map((e) => e.id)).toEqual(['x', 'y'])
  })

  it('a duplicate in the page is one event', () => {
    const s = pulseSections<E>({ page: [ev('a', 21), ev('a', 21)], ...empty })
    expect(s.find((x) => x.key === 'tonight')!.count).toBe(1)
  })
})

describe('the people floor', () => {
  it('prints five and up, nothing below, and never a fraction or a non-number', () => {
    expect(LIVE_FLOOR).toBe(5)
    expect(printable(4)).toBeNull()
    expect(printable(5)).toBe(5)
    expect(printable(12.7)).toBe(12)
    expect(printable(null)).toBeNull()
    expect(printable(Number.NaN)).toBeNull()
  })
})

describe('what the Everything-else chips and the peek line read', () => {
  it('chips: only categories with an event in what is loaded, busiest first, with counts', () => {
    const options = [{ slug: 'music', name: 'Live music' }, { slug: 'comedy', name: 'Comedy' }, { slug: 'food', name: 'Food & drink' }]
    const events = [{ category_group: 'music' }, { category_group: 'music' }, { category_group: 'comedy' }, { category_group: 'other' }, { category_group: '' }]
    expect(categoryChips(events, options)).toEqual([
      { slug: 'music', name: 'Live music', count: 2 },
      { slug: 'comedy', name: 'Comedy', count: 1 },
    ])
    expect(categoryChips([], options)).toEqual([])
  })

  it('peek: “3 live now · 14 on tonight”; a part that is 0 is dropped; both 0 is no line', () => {
    const sec = (key: 'now' | 'tonight', count: number) => ({ key, events: [], count })
    expect(pulsePeekLine([sec('now', 3), sec('tonight', 14)])).toBe('3 live now · 14 on tonight')
    expect(pulsePeekLine([sec('tonight', 6)])).toBe('6 on tonight')
    expect(pulsePeekLine([sec('now', 2)])).toBe('2 live now')
    expect(pulsePeekLine([])).toBeNull()
  })
})
