/**
 * Ticketing's pure rules (contract: blendn-admin `.context/plans/ticketing-api-contract.md`, SCRUM-1007 Phase 3): money in the
 * event's currency, the `ticketing` payload read at the boundary, a type's row words, the stepper's cap, the refund line,
 * every refusal said plainly, and the order poll's three endings.
 */
import {
  formatMoney,
  parseTicketing,
  pollOrder,
  refundLine,
  refusalCopy,
  spokenMoney,
  stepperMax,
  ticketDockState,
  ticketEventOf,
  ticketRefusal,
  TICKET_REFUSAL_CODES,
  typeRow,
  type EventTicketing,
  type NativeTicketing,
  type TicketOrderStatus,
  type TicketType,
} from '../lib/ticketing'
import { refreshPhoneZone } from '../lib/time'
import { userMessage } from '../lib/userMessage'

// The phone is in the event's zone, so no zone name is added to a clock ("6 PM", not "6 PM IST").
beforeAll(() => {
  process.env.TZ = 'Asia/Kolkata'
  refreshPhoneZone()
})

const type = (over: Partial<TicketType> = {}): TicketType => ({
  id: 't1',
  name: 'Early bird',
  description: null,
  priceMinor: 49_900,
  status: 'on_sale',
  remaining: null,
  salesStartAt: null,
  salesEndAt: null,
  maxPerOrder: 10,
  ...over,
})

describe('money', () => {
  it('says rupees with Indian grouping and no hard-coded symbol: the currency decides', () => {
    expect(formatMoney(49_900, 'INR')).toBe('₹499')
    expect(formatMoney(3_759_726_00, 'INR')).toBe('₹37,59,726')
    expect(formatMoney(108_182, 'INR')).toBe('₹1,081.82')
    expect(formatMoney(1_500, 'CAD')).toBe('CA$15')
    expect(formatMoney(375_972_600, 'CAD')).toBe('CA$3,759,726')
  })

  it('a bill keeps its paise: exact always shows the minor digits', () => {
    expect(formatMoney(99_800, 'INR', { exact: true })).toBe('₹998.00')
    expect(formatMoney(4_990, 'INR', { exact: true })).toBe('₹49.90')
  })

  it('is spoken as words, not a symbol', () => {
    expect(spokenMoney(49_900, 'INR')).toMatch(/^499 Indian rupees$/)
    expect(spokenMoney(1_500, 'CAD')).toMatch(/^15 Canadian dollars$/)
  })
})

describe('the ticketing payload, read at the boundary', () => {
  it('null, absent or nonsense is no ticketing: the free page is unchanged', () => {
    expect(parseTicketing(null)).toBeNull()
    expect(parseTicketing(undefined)).toBeNull()
    expect(parseTicketing({ mode: 'wallet' })).toBeNull()
    expect(parseTicketing('native')).toBeNull()
  })

  it('external needs an https link; anything else is dropped rather than opened', () => {
    expect(parseTicketing({ mode: 'external', externalUrl: 'http://eventbrite.ca/e/1', externalSite: 'eventbrite.ca' })).toBeNull()
    expect(parseTicketing({ mode: 'external', externalUrl: 'javascript:alert(1)' })).toBeNull()
    const ok = parseTicketing({ mode: 'external', externalUrl: 'https://www.eventbrite.ca/e/1', externalSite: 'eventbrite.ca' })
    expect(ok).toEqual(expect.objectContaining({ mode: 'external', externalUrl: 'https://www.eventbrite.ca/e/1', externalSite: 'eventbrite.ca' }))
  })

  it('the site named is always the link’s own host: a payload naming another site cannot spoof the row (security review)', () => {
    const t = parseTicketing({ mode: 'external', externalUrl: 'https://evil.example/e/1', externalSite: 'eventbrite.ca' })
    expect(t).toEqual(expect.objectContaining({ externalSite: 'evil.example', externalUrl: 'https://evil.example/e/1' }))
    // A display name that is not a host is ignored too.
    expect(parseTicketing({ mode: 'external', externalUrl: 'https://www.eventbrite.ca/e/1', externalSite: 'Eventbrite' })).toEqual(
      expect.objectContaining({ externalSite: 'eventbrite.ca' })
    )
    // The host is the named site or a subdomain of it: the name is kept.
    expect(parseTicketing({ mode: 'external', externalUrl: 'https://tickets.showpass.com/x', externalSite: 'showpass.com' })).toEqual(
      expect.objectContaining({ externalSite: 'showpass.com' })
    )
    // A subdomain named over its parent's link is not the link's host.
    expect(parseTicketing({ mode: 'external', externalUrl: 'https://showpass.com/x', externalSite: 'tickets.showpass.com' })).toEqual(
      expect.objectContaining({ externalSite: 'showpass.com' })
    )
  })

  it('www. is stripped from the host it says', () => {
    expect(parseTicketing({ mode: 'external', externalUrl: 'https://www.eventbrite.ca/e/1', externalSite: 'www.eventbrite.ca' })).toEqual(
      expect.objectContaining({ externalSite: 'eventbrite.ca' })
    )
  })

  it('external with no site name says the link’s own host', () => {
    expect(parseTicketing({ mode: 'external', externalUrl: 'https://www.showpass.com/x' })).toEqual(expect.objectContaining({ externalSite: 'showpass.com' }))
  })

  it('native keeps only well-formed types, in the server’s order, and needs a currency', () => {
    expect(parseTicketing({ mode: 'native', types: [type()] })).toBeNull()
    const t = parseTicketing({
      mode: 'native',
      currency: 'INR',
      fromMinor: 49_900,
      feesAbsorbed: false,
      refundPolicy: 'until_24h',
      types: [type(), { id: 'bad' }, type({ id: 't2', name: 'General' })],
      mine: null,
    }) as NativeTicketing
    expect(t.types.map((x) => x.id)).toEqual(['t1', 't2'])
    expect(t.mine).toBeNull()
  })
})

describe('a type’s row', () => {
  const now = Date.parse('2026-11-02T10:00:00Z')

  it('on sale with a few left: amber "6 left", the sales end, buyable', () => {
    const r = typeRow(type({ remaining: 6, salesEndAt: '2026-11-04T18:00:00Z' }), 'Asia/Kolkata', now)
    expect(r).toEqual(expect.objectContaining({ left: '6 left', buyable: true, soldOut: false }))
    expect(r.note).toBe('Sales end Wed 4 Nov')
  })

  it('sold out is struck and not a button', () => {
    expect(typeRow(type({ status: 'sold_out' }), undefined, now)).toEqual(expect.objectContaining({ soldOut: true, buyable: false, note: 'Sold out' }))
  })

  it('not started says when; ended says so; neither is buyable', () => {
    expect(typeRow(type({ status: 'not_started', salesStartAt: '2026-11-05T04:30:00Z' }), 'Asia/Kolkata', now)).toEqual(
      expect.objectContaining({ buyable: false, note: 'Sales start Thu 5 Nov, 10 AM' })
    )
    expect(typeRow(type({ status: 'ended' }), undefined, now)).toEqual(expect.objectContaining({ buyable: false, note: 'Sales ended' }))
  })

  it('the stepper stops at the order limit and at what is left, whichever comes first', () => {
    expect(stepperMax(type({ maxPerOrder: 10, remaining: 3 }))).toBe(3)
    expect(stepperMax(type({ maxPerOrder: 4, remaining: null }))).toBe(4)
    expect(stepperMax(type({ status: 'sold_out' }))).toBe(0)
  })
})

describe('the refund line', () => {
  const start = '2026-11-08T12:30:00Z'
  it('names the last moment, in the event’s zone, and the fee rule', () => {
    expect(refundLine('until_24h', start, 'Asia/Kolkata')).toBe('Refunds until Sat 7 Nov, 6 PM. The booking fee isn’t refunded, unless the event is canceled.')
    expect(refundLine('until_7d', start, 'Asia/Kolkata')).toMatch(/^Refunds until Sun 1 Nov, 6 PM\./)
    expect(refundLine('none', start, 'Asia/Kolkata')).toBe('No refunds, unless the event is canceled.')
  })
})

describe('refusals', () => {
  it('every code the contract names has its own plain sentence, never the server’s prose or a code', () => {
    const lines = TICKET_REFUSAL_CODES.map((c) => refusalCopy(c))
    expect(new Set(lines).size).toBe(TICKET_REFUSAL_CODES.length)
    for (const l of lines) {
      expect(l).not.toMatch(/_/)
      expect(l.length).toBeGreaterThan(10)
    }
    expect(refusalCopy('sold_out')).toMatch(/sold out/i)
    expect(refusalCopy('age')).toMatch(/18/)
  })
  it('reads the server’s uppercase codes too, and has a sentence for one it does not know', () => {
    expect(refusalCopy('SOLD_OUT')).toBe(refusalCopy('sold_out'))
    expect(refusalCopy('something_new')).toBe('That didn’t go through. Try again.')
    expect(refusalCopy(undefined)).toBe('That didn’t go through. Try again.')
  })
})

describe('the dock', () => {
  const native = (over: Partial<NativeTicketing> = {}): NativeTicketing => ({
    mode: 'native',
    currency: 'INR',
    fromMinor: 49_900,
    feesAbsorbed: false,
    refundPolicy: 'none',
    types: [type()],
    mine: null,
    ...over,
  })
  it('sells while anything is on sale, shows the ticket once bought, and offers Save when nothing is', () => {
    expect(ticketDockState(native())).toBe('buy')
    expect(ticketDockState(native({ mine: { ticketCount: 2, orderIds: ['o1'] } }))).toBe('mine')
    expect(ticketDockState(native({ types: [type({ status: 'sold_out' })] }))).toBe('soldOut')
    expect(ticketDockState(native({ types: [type({ status: 'not_started' })] }))).toBe('closed')
    expect(ticketDockState({ mode: 'external', externalUrl: 'https://x.ca', externalSite: 'x.ca' } as EventTicketing)).toBe('external')
  })
})

describe('polling the order (§4: every 1.5 s, up to 30 s)', () => {
  const order = (status: string, over: object = {}) => ({ success: true, data: { orderId: 'o1', eventId: 'e1', status, holdExpiresAt: '', totalMinor: 1, currency: 'INR', tickets: [], ...over } })
  const run = (answers: (ReturnType<typeof order> | { success: false })[]) => {
    const get = jest.fn()
    answers.forEach((a) => get.mockResolvedValueOnce(a))
    get.mockResolvedValue(answers[answers.length - 1])
    const waits: number[] = []
    let clock = 0
    const result = pollOrder('o1', {
      get,
      now: () => clock,
      sleep: async (ms) => {
        waits.push(ms)
        clock += ms
      },
    })
    return { get, waits, result }
  }

  it('stops at paid and hands back the order with its tickets', async () => {
    const { get, waits, result } = run([order('pending'), order('pending'), order('paid', { tickets: [{ ticketId: 'k' }] })])
    await expect(result).resolves.toEqual(expect.objectContaining({ kind: 'paid' }))
    expect(get).toHaveBeenCalledTimes(3)
    expect(waits).toEqual([1500, 1500])
  })

  it('stops at expired', async () => {
    const { result } = run([order('pending'), order('expired')])
    await expect(result).resolves.toEqual(expect.objectContaining({ kind: 'expired' }))
  })

  it('a failed payment the server recorded ends it at once, with the hold still running', async () => {
    const { result, get } = run([order('pending', { paymentFailed: true })])
    await expect(result).resolves.toEqual(expect.objectContaining({ kind: 'failed' }))
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('gives up after 30 s of pending (and of failed reads) as "still confirming"', async () => {
    const { result, get } = run([order('pending'), { success: false }, order('pending')])
    await expect(result).resolves.toEqual({ kind: 'timeout' })
    expect(get.mock.calls.length).toBe(21)
  })

  it('stops quietly when the caller has gone', async () => {
    let gone = false
    const get = jest.fn(async () => {
      gone = true
      return order('pending') as { success: boolean; data?: TicketOrderStatus }
    })
    await expect(pollOrder('o1', { get, cancelled: () => gone, sleep: async () => {} })).resolves.toEqual({ kind: 'cancelled' })
  })
})

describe('a refusal from the quote or the order, read as the RSVP’s door reads it (contract §9.7)', () => {
  it('an under-age buyer is the 403 AGE_RESTRICTED: the RSVP’s 18+ words, no fix', () => {
    const r = ticketRefusal({ errorCode: 'AGE_RESTRICTED', reasonCode: 'AGE_RESTRICTED', error: 'This event is 21+' })
    expect(r).toEqual({ copy: 'This event is 18+. Blend’n events are for adults.', stale: false })
  })
  it('an age not on file and an unfinished profile can be fixed, and say how', () => {
    expect(ticketRefusal({ errorCode: 'AGE_RESTRICTED', reasonCode: 'AGE_UNKNOWN' })).toEqual({
      copy: 'Events on Blend’n are 18+. Add your date of birth once; nobody else ever sees it.',
      stale: false,
      fix: 'Add your age',
    })
    expect(ticketRefusal({ errorCode: 'FORBIDDEN', reasonCode: 'PROFILE_INCOMPLETE' })).toEqual({
      copy: 'Finish your profile first: add a name and a photo.',
      stale: false,
      fix: 'Finish my profile',
    })
  })
  it('an event that is gone (404) or lines that no longer fit (400) send the page back to read it again', () => {
    expect(ticketRefusal({ errorCode: 'NOT_FOUND', error: 'Event not found' })).toEqual({ copy: 'This event isn’t available any more.', stale: true })
    expect(ticketRefusal({ errorCode: 'VALIDATION_FAILED' })).toEqual({ copy: 'That ticket type changed. Pick again.', stale: true })
  })
  it('payments down (503) says nothing was charged; too many tries says to wait', () => {
    expect(ticketRefusal({ errorCode: 'SERVER_ERROR', error: 'Payments are not available right now' }).copy).toBe(
      'Tickets can’t be bought right now. Nothing was charged. Try again in a few minutes.'
    )
    expect(ticketRefusal({ errorCode: 'RATE_LIMITED', error: 'Slow down: try again in 30 seconds.' }).copy).toBe('Slow down: try again in 30 seconds.')
  })
  it('the contract’s own codes keep their words; the old 409 age stays as a backstop', () => {
    expect(ticketRefusal({ errorCode: 'sold_out' })).toEqual({ copy: refusalCopy('sold_out'), stale: true })
    expect(ticketRefusal({ errorCode: 'age' }).copy).toBe(refusalCopy('age'))
    expect(ticketRefusal({ errorCode: 'too_many_holds' }).stale).toBe(false)
  })
})

describe('the event a ticket carries (§8.4)', () => {
  it('is the pass’s words, in the cache’s shape', () => {
    const event = { id: 'e1', title: 'Rooftop', startsAt: '2026-11-08T12:30:00Z', endsAt: '2026-11-08T17:30:00Z', timezone: 'Asia/Kolkata', venueName: 'High', coverUrl: 'https://x/c.jpg' }
    expect(ticketEventOf({ event })).toEqual({ title: 'Rooftop', startTime: '2026-11-08T12:30:00Z', timezone: 'Asia/Kolkata', venueName: 'High', coverImageUrl: 'https://x/c.jpg' })
  })
  it('none, or one without a title or start, is nothing (the remembered copy stands)', () => {
    expect(ticketEventOf({})).toBeNull()
    expect(ticketEventOf({ event: { title: 'x' } as never })).toBeNull()
  })
})

it('the RSVP refused as ticketed is said in the server’s words wherever an RSVP is sent (the room’s I’m going too)', () => {
  expect(userMessage({ errorCode: 'tickets_required', error: 'This event is ticketed: get a ticket to go.' }, 'Couldn’t save your RSVP. Try again.')).toBe(
    'This event is ticketed: get a ticket to go.'
  )
})
