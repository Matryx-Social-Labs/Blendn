import { router } from 'expo-router'
import { useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import ScalePress from '../motion/ScalePress'
import { Button } from '../ds/Button'
import { MomentPour } from '../ds/MomentPour'
import { SectionHeader } from '../ds/SectionHeader'
import { font, useBoldText } from '../ds/shared'
import { Icon } from '../ui/Icon'
import { CheckoutSheet, type CheckoutEvent } from './CheckoutSheet'
import { COLOR, FONT_FAMILY, ICON, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'
import { openTicketSite } from '../../lib/links'
import { Logger } from '../../lib/logger'
import { rememberTicketEvent, type TicketEvent } from '../../lib/ticketCache'
import {
  formatMoney,
  REFUND_SHORT,
  spokenMoney,
  ticketDockState,
  typeRow,
  type EventTicketing,
  type NativeTicketing,
  type TicketOrderStatus,
  type TicketType,
} from '../../lib/ticketing'
import { useAuth } from '../../lib/useAuth'

/** The app's Tickets section shows three types, then "See all N" (FLOW-WALK large data; the dashboard's folds after eight). */
export const TYPE_FOLD = 3

const ticketsWord = (n: number) => `${n} ${n === 1 ? 'ticket' : 'tickets'}`

/** What the dock draws, from the hook; the page adds its RSVP button (external keeps "I'm going") and the Save state. */
export type TicketDockModel =
  | { kind: 'external'; site: string; onOpen: () => void }
  | { kind: 'native'; ticketing: NativeTicketing; timeZone?: string; onGet: () => void; onMine: () => void }

export type TicketPageEvent = CheckoutEvent & { venueName?: string; coverImageUrl?: string | null }

/**
 * Event page A for a ticketed event (FLOW-WALK Flow 4b, ledger 53): the price line under the hero, the Tickets section and
 * the dock's words, and the checkout sheet and the paid moment over the page. With `ticketing` null every part is null and
 * the page is the free event's, untouched. `onStale`: read the event again (a refusal, a lapsed hold, a paid order).
 */
export function useEventTickets({
  event,
  ticketing,
  onStale,
}: {
  event: TicketPageEvent | null
  ticketing: EventTicketing | null
  onStale: () => void
}) {
  const { user } = useAuth()
  const [sheet, setSheet] = useState<{ key: number; typeId: string | null; open: boolean }>({ key: 0, typeId: null, open: false })
  const [paid, setPaid] = useState<TicketOrderStatus | null>(null)

  const passEvent = (e: TicketPageEvent): TicketEvent => ({
    title: e.title,
    startTime: e.startTime,
    timezone: e.timezone,
    venueName: e.venueName,
    coverImageUrl: e.coverImageUrl,
  })
  const openPass = (orderId: string) => {
    if (user?.id && event) void rememberTicketEvent(user.id, event.id, passEvent(event))
    router.push({ pathname: '/ticket/[orderId]', params: { orderId } } as never)
  }
  const pick = (typeId: string | null) => setSheet((s) => ({ key: s.key + 1, typeId, open: true }))
  const openSite = (url: string) => {
    openTicketSite(url).catch((e) => Logger.warn('tickets', 'site:open:failed', { error: e instanceof Error ? e.message : String(e) }))
  }

  if (!ticketing || !event) return { priceLine: null, section: null, dock: null, overlays: null }

  if (ticketing.mode === 'external') {
    return {
      priceLine: null,
      section: <ExternalSection site={ticketing.externalSite} onOpen={() => openSite(ticketing.externalUrl)} />,
      dock: { kind: 'external', site: ticketing.externalSite, onOpen: () => openSite(ticketing.externalUrl) } satisfies TicketDockModel,
      overlays: null,
    }
  }

  const native = ticketing
  const onPaid = (order: TicketOrderStatus) => {
    setSheet((s) => ({ ...s, open: false }))
    if (user?.id) void rememberTicketEvent(user.id, event.id, passEvent(event))
    setPaid(order)
    onStale()
  }
  const total = paid ? formatMoney(paid.totalMinor, paid.currency, { exact: true }) : ''
  return {
    priceLine: <PriceLine ticketing={native} />,
    section: <NativeSection ticketing={native} timeZone={event.timezone} onPick={pick} onMine={() => native.mine && openPass(native.mine.orderIds[0])} />,
    dock: {
      kind: 'native',
      ticketing: native,
      timeZone: event.timezone,
      onGet: () => pick(null),
      onMine: () => native.mine && openPass(native.mine.orderIds[0]),
    } satisfies TicketDockModel,
    overlays: (
      <>
        {sheet.key > 0 ? (
          <CheckoutSheet
            key={sheet.key}
            visible={sheet.open}
            onClose={() => setSheet((s) => ({ ...s, open: false }))}
            event={event}
            ticketing={native}
            initialTypeId={sheet.typeId}
            onPaid={onPaid}
            onStale={onStale}
          />
        ) : null}
        {paid ? (
          // M-A: once, on return from paying; over the page's own bar. MomentPour plays H.success and holds Reduce Motion's frame.
          <View style={styles.cover} pointerEvents="box-none">
            <MomentPour
              testID="ticket-moment"
              ground
              asks
              headline="You’re going"
              venue={`Paid · ${total}`}
              label={`Paid, ${spokenMoney(paid.totalMinor, paid.currency)}. You’re going. ${ticketsWord(paid.tickets.length)}.`}
              onDone={() => {
                const orderId = paid.orderId
                setPaid(null)
                openPass(orderId)
              }}
            />
          </View>
        ) : null}
      </>
    ),
  }
}

/** "From ₹499 · plus booking fee" under the hero; "You're going · 2 tickets" once bought. */
function PriceLine({ ticketing }: { ticketing: NativeTicketing }) {
  const bold = useBoldText()
  const state = ticketDockState(ticketing)
  if (state === 'mine' && ticketing.mine) {
    const words = `You’re going · ${ticketsWord(ticketing.mine.ticketCount)}`
    return (
      <View testID="ticket-price-line" accessible accessibilityLabel={words} style={styles.priceLine}>
        <Icon name="check" size={ICON.inline} color={COLOR.selectionEmberGlyph} />
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.primary]}>
          {words}
        </Text>
      </View>
    )
  }
  if (ticketing.fromMinor === null) return null
  const many = ticketing.types.length > 1
  const price = formatMoney(ticketing.fromMinor, ticketing.currency)
  const note = state === 'soldOut' ? 'sold out' : ticketing.feesAbsorbed ? 'price includes fees' : 'plus booking fee'
  return (
    <View
      testID="ticket-price-line"
      accessible
      accessibilityLabel={`${many ? 'From ' : ''}${spokenMoney(ticketing.fromMinor, ticketing.currency)}, ${note}`}
      style={styles.priceLine}
    >
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.primary]}>
        {many ? 'From ' : ''}
        <Text style={[font('bodyStrong', bold, FONT_FAMILY.mono[500]), styles.tabular, state === 'soldOut' && styles.struck]}>{price}</Text>
      </Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
        {note === 'price includes fees' ? 'Price includes fees' : note}
      </Text>
    </View>
  )
}

function NativeSection({
  ticketing,
  timeZone,
  onPick,
  onMine,
}: {
  ticketing: NativeTicketing
  timeZone?: string
  onPick: (typeId: string | null) => void
  onMine: () => void
}) {
  const bold = useBoldText()
  const shown = ticketing.types.slice(0, TYPE_FOLD)
  const rest = ticketing.types.length - shown.length
  return (
    <View testID="ticket-section" style={styles.section}>
      <SectionHeader title="Tickets" caption={REFUND_SHORT[ticketing.refundPolicy]} />
      {ticketing.mine ? (
        <ScalePress
          haptic={false}
          pressedScale={0.98}
          onPress={onMine}
          accessibilityRole="button"
          accessibilityLabel={`Your ${ticketsWord(ticketing.mine.ticketCount)}. Works offline`}
          accessibilityHint="Opens your ticket"
          style={[styles.card, styles.mine]}
          testID="ticket-mine-row"
        >
          <Icon name="ticket" size={ICON.control} color={COLOR.selectionEmberGlyph} />
          <View style={styles.rowText}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.primary]}>
              {`Your ${ticketsWord(ticketing.mine.ticketCount)}`}
            </Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
              Works offline
            </Text>
          </View>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.primary]}>
            Show
          </Text>
          <Icon name="chevron-right" size={ICON.inline} color={COLOR.textSecondary} />
        </ScalePress>
      ) : null}
      <View style={styles.card}>
        {shown.map((t, i) => (
          <TypeRow key={t.id} type={t} currency={ticketing.currency} timeZone={timeZone} first={i === 0} onPress={() => onPick(t.id)} />
        ))}
        {rest > 0 ? (
          <ScalePress
            haptic={false}
            onPress={() => onPick(null)}
            accessibilityRole="button"
            accessibilityLabel={`See all ${ticketing.types.length} ticket types`}
            style={[styles.row, styles.divided]}
            testID="ticket-see-all"
          >
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.primary, styles.grow]}>
              {`See all ${ticketing.types.length}`}
            </Text>
            <Icon name="chevron-right" size={ICON.inline} color={COLOR.textSecondary} />
          </ScalePress>
        ) : null}
      </View>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
        {ticketing.feesAbsorbed ? 'Prices include fees.' : 'The booking fee is shown before you pay.'}
      </Text>
    </View>
  )
}

/** One type: the name (wrapping), "6 left" in amber and when sales end, the price right in Geist Mono. One element to a screen reader. */
function TypeRow({ type: t, currency, timeZone, first, onPress }: { type: TicketType; currency: string; timeZone?: string; first: boolean; onPress: () => void }) {
  const bold = useBoldText()
  const row = typeRow(t, timeZone)
  const price = formatMoney(t.priceMinor, currency)
  const sub = [row.left, row.note].filter(Boolean).join(', ')
  const label = row.soldOut ? `${t.name}, sold out` : [t.name, spokenMoney(t.priceMinor, currency), sub, t.description].filter(Boolean).join(', ')
  const body = (
    <>
      <View style={styles.rowText}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), row.buyable ? styles.primary : styles.secondary]}>
          {t.name}
        </Text>
        {row.left || row.note ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
            {row.left ? <Text style={styles.warning}>{row.left}</Text> : null}
            {row.left && row.note ? ' · ' : null}
            {row.note}
          </Text>
        ) : null}
        {t.description ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
            {t.description}
          </Text>
        ) : null}
      </View>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold, FONT_FAMILY.mono[500]), styles.tabular, row.buyable ? styles.primary : styles.struck]}>
        {price}
      </Text>
    </>
  )
  const style = [styles.row, !first && styles.divided]
  if (!row.buyable) {
    return (
      <View accessible accessibilityLabel={label} style={style} testID={`ticket-type-${t.id}`}>
        {body}
      </View>
    )
  }
  // No haptic: it opens a sheet, and the sheet is the feedback.
  return (
    <ScalePress haptic={false} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={style} testID={`ticket-type-${t.id}`}>
      {body}
    </ScalePress>
  )
}

/** Canada (and any market without payouts): one row naming who sells, and one plain line that we don't. */
function ExternalSection({ site, onOpen }: { site: string; onOpen: () => void }) {
  const bold = useBoldText()
  return (
    <View testID="ticket-section" style={styles.section}>
      <SectionHeader title="Tickets" />
      <ScalePress
        haptic={false}
        onPress={onOpen}
        accessibilityRole="link"
        accessibilityLabel={`Find tickets on ${site}, opens in browser`}
        style={[styles.card, styles.row]}
        testID="ticket-external-row"
      >
        <View style={styles.rowText}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.primary]}>
            Sold by the organizer
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
            {`on ${site}`}
          </Text>
        </View>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.primary]}>
          Find tickets
        </Text>
        <Icon name="arrow-up-right" size={ICON.inline} color={COLOR.textPrimary} />
      </ScalePress>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
        {`Blend’n doesn’t sell these tickets or take a cut. Refunds and entry follow the organizer’s rules on ${site}. Got one? Say you’re going so the room lets you in.`}
      </Text>
    </View>
  )
}

/**
 * The ticketed dock, before the doors. External: the organizer's link as the one primary, the page's RSVP under it (the room
 * and check-in still run on it). Native: one line, the state on the left and one action on the right (FLOW-WALK 3, ledger 17).
 */
export function TicketDock({ model, rsvp, saved, onSave }: { model: TicketDockModel; rsvp: ReactNode; saved: boolean; onSave: () => void }) {
  if (model.kind === 'native') return <NativeDock {...model} saved={saved} onSave={onSave} />
  return (
    <>
      <Button
        kind="primary"
        icon="arrow-up-right"
        label={`Tickets on ${model.site}`}
        accessibilityLabel={`Tickets on ${model.site}, opens in browser`}
        pressHaptic={false}
        onPress={model.onOpen}
        testID="ticket-dock-external"
      />
      {rsvp}
    </>
  )
}

function NativeDock({
  ticketing,
  timeZone,
  saved,
  onSave,
  onGet,
  onMine,
}: Omit<Extract<TicketDockModel, { kind: 'native' }>, 'kind'> & { saved: boolean; onSave: () => void }) {
  const bold = useBoldText()
  const state = ticketDockState(ticketing)
  const from = ticketing.fromMinor !== null ? formatMoney(ticketing.fromMinor, ticketing.currency) : null
  const saveButton = (
    <Button kind="secondary" onGlass size="md" icon={saved ? 'check' : 'heart'} label={saved ? 'Saved' : 'Save'} onPress={onSave} testID="ticket-dock-save" />
  )
  const [lead, line, action, mono] =
    state === 'mine'
      ? ['You’re going', `${ticketsWord(ticketing.mine?.ticketCount ?? 0)} · works offline`, <Button key="m" kind="primary" size="md" icon="ticket" label="My ticket" onPress={onMine} testID="ticket-dock-mine" />, false]
      : state === 'buy'
        ? [from ? `From ${from}` : 'Tickets', ticketing.feesAbsorbed ? 'Price includes fees' : 'plus booking fee', <Button key="g" kind="primary" size="md" label="Get tickets" pressHaptic={false} onPress={onGet} testID="ticket-dock-get" />, !!from]
        : state === 'soldOut'
          ? ['Sold out', 'Save it to hear if this host runs another', saveButton, false]
          : ['Tickets', nextSaleLine(ticketing, timeZone), saveButton, false]
  return (
    <View style={styles.dock}>
      <View style={styles.rowText}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.heading} style={[font('heading', bold, mono ? FONT_FAMILY.mono[700] : undefined), styles.primary, mono && styles.tabular]}>
          {lead}
        </Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
          {line}
        </Text>
      </View>
      {action}
    </View>
  )
}

/** Nothing on sale and not sold out: when the next type opens, or that sales have ended. */
function nextSaleLine(t: NativeTicketing, timeZone?: string): string {
  const next = t.types.find((x) => x.status === 'not_started')
  return next ? (typeRow(next, timeZone).note ?? 'Not on sale yet') : 'Sales have ended'
}

const styles = StyleSheet.create({
  priceLine: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: SPACE.sm },
  section: { gap: SPACE.md },
  card: { borderRadius: RADIUS.rowInCard, backgroundColor: COLOR.surface, overflow: 'hidden' },
  // The order you hold, lit in the ember world (selection ember fill, its glyph): first, and never a second gradient.
  mine: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, padding: SPACE.lg, backgroundColor: COLOR.selectionEmberFill },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLOR.hairline },
  rowText: { flex: 1, minWidth: 0, gap: SPACE.xxs },
  grow: { flex: 1 },
  primary: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  warning: { color: COLOR.warning },
  tabular: { fontVariant: ['tabular-nums'] },
  struck: { textDecorationLine: 'line-through', color: COLOR.textSecondary },
  dock: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  cover: { ...StyleSheet.absoluteFill, zIndex: 20 },
})
