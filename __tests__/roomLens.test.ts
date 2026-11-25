import {
  answerLength,
  hereFor,
  openersFor,
  VENUE_OPENERS,
  commonFor,
  contextLine,
  leadFor,
  lensView,
  metaLine,
  normalizeAnswer,
  parseLens,
  pickReason,
  tonightCardFor,
  type LensPerson,
} from '../lib/roomLens'

/**
 * Flow 5 C3 (P-A): one profile, a lens per event type. The room's lens is the
 * server's (`category_lenses`); this pins what each lens puts first, and that
 * nothing here can put an identity on an anonymous person.
 */
const person: LensPerson = {
  workField: 'Product design',
  sharedIntents: ['networking'],
  interests: ['Product design', 'Cycling', 'Board games'],
  overlaps: [{ kind: 'language', text: 'Speaks French and English' }],
  badges: [{ kind: 'regular_here', label: 'Regular here' }],
}
const lens = (key: string, question: string | null = 'Q?') => ({ key, question })
const labels = (key: string, p: LensPerson = person) => leadFor(p, lens(key)).map((l) => l.label)

describe('what leads, by lens', () => {
  it('work: the field, then why they are here, in their own pick', () => {
    expect(labels('work', { ...person, workIntent: 'hire' })).toEqual(['Product design', 'Here to hire'])
  })
  it('work: each pick, as the pill says it, lit with the person-plus glyph', () => {
    const say = (workIntent: string) => leadFor({ ...person, workIntent }, lens('work'))[1]
    expect(['hire', 'find_work', 'build', 'learn'].map((w) => say(w)?.label)).toEqual([
      'Here to hire',
      'Here to find work',
      'Here to build',
      'Here to learn',
    ])
    expect(say('learn')).toMatchObject({ icon: 'user-plus', lit: true })
  })
  it('work: no pick, or one this build does not know, says nothing about why (never the shared intents)', () => {
    expect(labels('work')).toEqual(['Product design'])
    expect(labels('work', { ...person, workIntent: 'mentor' })).toEqual(['Product design'])
  })
  it('a pick is the work lens’s only: other rooms keep why they are here from the shared intents', () => {
    expect(labels('arts', { ...person, workIntent: 'hire' })).toEqual(['Product design', 'Here for work'])
    expect(labels('music', { ...person, workIntent: 'hire' })).not.toContain('Here to hire')
  })
  it('music: why they are here, then how much you share', () => {
    expect(labels('music')).toEqual(['Here for work', '3 in common'])
  })
  it('arts: the field, then why they are here', () => {
    expect(labels('arts')).toEqual(['Product design', 'Here for work'])
  })
  it('social: what you share, then languages', () => {
    expect(labels('social')).toEqual(['3 in common', 'Speaks French and English'])
  })
  it('active: what you share, then how often they come', () => {
    expect(labels('active')).toEqual(['3 in common', 'Regular here'])
  })
  it('venue night: why they are here, then languages; never a work line', () => {
    expect(labels('venue_night')).toEqual(['Here for work', 'Speaks French and English'])
    expect(labels('venue_night')).not.toContain('Product design')
  })
  it('the reason to meet is lit, the facts are not', () => {
    expect(leadFor({ ...person, workIntent: 'hire' }, lens('work')).map((l) => l.lit)).toEqual([false, true])
  })
  it('names every shared intent once, in one pill', () => {
    const p = { ...person, sharedIntents: ['friendship', 'networking', 'just_here'] }
    expect(labels('venue_night', p)[0]).toBe('Here for friends and work')
  })
  it('drops a pill it has nothing for, rather than drawing an empty one', () => {
    const bare: LensPerson = { workField: null, sharedIntents: [], interests: [], overlaps: [], badges: [] }
    for (const key of ['work', 'music', 'arts', 'social', 'active', 'venue_night']) expect(labels(key, bare)).toEqual([])
  })
})

describe('a null or unknown lens', () => {
  it('a null lens draws the plain profile: no lead, no question', () => {
    expect(leadFor(person, null)).toEqual([])
    expect(tonightCardFor(null, 'An answer')).toBeNull()
    expect(commonFor(person, null)).toEqual({ label: 'In common', items: person.interests })
  })
  it('a lens this build does not know still asks its question, with no lead', () => {
    expect(leadFor(person, lens('karaoke', 'What will you sing?'))).toEqual([])
    expect(tonightCardFor(lens('karaoke', 'What will you sing?'), 'Total Eclipse')).toEqual({ question: 'What will you sing?', answer: 'Total Eclipse' })
  })
})

describe('Tonight’s question', () => {
  it('draws the question with their answer', () => {
    expect(tonightCardFor(lens('work', 'What are you working on?'), 'A map of quiet cafés')).toEqual({
      question: 'What are you working on?',
      answer: 'A map of quiet cafés',
    })
  })
  it('venue night asks nothing, even with an answer somehow present', () => {
    expect(tonightCardFor(lens('venue_night', null), 'stale')).toBeNull()
  })
  it('no answer draws no card (the board drops it)', () => {
    expect(tonightCardFor(lens('work'), null)).toBeNull()
    expect(tonightCardFor(lens('work'), '   ')).toBeNull()
  })
  it('counts and trims the way the server does: whitespace runs collapse, code points count', () => {
    expect(normalizeAnswer('  a \n\n  b  ')).toBe('a b')
    expect(answerLength('😀😀')).toBe(2)
    expect(answerLength('प्रियंका')).toBe([...'प्रियंका'].length)
  })
})

describe('the lines around them', () => {
  it('a room’s context line names the event; a venue night names the place', () => {
    expect(contextLine(lens('work'), { title: 'Junction Tech Mixer' })).toBe('In the room at Junction Tech Mixer')
    expect(contextLine(lens('venue_night', null), { title: 'Tonight', venueName: 'Microbrasserie du Haut-Richelieu', city: 'Saint-Jean-sur-Richelieu' })).toBe(
      'At Microbrasserie du Haut-Richelieu, Saint-Jean-sur-Richelieu'
    )
    expect(contextLine(null, { title: '' })).toBeNull()
  })
  it('says Anonymous until they have shown you who they are', () => {
    expect(metaLine(false, 31)).toBe('Anonymous · 31')
    expect(metaLine(true, 31)).toBe('Shown to you · 31')
    expect(metaLine(false, undefined)).toBe('Anonymous')
  })
  it('venue nights and social rooms say “Things in common”', () => {
    expect(commonFor(person, lens('venue_night', null)).label).toBe('Things in common')
    expect(commonFor(person, lens('social')).label).toBe('Things in common')
    expect(commonFor(person, lens('work')).label).toBe('In common')
  })
  it('a Meet next pick says their answer first, else the lens lead', () => {
    expect(pickReason(person, lens('work'), 'A map of cafés')).toBe('“A map of cafés”')
    expect(pickReason({ ...person, workIntent: 'learn' }, lens('work'), null)).toBe('Product design · Here to learn')
    expect(pickReason(person, null, null)).toBeNull()
  })
})

describe('anonymity', () => {
  it('the work lens never shows an employer, name, photo or bio, whatever the object carries', () => {
    const leaky = { ...person, occupation: 'Shopify', name: 'Marc-André', photo: 'https://x/p.jpg', bio: 'I run Lefebvre Labs' } as LensPerson
    const out = JSON.stringify([leadFor(leaky, lens('work')), commonFor(leaky, lens('work')), pickReason(leaky, lens('work'), null)])
    for (const secret of ['Shopify', 'Marc-André', 'https://x/p.jpg', 'Lefebvre']) expect(out).not.toContain(secret)
  })
})

describe('parseLens (the server’s shape, validated)', () => {
  it('reads a lens', () => {
    expect(parseLens({ key: 'work', question: 'What are you working on?' })).toEqual({ key: 'work', question: 'What are you working on?' })
    expect(parseLens({ key: 'venue_night', question: null })).toEqual({ key: 'venue_night', question: null })
  })
  it('anything else is no lens', () => {
    for (const bad of [null, undefined, 'work', { key: 3 }, { key: '' }, { question: 'x' }]) expect(parseLens(bad)).toBeNull()
    expect(parseLens({ key: 'work', question: '  ' })).toEqual({ key: 'work', question: null })
  })
})

describe('lensView (what the sheet draws)', () => {
  it('puts the deck’s card through the lens, and nothing else', () => {
    const view = lensView({ ...person, age: 31, tonightAnswer: 'A map of quiet cafés' }, lens('work', 'What are you working on?'), { title: 'Junction Tech Mixer' }, false)
    expect(view).toEqual({
      context: 'In the room at Junction Tech Mixer',
      meta: 'Anonymous · 31',
      lead: leadFor(person, lens('work')),
      tonight: { question: 'What are you working on?', answer: 'A map of quiet cafés' },
      common: { label: 'In common', items: person.interests },
      openers: null,
      ask: null,
    })
  })
  it('state 2 B: an unanswered question is yours to ask, once they are shown to you; never while anonymous, never once answered', () => {
    const work = lens('work', 'What are you working on?')
    expect(lensView({ ...person, age: 31, tonightAnswer: null }, work, null, true).ask).toBe('What are you working on?')
    expect(lensView({ ...person, age: 31, tonightAnswer: null }, work, null, false).ask).toBeNull()
    expect(lensView({ ...person, age: 31, tonightAnswer: 'Maps' }, work, null, true).ask).toBeNull()
    expect(lensView({ ...person, age: 31, tonightAnswer: null }, lens('venue_night', null), null, true).ask).toBeNull()
  })
})

describe('state 1 A (SCRUM-1042): how long they have been here, and the venue night openers', () => {
  const at = Date.parse('2026-11-12T20:00:00Z')
  const ago = (min: number) => new Date(at - min * 60_000).toISOString()
  it('says the time here as the board does: minutes, then hours with two-digit minutes, capped at 3h+', () => {
    expect(hereFor(ago(0.5), at)).toBe('Just got here')
    expect(hereFor(ago(40), at)).toBe('Here 40 min')
    expect(hereFor(ago(125), at)).toBe('Here 2h 05m')
    expect(hereFor(ago(120), at)).toBe('Here 2h')
    expect(hereFor(ago(181), at)).toBe('Here 3h+')
  })
  it('says nothing for no time, a bad one, or one in the future', () => {
    expect(hereFor(null, at)).toBeNull()
    expect(hereFor('not a date', at)).toBeNull()
    expect(hereFor(new Date(at + 5 * 60_000).toISOString(), at)).toBe('Just got here')
  })
  it('joins the meta line after the age', () => {
    expect(metaLine(false, 31, 'Here 40 min')).toBe('Anonymous · 31 · Here 40 min')
    expect(metaLine(false, 31, null)).toBe('Anonymous · 31')
  })
  it('offers the three openers on a venue night only (control: any other lens, or none)', () => {
    expect(VENUE_OPENERS).toEqual(['First time here?', 'What’s good here?', 'Who are you here with?'])
    expect(openersFor({ key: 'venue_night', question: null })).toBe(VENUE_OPENERS)
    expect(openersFor({ key: 'work', question: 'What are you working on?' })).toBeNull()
    expect(openersFor(null)).toBeNull()
  })
})
