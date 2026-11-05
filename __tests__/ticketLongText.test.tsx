/**
 * The ticketing screens' long-text audit (owner, 2026-11-05): ticket type names, prices, the venue and the event title, at
 * their worst (`WORST`), bounded the way the ticketing board says, with no row able to push one over a sibling.
 *
 * Board (mockups/redesign-2026-11/ticketing): type names and the dock's "From" price wrap; the checkout's "{title} · {when}"
 * line is one line, cut (`.ts.ell`); the pass's title is one line, cut (`.heading.ell`); the money is never cut.
 */
import { act, render, screen } from '@testing-library/react-native'

jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
jest.mock('../lib/apiClient', () => ({
  apiClient: { getTicketQuote: jest.fn(async () => ({ success: false })), createTicketOrder: jest.fn(), getTicketOrder: jest.fn(), releaseTicketOrder: jest.fn() },
}))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))

/* eslint-disable import/first */
import { MomentPour } from '../components/ds/MomentPour'
import { CheckoutSheet } from '../components/tickets/CheckoutSheet'
import { TicketDock, useEventTickets, type TicketPageEvent } from '../components/tickets/EventTickets'
import { TicketPass } from '../components/tickets/TicketPass'
import { resetModalTurns } from '../lib/modalTurn'
import { formatMoney, type EventTicketing, type TicketType } from '../lib/ticketing'
import { AX_XXXL, atScale, resetScale } from './helpers/ax'
import { rowThatOverflows, slotOf, WORST } from './helpers/longText'
/* eslint-enable import/first */

const hidden = { includeHiddenElements: true }
const text = (s: string | RegExp) => screen.getByText(s, hidden) as never

const type = (over: Partial<TicketType> = {}): TicketType => ({
  id: 't1',
  name: WORST.ticketType,
  description: null,
  priceMinor: WORST.cadMinor,
  status: 'on_sale',
  remaining: 6,
  salesStartAt: null,
  salesEndAt: null,
  maxPerOrder: 10,
  ...over,
})
const ticketing = (currency: 'CAD' | 'INR'): EventTicketing => ({
  mode: 'native',
  currency,
  fromMinor: currency === 'CAD' ? WORST.cadMinor : WORST.inrMinor,
  feesAbsorbed: false,
  refundPolicy: 'until_24h',
  types: [type({ priceMinor: currency === 'CAD' ? WORST.cadMinor : WORST.inrMinor })],
  mine: null,
})
const event: TicketPageEvent = { id: 'e1', title: WORST.eventTitle, startTime: '2026-11-08T12:30:00Z', timezone: 'Asia/Kolkata', venueName: WORST.venue }

beforeEach(() => resetModalTurns())
afterEach(() => resetScale())

function Page({ t }: { t: EventTicketing }) {
  const { section, dock } = useEventTickets({ event, ticketing: t, onStale: () => {} })
  return (
    <>
      {section}
      {dock ? <TicketDock model={dock} rsvp={null} saved={false} onSave={() => {}} /> : null}
    </>
  )
}

describe.each(['CAD', 'INR'] as const)('the event page in %s', (currency) => {
  const price = currency === 'CAD' ? WORST.cad : WORST.inr

  it('the fixture prices are what the app prints', () => {
    expect(formatMoney(currency === 'CAD' ? WORST.cadMinor : WORST.inrMinor, currency)).toBe(price)
  })

  it('a long type name wraps whole beside its price, and the price is never squeezed or cut', async () => {
    await render(<Page t={ticketing(currency)} />)
    const name = text(WORST.ticketType)
    expect(slotOf(name).lines).toBeUndefined()
    expect(rowThatOverflows(name)).toBeNull()
    const shown = screen.getAllByText(price, hidden)[0] as never
    expect(slotOf(shown).lines).toBeUndefined()
  })

  it('the dock’s "From" price wraps rather than runs under Get tickets, at the largest text size too', async () => {
    await atScale(AX_XXXL)
    await render(<Page t={ticketing(currency)} />)
    const from = text(`From ${price}`)
    expect(slotOf(from).lines).toBeUndefined()
    expect(rowThatOverflows(from)).toBeNull()
  })
})

describe('checkout', () => {
  it('the title is cut to one line and the date keeps its own slot, so a long title never takes the date', async () => {
    await render(<CheckoutSheet visible onClose={() => {}} event={event} ticketing={ticketing('CAD') as never} initialTypeId="t1" onPaid={() => {}} onStale={() => {}} />)
    await act(async () => {})
    const title = text(WORST.eventTitle)
    expect(slotOf(title)).toEqual({ lines: 1, ellipsize: 'tail' })
    expect(rowThatOverflows(title)).toBeNull()
    // The date is its own Text beside it, and does not give way.
    const when = text(/^· Sun 8 Nov, 6 PM/)
    expect(slotOf(when).lines).toBe(1)
  })
})

describe('the pass', () => {
  const ticket = { ticketId: 'k1', orderId: 'o1', eventId: 'e1', typeName: WORST.ticketType, doorCode: 'K7Q2XM', qrPayload: 'k1.mac', redeemedAt: null }
  const passEvent = { title: WORST.eventTitle, startTime: event.startTime, timezone: event.timezone, venueName: WORST.venue }

  it('the title is one line, cut, as the board draws it; read whole', async () => {
    await render(<TicketPass ticket={ticket} index={0} total={2} event={passEvent} qrSize={232} />)
    const title = text(WORST.eventTitle)
    expect(slotOf(title)).toEqual({ lines: 1, ellipsize: 'tail' })
    expect(rowThatOverflows(title)).toBeNull()
    expect(screen.getByLabelText(new RegExp(WORST.eventTitle), hidden)).toBeTruthy()
  })

  it('the type name and the venue wrap whole', async () => {
    await render(<TicketPass ticket={ticket} index={0} total={2} event={passEvent} qrSize={232} />)
    expect(slotOf(text(new RegExp(`^${WORST.ticketType}`))).lines).toBeUndefined()
    expect(slotOf(text(WORST.venue)).lines).toBeUndefined()
  })
})

describe('the paid moment', () => {
  it('"Paid · {total}" may take a second line, so the largest text size never cuts the money', async () => {
    await render(<MomentPour testID="m" venue={`Paid · ${WORST.cad}`} headline="You’re going" onDone={() => {}} />)
    expect(slotOf(screen.getByTestId('m-venue', hidden) as never).lines).toBe(2)
  })
})
