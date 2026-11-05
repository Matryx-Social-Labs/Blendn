import { router } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'

import { Button } from '../ds/Button'
import { Sheet, type SheetAction } from '../ds/Sheet'
import { Stepper } from '../ds/Stepper'
import { font, useAnnounced, useBoldText } from '../ds/shared'
import { Icon } from '../ui/Icon'
import { apiClient } from '../../lib/apiClient'
import { COLOR, FONT_FAMILY, ICON, MAX_FONT_SCALE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { BLENDN_LINKS, openInApp, openPayPage } from '../../lib/links'
import { Logger } from '../../lib/logger'
import { saveTickets, ticketSession } from '../../lib/ticketCache'
import {
  formatMoney,
  pollOrder,
  refundLine,
  refusalCopy,
  refusalOf,
  spokenMoney,
  stepperMax,
  ticketRefusal,
  typeRow,
  type TicketRefusalView,
  type NativeTicketing,
  type TicketLine,
  type TicketOrder,
  type TicketOrderStatus,
  type TicketQuote,
} from '../../lib/ticketing'
import { calendarDate, eventClock } from '../../lib/time'
import { useAuth } from '../../lib/useAuth'
import { useNow } from '../../lib/useNow'

/** §2: a quote 250 ms after the last stepper change. */
export const QUOTE_DEBOUNCE_MS = 250
/** §3: `busy` is tried again after its `retryAfter` (1 s), twice at most. */
const BUSY_RETRY_MS = 1000
const BUSY_RETRIES = 2
/** A guard only: the server caps types at 20 per event (§8.10). */
const MAX_SHEET_TYPES = 50

export type CheckoutEvent = { id: string; title: string; startTime: string; timezone?: string }

type Phase =
  | { kind: 'pick' }
  | { kind: 'confirming'; order: TicketOrder }
  | { kind: 'still'; order: TicketOrder }
  | { kind: 'failed'; order: TicketOrder; holdExpiresAt: string }
  | { kind: 'expired' }
  | { kind: 'released' }

/**
 * Checkout A (FLOW-WALK Flow 4b, ledger 54): one DS Sheet. Every type with a Stepper capped by its order limit and what is
 * left, then the bill (tickets, the booking fee with its three parts, the total) from a quote asked 250 ms after the last
 * step, the refund line, the terms of sale, and "Pay ₹X". Pay holds the tickets (§3), opens the pay page in the in-app
 * browser (§4) and, once the person is back, polls the order (§5): paid hands the order to `onPaid` (the page plays M-A);
 * the hold running out, a failed payment and "Still confirming…" are this sheet's. Every refusal is said in plain words.
 *
 * Haptics: the Stepper's `H.select`; Pay's own `H.primary`; `H.error` once on a refused order, a failed payment or a hold
 * that ran out. `onStale`: the page's counts are old (a refusal said so, or a hold lapsed), so it reads the event again.
 */
export function CheckoutSheet({
  visible,
  onClose,
  event,
  ticketing,
  initialTypeId,
  onPaid,
  onStale,
}: {
  visible: boolean
  onClose: () => void
  event: CheckoutEvent
  ticketing: NativeTicketing
  /** The row tapped (that type at 1), or null from "Get tickets" (nothing picked). */
  initialTypeId: string | null
  onPaid: (order: TicketOrderStatus) => void
  onStale: () => void
}) {
  const bold = useBoldText()
  const { user } = useAuth()
  const [qty, setQty] = useState<Record<string, number>>(() => (initialTypeId ? { [initialTypeId]: 1 } : {}))
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' })
  const [paying, setPaying] = useState(false)
  /** The last quote or refusal, and which lines it was for: one for older lines is shown, but never paid on. */
  const [answer, setAnswer] = useState<{ key: string; quote?: TicketQuote; refusal?: TicketRefusalView } | null>(null)
  const [orderRefusal, setOrderRefusal] = useState<TicketRefusalView | null>(null)
  const [releasing, setReleasing] = useState(false)
  const mounted = useRef(true)
  useEffect(
    () => () => {
      mounted.current = false
    },
    []
  )

  const types = ticketing.types.slice(0, MAX_SHEET_TYPES)
  // Clamped to today's ceiling: a re-read after a refusal can lower what is left under what was picked.
  const lines: TicketLine[] = types
    .map((t) => ({ typeId: t.id, quantity: Math.min(qty[t.id] ?? 0, stepperMax(t)) }))
    .filter((l) => l.quantity > 0)
  const linesKey = JSON.stringify(lines)
  const count = lines.reduce((n, l) => n + l.quantity, 0)
  const fresh = answer?.key === linesKey ? answer : null
  const quote = count > 0 ? answer?.quote : undefined
  const refusal = count > 0 ? (fresh?.refusal ?? orderRefusal) : orderRefusal

  const latestStale = useRef(onStale)
  useEffect(() => {
    latestStale.current = onStale
  })

  useEffect(() => {
    if (phase.kind !== 'pick' || lines.length === 0) return
    let live = true
    const timer = setTimeout(() => {
      apiClient
        .getTicketQuote(event.id, lines)
        .then((r) => {
          if (!live) return
          if (r.success && r.data) return setAnswer({ key: linesKey, quote: r.data })
          const refused = ticketRefusal(r)
          setAnswer({ key: linesKey, refusal: refused })
          if (refused.stale) latestStale.current()
        })
        .catch((e) => {
          Logger.warn('tickets', 'quote:failed', { error: e instanceof Error ? e.message : String(e) })
          if (live) setAnswer({ key: linesKey, refusal: { copy: refusalCopy(undefined), stale: false } })
        })
    }, QUOTE_DEBOUNCE_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
    // `lines` is read through its key: a new array with the same lines is not a new quote.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linesKey, phase.kind, event.id])

  // The total is said once it settles (the bill is a list; a step does not read every line again).
  const total = fresh?.quote ? formatMoney(fresh.quote.totalMinor, fresh.quote.currency, { exact: true }) : null
  useAnnounced(fresh?.quote ? `Total ${spokenMoney(fresh.quote.totalMinor, fresh.quote.currency)}` : null, { queue: true })
  // A refusal is said as it arrives (iOS; Android's live region on the line below).
  useAnnounced(refusal?.copy)

  const settle = async (order: TicketOrder) => {
    setPhase({ kind: 'confirming', order })
    // A sign-out during the poll: the paid tickets are not written into the next session's copy.
    const since = ticketSession()
    const end = await pollOrder(order.orderId, { get: (id) => apiClient.getTicketOrder(id), cancelled: () => !mounted.current })
    switch (end.kind) {
      case 'paid':
        if (user?.id) await saveTickets(user.id, end.order.tickets, { orderId: end.order.orderId, since })
        onPaid(end.order)
        return
      case 'failed':
        H.error()
        setPhase({ kind: 'failed', order, holdExpiresAt: end.order.holdExpiresAt || order.holdExpiresAt })
        return
      case 'expired':
      case 'released':
        H.error()
        latestStale.current()
        setPhase({ kind: end.kind })
        return
      case 'timeout':
        setPhase({ kind: 'still', order })
        return
      case 'cancelled':
        return
    }
  }

  const openAndSettle = async (order: TicketOrder) => {
    setPhase({ kind: 'confirming', order })
    try {
      await openPayPage(order.payUrl)
    } catch (e) {
      Logger.warn('tickets', 'pay:open:failed', { error: e instanceof Error ? e.message : String(e) })
      H.error()
      setOrderRefusal({ copy: refusalCopy(undefined), stale: false })
      setPhase({ kind: 'pick' })
      return
    }
    await settle(order)
  }

  const pay = async () => {
    if (!fresh?.quote || paying) return
    setPaying(true)
    setOrderRefusal(null)
    let r = await apiClient.createTicketOrder(event.id, lines)
    for (let tries = 0; !r.success && refusalOf(r) === 'busy' && tries < BUSY_RETRIES; tries++) {
      const wait = r.retryAfter ? r.retryAfter * 1000 : BUSY_RETRY_MS
      await new Promise((resolve) => setTimeout(resolve, wait))
      if (!mounted.current) return
      r = await apiClient.createTicketOrder(event.id, lines)
    }
    if (!mounted.current) return
    setPaying(false)
    if (!r.success || !r.data) {
      const refused = ticketRefusal(r)
      H.error()
      setOrderRefusal(refused)
      if (refused.stale) latestStale.current()
      return
    }
    await openAndSettle(r.data)
  }

  /**
   * "Let them go" (§8.3): the hold is given back now (204), the page's counts read again, the sheet closes. An order no longer
   * held (409 `not_pending`, or anything else) is read again instead: it may have been paid a moment ago.
   */
  const letGo = async (order: TicketOrder) => {
    if (releasing) return
    setReleasing(true)
    const r = await apiClient.releaseTicketOrder(order.orderId).catch(() => ({ success: false }))
    if (!mounted.current) return
    setReleasing(false)
    if (r.success) {
      latestStale.current()
      onClose()
      return
    }
    await settle(order)
  }

  const fixProfile = () => {
    onClose()
    router.push('/edit-profile' as never)
  }

  const pickAgain = () => {
    setOrderRefusal(null)
    setAnswer(null)
    setPhase({ kind: 'pick' })
  }

  const ticketsWord = `${count} ${count === 1 ? 'ticket' : 'tickets'}`
  const when = `${calendarDate(event.startTime, { weekday: true, timeZone: event.timezone })}, ${eventClock(event.startTime, event.timezone)}`
  const common = { visible, onClose, testID: 'checkout-sheet' } as const

  if (phase.kind === 'confirming') {
    // Not dismissible: the answer is seconds away and this sheet is where it lands; past 30 s "Still confirming…" offers Not now.
    return <Sheet {...common} dismissible={false} icon="clock" title="Confirming your payment" body="A few seconds. You won’t be charged twice." />
  }
  if (phase.kind === 'still') {
    const order = phase.order
    return (
      <Sheet
        {...common}
        icon="clock"
        title="Still confirming…"
        body="Payments can take a minute to reach us. You won’t be charged twice."
        actions={[
          { label: 'Refresh', kind: 'primary', onPress: () => void settle(order) },
          { label: 'Not now', kind: 'tertiary', onPress: onClose },
        ]}
      />
    )
  }
  if (phase.kind === 'failed') {
    const order = phase.order
    return (
      <Sheet
        {...common}
        icon="credit-card"
        title="Payment didn’t go through"
        actions={[
          { label: 'Try again', kind: 'primary', onPress: () => void openAndSettle(order), disabled: releasing },
          { label: 'Let them go', kind: 'tertiary', onPress: () => void letGo(order), loading: releasing, testID: 'checkout-let-go' },
        ]}
      >
        <HoldLeft
          until={phase.holdExpiresAt}
          tickets={ticketsWord}
          onRanOut={() => {
            latestStale.current()
            setPhase({ kind: 'expired' })
          }}
        />
      </Sheet>
    )
  }
  if (phase.kind === 'expired' || phase.kind === 'released') {
    return (
      <Sheet
        {...common}
        icon="clock"
        title={phase.kind === 'expired' ? 'Your hold ran out' : 'This order was canceled'}
        body={phase.kind === 'expired' ? 'We held your tickets for 10 minutes. Pick again to see what’s left.' : 'Nothing was charged.'}
        actions={[{ label: 'Pick again', kind: 'primary', onPress: pickAgain }]}
      />
    )
  }

  const payAction: SheetAction = {
    label: 'Pay',
    kind: 'primary',
    onPress: () => void pay(),
    loading: paying,
    disabled: !fresh?.quote,
    testID: 'checkout-pay',
    ...(total ? { price: { amount: total }, accessibilityLabel: `Pay ${total}` } : {}),
  }
  const meta = [font('meta', bold), styles.secondary]
  const mono = (role: 'body' | 'meta') => [font(role, bold, FONT_FAMILY.mono[500]), styles.tabular]
  const parts = quote?.feeParts
  const cur = quote?.currency ?? ticketing.currency

  return (
    <Sheet {...common} title="Get tickets" headerNote={{ text: event.title, tail: ` · ${when}` }} actions={[payAction]}>
      <View style={styles.list}>
        {types.map((t) => {
          const row = typeRow(t, event.timezone)
          const max = stepperMax(t)
          const price = formatMoney(t.priceMinor, ticketing.currency)
          return (
            <View key={t.id} style={styles.typeRow}>
              <View style={styles.typeText}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('bodyStrong', bold), styles.primary]}>
                  {t.name} <Text style={[mono('body'), row.soldOut ? styles.struck : null]}>{price}</Text>
                </Text>
                {row.left || (row.note && !row.soldOut) ? (
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={meta}>
                    {row.left ? <Text style={styles.warning}>{row.left}</Text> : null}
                    {row.left && row.note ? ' · ' : null}
                    {row.soldOut ? null : row.note}
                  </Text>
                ) : null}
                {t.description ? (
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={meta}>
                    {t.description}
                  </Text>
                ) : null}
              </View>
              {row.buyable ? (
                <Stepper
                  label={`${t.name}, ${spokenMoney(t.priceMinor, ticketing.currency)}`}
                  value={Math.min(qty[t.id] ?? 0, max)}
                  min={0}
                  max={max}
                  onGlass={Platform.OS === 'ios'}
                  onChange={(n) => setQty((q) => ({ ...q, [t.id]: n }))}
                  testID={`checkout-step-${t.id}`}
                />
              ) : (
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={meta}>
                  {row.soldOut ? 'Sold out' : row.note}
                </Text>
              )}
            </View>
          )
        })}
      </View>

      {quote ? (
        <View style={styles.bill} accessibilityRole="list">
          <BillLine label={`Tickets (${count})`} value={formatMoney(quote.subtotalMinor, cur, { exact: true })} testID="checkout-subtotal" />
          {quote.bookingFeeMinor > 0 && parts ? (
            <>
              <BillLine label="Booking fee" value={formatMoney(quote.bookingFeeMinor, cur, { exact: true })} testID="checkout-fee" />
              <Text testID="checkout-fee-parts" maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={meta}>
                {`Blend’n service ${formatMoney(parts.serviceMinor, cur, { exact: true })} · ${quote.taxLabel ?? 'Tax'} ${formatMoney(parts.taxMinor, cur, { exact: true })} · Payment processing ${formatMoney(parts.processingMinor, cur, { exact: true })}`}
              </Text>
            </>
          ) : null}
          <View style={styles.rule} />
          <BillLine label="Total" value={formatMoney(quote.totalMinor, cur, { exact: true })} strong testID="checkout-total" />
        </View>
      ) : null}

      {refusal ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.refusal]}>
          {refusal.copy}
        </Text>
      ) : null}
      {refusal?.fix ? <Button kind="tertiary" size="md" label={refusal.fix} onPress={fixProfile} style={styles.fix} testID="checkout-fix" /> : null}

      <View style={styles.policy}>
        <Icon name="info" size={ICON.inline} color={COLOR.textSecondary} />
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[...meta, styles.shrink]}>
          {refundLine(ticketing.refundPolicy, event.startTime, event.timezone)}
        </Text>
      </View>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} style={[font('caption', bold), styles.secondary]}>
        {'By paying you agree to the '}
        <Text
          accessibilityRole="link"
          onPress={() => void openInApp(BLENDN_LINKS.termsOfSale).catch(() => {})}
          style={[styles.primary, styles.underline]}
        >
          terms of sale
        </Text>
        {'. You’ll pay on a secure page in your browser.'}
      </Text>
    </Sheet>
  )
}

function BillLine({ label, value, strong = false, testID }: { label: string; value: string; strong?: boolean; testID: string }) {
  const bold = useBoldText()
  const role = strong ? 'bodyStrong' : 'body'
  return (
    <View accessible accessibilityLabel={`${label}, ${value}`} style={styles.billLine}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font(role, bold), styles.primary, styles.shrink]}>
        {label}
      </Text>
      <Text testID={testID} maxFontSizeMultiplier={MAX_FONT_SCALE[role]} style={[font(role, bold, FONT_FAMILY.mono[500]), styles.primary, styles.tabular]}>
        {value}
      </Text>
    </View>
  )
}

/** "Nothing was charged. Your 2 tickets are held for 7:42 more.", ticking; at 0:00 the sheet says the hold ran out. */
function HoldLeft({ until, tickets, onRanOut }: { until: string; tickets: string; onRanOut: () => void }) {
  const bold = useBoldText()
  const now = useNow(1000)
  const left = Math.max(0, Math.ceil((Date.parse(until) - now) / 1000))
  const ranOut = left === 0
  const latest = useRef(onRanOut)
  useEffect(() => {
    latest.current = onRanOut
  })
  useEffect(() => {
    if (ranOut) latest.current()
  }, [ranOut])
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
  return (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.secondary]}>
      {`Nothing was charged. Your ${tickets} are held for `}
      <Text style={[font('body', bold, FONT_FAMILY.mono[500]), styles.primary, styles.tabular]}>{clock}</Text>
      {' more.'}
    </Text>
  )
}

const styles = StyleSheet.create({
  list: { gap: SPACE.lg, paddingTop: SPACE.sm },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  typeText: { flex: 1, minWidth: 0, gap: SPACE.xxs },
  primary: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  // Amber on the surface, never on the orange (FLOW-WALK brand check: AA).
  warning: { color: COLOR.warning },
  refusal: { color: COLOR.destructive },
  tabular: { fontVariant: ['tabular-nums'] },
  struck: { textDecorationLine: 'line-through', color: COLOR.textSecondary },
  underline: { textDecorationLine: 'underline' },
  bill: { gap: SPACE.xs, paddingTop: SPACE.lg },
  billLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: SPACE.md },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: COLOR.hairline, marginVertical: SPACE.xs },
  policy: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm, paddingTop: SPACE.lg },
  shrink: { flexShrink: 1 },
  fix: { alignSelf: 'flex-start' },
})
