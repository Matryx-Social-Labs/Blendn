/*
 * What an event or a venue says when shared (Flow 16 · 16.1/16.2): the fields, the exact message, and what an unlisted
 * event is never allowed to carry.
 */
import { dateParts, eventTarget, shareEventOf, shareText, shareUrl, venueTarget } from '../lib/shareEvent'

const ID = '7f3a2c4e-91d0-4b8a-a1c2-0d5e6f7a8b9c'
// 4 Oct 2026, 21:00 in the machine's own time: the card shows the device's day and hour.
const START = new Date(2026, 9, 4, 21, 0, 0).toISOString()
const NEON = { id: ID, title: 'Neon Nights', startTime: START, venueName: 'Toit', city: 'Indiranagar', coverImageUrl: 'https://img/c.jpg', status: 'published', visibility: 'public' }

describe('the date', () => {
  it('prints the stack and the line in fixed English names, with minutes on the stack and none on the hour in the line', () => {
    expect(dateParts(START)).toEqual({
      date: { day: 'SUN', num: '04', month: 'OCT', time: '9:00 PM' },
      dateText: 'Sun 4 Oct, 9 PM',
    })
  })

  it('says nothing for a date it cannot read', () => {
    expect(dateParts(undefined).dateText).toBeUndefined()
    expect(dateParts('not a date').date.num).toBe('')
  })
})

describe('the shareable event', () => {
  it('carries the title, the date, the place, the cover and the /event/ link, and nothing live or personal', () => {
    const e = shareEventOf(NEON)!
    expect(e).toMatchObject({ title: 'Neon Nights', venue: 'Toit', area: 'Indiranagar', cover: 'https://img/c.jpg', url: `https://www.blendn.app/event/${ID}`, cancelled: false, unlisted: false })
    expect(Object.keys(e).sort()).toEqual(['area', 'cancelled', 'cover', 'date', 'dateText', 'title', 'unlisted', 'url', 'venue'])
  })

  it('never carries the venue of an unlisted event, so nothing downstream can print it', () => {
    const e = shareEventOf({ ...NEON, visibility: 'unlisted' })!
    expect(e.unlisted).toBe(true)
    expect(e.venue).toBe('')
    expect(JSON.stringify(e)).not.toContain('Toit')
  })

  it('names the area, not the city, for an unlisted event; the city only when no area was sent (ROOM-17)', () => {
    const base = { ...NEON, visibility: 'unlisted', city: 'Bengaluru' }
    expect(shareEventOf({ ...base, area: 'Indiranagar' })!.area).toBe('Indiranagar')
    expect(shareEventOf(base)!.area).toBe('Bengaluru')
  })

  it('is null for a private event, a draft, and a row that does not say (the tray asks the event first)', () => {
    expect(shareEventOf({ ...NEON, visibility: 'private' })).toBeNull()
    expect(shareEventOf({ ...NEON, status: 'draft' })).toBeNull()
    expect(shareEventOf({ ...NEON, visibility: undefined })).toBeNull()
    expect(eventTarget({ ...NEON, visibility: 'private' })).toBeNull()
  })

  it('marks a cancelled event, and treats an empty cover as none so the typographic card is drawn', () => {
    expect(shareEventOf({ ...NEON, status: 'cancelled' })!.cancelled).toBe(true)
    expect(shareEventOf({ ...NEON, coverImageUrl: '' })!.cover).toBeNull()
  })

  it('reads the snake_case row the Scene holds as well as the API item', () => {
    const e = shareEventOf({ id: ID, title: 'Neon Nights', start_time: START, venue_name: 'Toit', city: 'Indiranagar', cover_image_url: 'https://img/c.jpg', status: 'published', visibility: 'public' })!
    expect(e.venue).toBe('Toit')
    expect(e.cover).toBe('https://img/c.jpg')
  })
})

describe('the message that goes with the link', () => {
  it('is the title and date, the place, then the link', () => {
    expect(shareText(eventTarget(NEON)!)).toBe(`Neon Nights · Sun 4 Oct, 9 PM\nToit, Indiranagar\nhttps://www.blendn.app/event/${ID}`)
  })

  it('names the area only for an unlisted event: no venue, no street', () => {
    const text = shareText(eventTarget({ ...NEON, visibility: 'unlisted', address: '298, 100 Feet Rd' } as never)!)
    expect(text).toBe(`Neon Nights · Sun 4 Oct, 9 PM\nIndiranagar\nhttps://www.blendn.app/event/${ID}`)
    expect(text).not.toMatch(/Toit|Feet/)
  })

  it('has no dangling comma for a venue with no area, and no separator for a missing date', () => {
    const t = eventTarget({ ...NEON, city: '', startTime: undefined })!
    expect(shareText(t)).toBe(`Neon Nights\nToit\nhttps://www.blendn.app/event/${ID}`)
  })

  it('shares a venue by name and the front-page link, and an invite as the short ask with no name in it', () => {
    const venue = venueTarget({ id: ID, name: 'Toit', venueTypeLabel: 'Brewery', city: 'Indiranagar' })
    expect(shareText(venue)).toBe('Toit on Blend’n\nhttps://www.blendn.app')
    expect(shareText({ kind: 'invite', url: 'https://www.blendn.app/f/abc' })).toBe('Add me on Blend’n: https://www.blendn.app/f/abc')
  })

  it('copies the link alone', () => {
    expect(shareUrl(eventTarget(NEON)!)).toBe(`https://www.blendn.app/event/${ID}`)
    expect(shareUrl({ kind: 'invite', url: 'https://www.blendn.app/f/abc' })).toBe('https://www.blendn.app/f/abc')
  })

  it('a venue with no city still has an area string, empty, never null', () => {
    expect(venueTarget({ id: ID, name: 'Toit', venueTypeLabel: 'Brewery', city: null })).toMatchObject({ area: '' })
  })
})

// D24 (C38): a shared place says what a guest reads. Negative control: the raw `venueTypeLabel` fails.
it('venueTarget names a place of type other "Venue", and keeps every other type’s label', () => {
  const venue = { id: 'v1', name: 'Hall 3', venueType: 'other', venueTypeLabel: 'Something else', city: 'Bengaluru' }
  expect(venueTarget(venue)).toMatchObject({ typeLabel: 'Venue' })
  expect(venueTarget({ ...venue, venueType: 'brewery', venueTypeLabel: 'Brewery' })).toMatchObject({ typeLabel: 'Brewery' })
})

it('the event page maps the detail route’s area and hands it to the share (ROOM-17)', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'components', 'screens', 'EventDetailScreen.tsx'), 'utf8')
  expect(src).toContain('area: (d as { area?: string | null }).area')
  expect(src).toContain('area: event.area,')
})
