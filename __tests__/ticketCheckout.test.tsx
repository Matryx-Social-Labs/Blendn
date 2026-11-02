/**
 * The checkout sheet (checkout A, contract §2–§5): steppers capped by the order limit and what is left, one quote 250 ms after
 * the last step, the booking fee's three parts and the total before Pay, refusals in plain words, Pay → the hold → the
 * browser → the poll, and the sheet's three endings: paid, the hold ran out, still confirming.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import * as WebBrowser from 'expo-web-browser'

jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
jest.mock('../lib/apiClient', () => ({
  apiClient: { getTicketQuote: jest.fn(), createTicketOrder: jest.fn(), getTicketOrder: jest.fn() },
}))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))

/* eslint-disable import/first */
import { CheckoutSheet } from '../components/tickets/CheckoutSheet'
import { apiClient } from '../lib/apiClient'
import { resetModalTurns } from '../lib/modalTurn'
import { readTicketCache } from '../lib/ticketCache'
import type { EventTicketing, TicketType } from '../lib/ticketing'
import { refreshPhoneZone } from '../lib/time'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>
const openBrowser = WebBrowser.openBrowserAsync as jest.Mock

const type = (over: Partial<TicketType> = {}): TicketType => ({
  id: 't1',
  name: 'Early bird',
  description: null,
  priceMinor: 49_900,
  status: 'on_sale',
  remaining: 3,
  salesStartAt: null,
  salesEndAt: null,
  maxPerOrder: 10,
  ...over,
})
const ticketing: EventTicketing = {
  mode: 'native',
  currency: 'INR',
  fromMinor: 49_900,
  feesAbsorbed: false,
  refundPolicy: 'until_24h',
  types: [type(), type({ id: 't2', name: 'General', priceMinor: 79_900, remaining: null }), type({ id: 't3', name: 'Couple', status: 'sold_out' })],
  mine: null,
}
const event = { id: 'e1', title: 'Rooftop Sundowner', startTime: '2026-11-08T12:30:00Z', timezone: 'Asia/Kolkata' }
const quote = (qty: number) => ({
  success: true,
  data: {
    currency: 'INR',
    subtotalMinor: 49_900 * qty,
    bookingFeeMinor: 4_191 * qty,
    totalMinor: 54_091 * qty,
    feeParts: { serviceMinor: 2_495 * qty, taxMinor: 449 * qty, processingMinor: 1_247 * qty },
    lines: [{ typeId: 't1', quantity: qty, unitMinor: 49_900 }],
  },
})
const hold = (inMs = 600_000) => new Date(Date.now() + inMs).toISOString()
const created = () => ({ success: true, data: { orderId: 'o1', status: 'pending', totalMinor: 108_182, currency: 'INR', holdExpiresAt: hold(), payUrl: 'https://pay.blendn.app/o/o1?t=tok' } })
const status = (s: string, over: object = {}) => ({ success: true, data: { orderId: 'o1', eventId: 'e1', status: s, holdExpiresAt: hold(), totalMinor: 108_182, currency: 'INR', tickets: [], ...over } })

const onPaid = jest.fn()
const onStale = jest.fn()
const open = async (initialTypeId: string | null = 't1') => {
  await render(<CheckoutSheet visible onClose={jest.fn()} event={event} ticketing={ticketing} initialTypeId={initialTypeId} onPaid={onPaid} onStale={onStale} />)
  await act(async () => {})
}
const settle = async (ms = 250) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms)
  })
}

beforeAll(() => {
  process.env.TZ = 'Asia/Kolkata'
  refreshPhoneZone()
})
beforeEach(() => {
  // The in-app browser holds the screen's one Modal turn, released on a timer; a test that ends mid-hold must not pass it on.
  resetModalTurns()
  jest.useFakeTimers({ now: Date.parse('2026-11-02T10:00:00Z') })
  jest.clearAllMocks()
  api.getTicketQuote.mockImplementation(async (_e: string, lines: { quantity: number }[]) => quote(lines.reduce((n, l) => n + l.quantity, 0)) as never)
  openBrowser.mockResolvedValue({ type: 'cancel' })
})
afterEach(() => {
  jest.useRealTimers()
})

describe('picking', () => {
  it('opens with the tapped type at 1, every on-sale type a stepper, a sold-out one only said', async () => {
    await open()
    expect(screen.getByTestId('checkout-step-t1').props.accessibilityValue.now).toBe(1)
    expect(screen.getByTestId('checkout-step-t2')).toBeTruthy()
    expect(screen.queryByTestId('checkout-step-t3')).toBeNull()
    expect(screen.getByText('Sold out')).toBeTruthy()
  })

  it('a stepper stops at what is left (3), below the order limit (10)', async () => {
    await open()
    const plus = screen.getByTestId('checkout-step-t1-plus', { includeHiddenElements: true })
    for (let i = 0; i < 5; i++) await fireEvent.press(plus)
    expect(screen.getByTestId('checkout-step-t1').props.accessibilityValue.now).toBe(3)
  })

  it('quotes once, 250 ms after the last step, not once per step', async () => {
    await open()
    await settle()
    expect(api.getTicketQuote).toHaveBeenCalledTimes(1)
    const plus = screen.getByTestId('checkout-step-t1-plus', { includeHiddenElements: true })
    await fireEvent.press(plus)
    await settle(100)
    await fireEvent.press(plus)
    await settle(100)
    expect(api.getTicketQuote).toHaveBeenCalledTimes(1)
    await settle(250)
    expect(api.getTicketQuote).toHaveBeenCalledTimes(2)
    expect(api.getTicketQuote).toHaveBeenLastCalledWith('e1', [{ typeId: 't1', quantity: 3 }])
  })

  it('shows the subtotal, the booking fee with its three parts and the total before Pay, and the refund line and terms', async () => {
    await open()
    await fireEvent.press(screen.getByTestId('checkout-step-t1-plus', { includeHiddenElements: true }))
    await settle()
    expect(screen.getByTestId('checkout-subtotal')).toHaveTextContent('₹998.00')
    expect(screen.getByTestId('checkout-fee')).toHaveTextContent('₹83.82')
    expect(screen.getByTestId('checkout-fee-parts')).toHaveTextContent('Blend’n service ₹49.90 · GST ₹8.98 · Payment processing ₹24.94')
    expect(screen.getByTestId('checkout-total')).toHaveTextContent('₹1,081.82')
    expect(screen.getByLabelText('Pay ₹1,081.82')).toBeTruthy()
    expect(screen.getByText('Refunds until Sat 7 Nov, 6 PM. The booking fee isn’t refunded, unless the event is canceled.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'terms of sale' })).toBeTruthy()
  })

  it('nothing picked: no quote is asked for and Pay is off', async () => {
    await open(null)
    await settle()
    expect(api.getTicketQuote).not.toHaveBeenCalled()
    expect(screen.getByTestId('checkout-pay').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }))
  })

  it('a refused quote is said in plain words, Pay is off, and the page is asked to read the counts again', async () => {
    api.getTicketQuote.mockResolvedValue({ success: false, errorCode: 'sold_out', error: 'TYPE_SOLD_OUT t1' } as never)
    await open()
    await settle()
    expect(screen.getByText('Those just sold out. Pick another ticket.')).toBeTruthy()
    expect(screen.queryByText(/TYPE_SOLD_OUT/)).toBeNull()
    expect(screen.getByTestId('checkout-pay').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }))
    expect(onStale).toHaveBeenCalled()
  })
})

describe('paying', () => {
  const pay = async () => {
    await open()
    await fireEvent.press(screen.getByTestId('checkout-step-t1-plus', { includeHiddenElements: true }))
    await settle()
    await fireEvent.press(screen.getByTestId('checkout-pay'))
    await settle(0)
  }

  it('creates the order, opens its pay page in the in-app browser, polls, and hands the paid order over with its tickets cached', async () => {
    api.createTicketOrder.mockResolvedValue(created() as never)
    const tickets = [{ ticketId: 'k1', orderId: 'o1', eventId: 'e1', typeName: 'Early bird', doorCode: 'K7Q2XM', qrPayload: 'k1.mac', redeemedAt: null }]
    api.getTicketOrder.mockResolvedValueOnce(status('pending') as never).mockResolvedValue(status('paid', { tickets }) as never)
    await pay()
    expect(api.createTicketOrder).toHaveBeenCalledWith('e1', [{ typeId: 't1', quantity: 2 }])
    expect(openBrowser).toHaveBeenCalledWith('https://pay.blendn.app/o/o1?t=tok', expect.anything())
    expect(screen.getByText('Confirming your payment')).toBeTruthy()
    await settle(1500)
    expect(onPaid).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'o1', status: 'paid' }))
    expect((await readTicketCache('me')).tickets.map((t) => t.ticketId)).toEqual(['k1'])
  })

  it('never opens a pay link that is not ours', async () => {
    api.createTicketOrder.mockResolvedValue({ ...created(), data: { ...created().data, payUrl: 'https://evil.example/o1' } } as never)
    await pay()
    expect(openBrowser).not.toHaveBeenCalled()
    expect(screen.getByText('That didn’t go through. Try again.')).toBeTruthy()
  })

  it('retries a busy hold after a second, twice at most', async () => {
    api.createTicketOrder.mockResolvedValue({ success: false, errorCode: 'busy' } as never)
    await pay()
    await settle(1000)
    await settle(1000)
    await settle(1000)
    expect(api.createTicketOrder).toHaveBeenCalledTimes(3)
    expect(screen.getByText('Lots of people are buying right now. Try again in a moment.')).toBeTruthy()
  })

  it('the hold ran out: said, the counts read again, and Pick again goes back to the steppers', async () => {
    api.createTicketOrder.mockResolvedValue(created() as never)
    api.getTicketOrder.mockResolvedValue(status('expired') as never)
    await pay()
    expect(await screen.findByText('Your hold ran out')).toBeTruthy()
    expect(onStale).toHaveBeenCalled()
    await fireEvent.press(screen.getByRole('button', { name: 'Pick again' }))
    expect(screen.getByTestId('checkout-step-t1')).toBeTruthy()
  })

  it('a failed payment says nothing was charged and how long the hold still runs, and Try again reopens the same page', async () => {
    api.createTicketOrder.mockResolvedValue(created() as never)
    api.getTicketOrder.mockResolvedValue(status('pending', { paymentFailed: true }) as never)
    await pay()
    expect(await screen.findByText('Payment didn’t go through')).toBeTruthy()
    expect(screen.getByText(/Nothing was charged\. Your 2 tickets are held for 10:00 more\./)).toBeTruthy()
    openBrowser.mockClear()
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    await settle(0)
    expect(openBrowser).toHaveBeenCalledWith('https://pay.blendn.app/o/o1?t=tok', expect.anything())
    expect(api.createTicketOrder).toHaveBeenCalledTimes(1)
  })

  it('30 s of pending is "Still confirming…" with a Refresh that asks again', async () => {
    api.createTicketOrder.mockResolvedValue(created() as never)
    api.getTicketOrder.mockResolvedValue(status('pending') as never)
    await pay()
    await settle(31_000)
    expect(screen.getByText('Still confirming…')).toBeTruthy()
    const asked = api.getTicketOrder.mock.calls.length
    api.getTicketOrder.mockResolvedValue(status('paid') as never)
    await fireEvent.press(screen.getByRole('button', { name: 'Refresh' }))
    await settle(0)
    expect(api.getTicketOrder.mock.calls.length).toBeGreaterThan(asked)
    expect(onPaid).toHaveBeenCalled()
  })

  it('a refused order is said plainly and nothing is opened', async () => {
    api.createTicketOrder.mockResolvedValue({ success: false, errorCode: 'too_many_holds' } as never)
    await pay()
    expect(screen.getByText('You already have tickets on hold. Finish paying for those first, or wait 10 minutes.')).toBeTruthy()
    expect(openBrowser).not.toHaveBeenCalled()
  })
})
