import { calendarDate, eventClock } from './time'

/*
 * Ticketing (SCRUM-1007 Phase 3), against the mobile contract in blendn-admin
 * `.context/plans/ticketing-api-contract.md` (v1, 2026-11-02). Money is integer
 * minor units plus an ISO currency, always; nothing here assumes rupees.
 */

export type TicketTypeStatus = 'on_sale' | 'sold_out' | 'not_started' | 'ended'
export type RefundPolicy = 'none' | 'until_7d' | 'until_24h'

/** §1: one type, as the event detail lists it (hidden types never arrive; sorted by position). */
export type TicketType = {
  id: string
  name: string
  description: string | null
  priceMinor: number
  status: TicketTypeStatus
  /** Only when 20 or fewer are left, else null: never "1,940 left". */
  remaining: number | null
  salesStartAt: string | null
  salesEndAt: string | null
  maxPerOrder: number
}

/** §1: `GET /events/:id` → `ticketing`, after `parseTicketing`. */
export type EventTicketing =
  | { mode: 'external'; externalUrl: string; externalSite: string }
  | {
      mode: 'native'
      currency: string
      fromMinor: number | null
      feesAbsorbed: boolean
      refundPolicy: RefundPolicy
      types: TicketType[]
      mine: { ticketCount: number; orderIds: string[] } | null
    }
export type NativeTicketing = Extract<EventTicketing, { mode: 'native' }>

export type TicketLine = { typeId: string; quantity: number }

/** §2: `POST /events/:id/ticket-quote`. */
export type TicketQuote = {
  currency: string
  subtotalMinor: number
  bookingFeeMinor: number
  totalMinor: number
  feeParts: { serviceMinor: number; taxMinor: number; processingMinor: number }
  lines: (TicketLine & { unitMinor: number })[]
}

/** §3: `POST /events/:id/ticket-orders` → 201. */
export type TicketOrder = { orderId: string; status: 'pending'; totalMinor: number; currency: string; holdExpiresAt: string; payUrl: string }

/** §6: one ticket. */
export type Ticket = {
  ticketId: string
  orderId: string
  eventId: string
  typeName: string
  /** 'K7Q2XM', shown 'K7Q 2XM'. */
  doorCode: string
  /** '<ticketId>.<mac>', derived on the server. */
  qrPayload: string
  redeemedAt: string | null
}

export type OrderStatus = 'pending' | 'paid' | 'expired' | 'refunded' | 'cancelled'

/** §5: `GET /ticket-orders/:id`. */
export type TicketOrderStatus = {
  orderId: string
  eventId: string
  status: OrderStatus
  holdExpiresAt: string
  totalMinor: number
  currency: string
  tickets: Ticket[]
  /**
   * Not in contract v1 (gap, proposed for Phase 2): the pay page saw the payment refused or its window dismissed, while the hold
   * still runs. Without it a pending order cannot be told from a slow webhook, and the poll says "Still confirming…".
   */
  paymentFailed?: boolean
}

/** §2 and §3's refusals (409, the envelope's `errorCode`). */
export const TICKET_REFUSAL_CODES = [
  'sold_out',
  'not_on_sale',
  'over_order_limit',
  'over_buyer_limit',
  'unknown_ticket_type',
  'age',
  'private',
  'busy',
  'too_many_holds',
] as const
export type TicketRefusal = (typeof TICKET_REFUSAL_CODES)[number]

const REFUSAL_COPY: Record<TicketRefusal, string> = {
  sold_out: 'Those just sold out. Pick another ticket.',
  not_on_sale: 'Those tickets aren’t on sale right now.',
  over_order_limit: 'That’s more than one order can hold. Pick fewer.',
  over_buyer_limit: 'You’ve reached the most tickets one person can buy for this event.',
  unknown_ticket_type: 'That ticket type changed. Pick again.',
  age: 'This event is 18+. Your profile needs to say you’re 18 or over.',
  private: 'This event is private. Only people it’s shared with can buy tickets.',
  busy: 'Lots of people are buying right now. Try again in a moment.',
  too_many_holds: 'You already have tickets on hold. Finish paying for those first, or wait 10 minutes.',
}
const REFUSAL_FALLBACK = 'That didn’t go through. Try again.'

/** A refusal in plain words; the server's prose and codes never reach the screen. Its codes are matched in either case. */
export function refusalCopy(code: string | undefined | null): string {
  const key = code?.toLowerCase() as TicketRefusal | undefined
  return (key && REFUSAL_COPY[key]) || REFUSAL_FALLBACK
}

/** The refusal's code from an `ApiResponse`, lower-cased: the envelope carries `errorCode` (and `reasonCode`), not `error.code`. */
export function refusalOf(result: { errorCode?: string; reasonCode?: string }): string | undefined {
  return (result.reasonCode ?? result.errorCode)?.toLowerCase()
}

/** Indian grouping for rupees (₹37,59,726); everything else in the en-US form, which says "CA$" rather than a bare "$". */
const localeFor = (currency: string) => (currency === 'INR' ? 'en-IN' : 'en-US')
const formatters = new Map<string, Intl.NumberFormat>()
function formatter(currency: string, key: 'exact' | 'whole' | 'name'): Intl.NumberFormat {
  const id = `${currency}:${key}`
  let f = formatters.get(id)
  if (!f) {
    f = new Intl.NumberFormat(localeFor(currency), {
      style: 'currency',
      currency,
      ...(key === 'name' ? { currencyDisplay: 'name' } : {}),
      ...(key === 'whole' ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
    })
    formatters.set(id, f)
  }
  return f
}
const minorDigits = (currency: string) => formatter(currency, 'exact').resolvedOptions().maximumFractionDigits ?? 2

/** Minor units in the event's currency: "₹499", "₹1,081.82", "CA$15". `exact`: a bill's line, always with its minor digits. */
export function formatMoney(minor: number, currency: string, { exact = false }: { exact?: boolean } = {}): string {
  const value = minor / 10 ** minorDigits(currency)
  return formatter(currency, !exact && Number.isInteger(value) ? 'whole' : 'exact').format(value)
}

/** For a screen reader: "499 Indian rupees", "1,081.82 Indian rupees", never "rupee sign". */
export function spokenMoney(minor: number, currency: string): string {
  const value = minor / 10 ** minorDigits(currency)
  const words = formatter(currency, 'name').format(value)
  return Number.isInteger(value) ? words.replace(/\.0+(?=\s)/, '') : words
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const str = (v: unknown) => (typeof v === 'string' ? v : null)
const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : null)
const STATUSES: readonly TicketTypeStatus[] = ['on_sale', 'sold_out', 'not_started', 'ended']
const POLICIES: readonly RefundPolicy[] = ['none', 'until_7d', 'until_24h']

function parseType(v: unknown): TicketType | null {
  if (!isObject(v)) return null
  const id = str(v.id)
  const name = str(v.name)
  const priceMinor = int(v.priceMinor)
  const maxPerOrder = int(v.maxPerOrder)
  const status = STATUSES.find((s) => s === v.status)
  if (!id || !name || priceMinor === null || maxPerOrder === null || !status) return null
  return {
    id,
    name,
    description: str(v.description),
    priceMinor,
    status,
    remaining: int(v.remaining),
    salesStartAt: str(v.salesStartAt),
    salesEndAt: str(v.salesEndAt),
    maxPerOrder,
  }
}

function hostOfLink(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' ? u.hostname.replace(/^www\./, '') : null
  } catch {
    return null
  }
}

/**
 * The event detail's `ticketing`, checked before anything draws it: null (the flag is off, or a free event) and anything
 * malformed are both "no tickets", so the page stays exactly as it is for a free event. An external link must be https.
 */
export function parseTicketing(raw: unknown): EventTicketing | null {
  if (!isObject(raw)) return null
  if (raw.mode === 'external') {
    const externalUrl = str(raw.externalUrl)
    const host = externalUrl ? hostOfLink(externalUrl) : null
    if (!externalUrl || !host) return null
    return { mode: 'external', externalUrl, externalSite: str(raw.externalSite) || host }
  }
  if (raw.mode !== 'native') return null
  const currency = str(raw.currency)
  if (!currency || !/^[A-Z]{3}$/.test(currency)) return null
  const mine = isObject(raw.mine) && int(raw.mine.ticketCount) !== null && Array.isArray(raw.mine.orderIds)
    ? { ticketCount: raw.mine.ticketCount as number, orderIds: (raw.mine.orderIds as unknown[]).filter((o): o is string => typeof o === 'string') }
    : null
  return {
    mode: 'native',
    currency,
    fromMinor: int(raw.fromMinor),
    feesAbsorbed: raw.feesAbsorbed === true,
    refundPolicy: POLICIES.find((p) => p === raw.refundPolicy) ?? 'none',
    types: Array.isArray(raw.types) ? raw.types.map(parseType).filter((t): t is TicketType => t !== null) : [],
    mine: mine && mine.ticketCount > 0 && mine.orderIds.length > 0 ? mine : null,
  }
}

/** A day and, when it matters, a time, in the event's zone: "Thu 5 Nov, 10 AM". */
const when = (iso: string, timeZone: string | undefined, now: number, withClock: boolean) => {
  const day = calendarDate(iso, { weekday: true, timeZone, now })
  return withClock ? `${day}, ${eventClock(iso, timeZone)}` : day
}

/** What a type's row says under its name, and whether it can be bought. "6 left" is said apart: it is drawn in warning amber. */
export function typeRow(t: TicketType, timeZone: string | undefined, now = Date.now()) {
  const soldOut = t.status === 'sold_out'
  const note =
    t.status === 'sold_out'
      ? 'Sold out'
      : t.status === 'ended'
        ? 'Sales ended'
        : t.status === 'not_started'
          ? t.salesStartAt
            ? `Sales start ${when(t.salesStartAt, timeZone, now, true)}`
            : 'Not on sale yet'
          : t.salesEndAt
            ? `Sales end ${when(t.salesEndAt, timeZone, now, false)}`
            : null
  const left = t.status === 'on_sale' && t.remaining !== null && t.remaining > 0 ? `${t.remaining} left` : null
  return { left, note, soldOut, buyable: t.status === 'on_sale' && stepperMax(t) > 0 }
}

/** A stepper's ceiling: the order limit or what is left, whichever is lower; nothing when it isn't on sale. */
export function stepperMax(t: TicketType): number {
  if (t.status !== 'on_sale') return 0
  return Math.max(0, Math.min(t.maxPerOrder, t.remaining ?? t.maxPerOrder))
}

const REFUND_LEAD_MS: Record<Exclude<RefundPolicy, 'none'>, number> = { until_7d: 7 * 86_400_000, until_24h: 86_400_000 }

/** The sheet's refund line, with its last moment named in the event's zone. US spelling. */
export function refundLine(policy: RefundPolicy, startTime: string, timeZone?: string): string {
  if (policy === 'none') return 'No refunds, unless the event is canceled.'
  const last = new Date(Date.parse(startTime) - REFUND_LEAD_MS[policy]).toISOString()
  return `Refunds until ${when(last, timeZone, Date.now(), true)}. The booking fee isn’t refunded, unless the event is canceled.`
}

/** The Tickets header's short form of the same policy. */
export const REFUND_SHORT: Record<RefundPolicy, string> = { none: 'No refunds', until_7d: 'Refunds until 7 days before', until_24h: 'Refunds until 24 h before' }

/** What the dock offers: sell, the ticket you hold, Save when nothing is on sale (sold out says so), or the organizer's link. */
export function ticketDockState(t: EventTicketing): 'buy' | 'mine' | 'soldOut' | 'closed' | 'external' {
  if (t.mode === 'external') return 'external'
  if (t.mine) return 'mine'
  if (t.types.some((x) => typeRow(x, undefined).buyable)) return 'buy'
  return t.types.length > 0 && t.types.every((x) => x.status === 'sold_out') ? 'soldOut' : 'closed'
}

/** §4: every 1.5 s for up to 30 s. */
export const POLL_INTERVAL_MS = 1500
export const POLL_TIMEOUT_MS = 30_000

export type PollEnd =
  | { kind: 'paid' | 'expired' | 'failed' | 'released'; order: TicketOrderStatus }
  | { kind: 'timeout' }
  | { kind: 'cancelled' }

/**
 * Asks for the order until it is settled (§4): paid, expired, refunded or canceled (the hold is gone: `released`), or a failed payment
 * the server recorded (`paymentFailed`, the hold still running). A failed read is tried again like a pending one. After 30 s
 * of neither it is `timeout`, the sheet's "Still confirming…". `cancelled()` is the caller going away: it stops quietly.
 */
export async function pollOrder(
  orderId: string,
  {
    get,
    cancelled = () => false,
    now = Date.now,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }: {
    get: (orderId: string) => Promise<{ success: boolean; data?: TicketOrderStatus }>
    cancelled?: () => boolean
    now?: () => number
    sleep?: (ms: number) => Promise<unknown>
  }
): Promise<PollEnd> {
  const start = now()
  for (;;) {
    if (cancelled()) return { kind: 'cancelled' }
    const r = await get(orderId).catch(() => ({ success: false as const, data: undefined }))
    if (cancelled()) return { kind: 'cancelled' }
    const order = r.success ? r.data : undefined
    if (order?.status === 'paid') return { kind: 'paid', order }
    if (order?.status === 'expired') return { kind: 'expired', order }
    if (order?.status === 'cancelled' || order?.status === 'refunded') return { kind: 'released', order }
    if (order?.paymentFailed) return { kind: 'failed', order }
    if (now() - start >= POLL_TIMEOUT_MS) return { kind: 'timeout' }
    await sleep(POLL_INTERVAL_MS)
  }
}
