import { Image } from 'expo-image'
import { StyleSheet, Text, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'

import { font, useBoldText } from '../ds/shared'
import { groupedDoorCode, spokenDoorCode } from '../ds/VenuePass'
import { Material } from '../ui/Material'
import { COLOR, FONT_FAMILY, MAX_FONT_SCALE, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import type { TicketEvent } from '../../lib/ticketCache'
import type { Ticket } from '../../lib/ticketing'
import { OPACITY } from '../../lib/theme'
import { calendarDate, eventClock } from '../../lib/time'

/** T-A: the QR is 232 pt where the screen allows (the board), smaller on a narrow one. */
export const QR_MAX = 232
/** The door code caps at 1.3× (FLOW-WALK, the pass): the panel grows under it, the code never wraps mid-group. */
const CODE_FONT_CAP = 1.3

/**
 * Ticket T-A (FLOW-WALK Flow 4b, ledger 55): the VenuePass's panel language (sheet-tier Material, the thumb, the Geist Mono
 * label, the title) holding a large QR of `qrPayload` on white and the six-character door code under it in two groups.
 * No decorative motion. Read: "Your ticket, 1 of 2. {title}. {type}. Door code K 7 Q, 2 X M"; the QR as "Ticket QR code
 * for the door". A used ticket still shows its code and says when.
 */
export function TicketPass({ ticket, index, total, event, qrSize }: { ticket: Ticket; index: number; total: number; event?: TicketEvent; qrSize: number }) {
  const bold = useBoldText()
  const when = event
    ? `${calendarDate(event.startTime, { weekday: true, timeZone: event.timezone })} · Doors ${eventClock(event.startTime, event.timezone)}`
    : null
  const used = ticket.redeemedAt ? `Used ${calendarDate(ticket.redeemedAt, { timeZone: event?.timezone })}, ${eventClock(ticket.redeemedAt, event?.timezone)}` : null
  const label = [`Your ticket, ${index + 1} of ${total}`, event?.title, ticket.typeName, used, spokenDoorCode(ticket.doorCode)].filter(Boolean).join('. ')

  return (
    <View testID={`ticket-pass-${ticket.ticketId}`} style={styles.pass}>
      <Material role="sheet" style={[StyleSheet.absoluteFill, styles.radius]} />
      <View accessible accessibilityLabel={label} style={styles.head}>
        <View style={styles.thumb}>
          {event?.coverImageUrl ? <Image source={{ uri: event.coverImageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} /> : null}
        </View>
        <View style={styles.headText}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.label} style={[font('label', bold), styles.secondary]}>
            {`YOUR TICKET · ${index + 1} OF ${total}`}
          </Text>
          {event?.title ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.title} numberOfLines={1} style={[font('title', bold), styles.primary]}>
              {event.title}
            </Text>
          ) : null}
          {when ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
              {when}
            </Text>
          ) : null}
        </View>
      </View>
      <View accessible accessibilityRole="image" accessibilityLabel="Ticket QR code for the door" style={[styles.qr, used && styles.dim]}>
        <QRCode value={ticket.qrPayload} size={qrSize} color={COLOR.ink} backgroundColor={COLOR.textPrimary} ecl="M" quietZone={0} />
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.codeBlock}>
        <Text maxFontSizeMultiplier={CODE_FONT_CAP} style={[font('display', bold, FONT_FAMILY.mono[700]), styles.code, used ? styles.secondary : styles.primary]}>
          {groupedDoorCode(ticket.doorCode)}
        </Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary, styles.center]}>
          {used ?? `${ticket.typeName} · show the code or the QR at the door`}
        </Text>
      </View>
      {event?.venueName ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
          {event.venueName}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  pass: { borderRadius: RADIUS.sheet, padding: SPACE.lg, gap: SPACE.lg, overflow: 'hidden' },
  radius: { borderRadius: RADIUS.sheet },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  thumb: { width: SIZE.primary, height: SIZE.primary, borderRadius: RADIUS.thumb, overflow: 'hidden', backgroundColor: COLOR.surfaceSunken },
  headText: { flex: 1, minWidth: 0 },
  // The QR on white with its own margin: a scanner needs the light quiet zone the dark panel would not give it.
  qr: { alignSelf: 'center', padding: SPACE.md, borderRadius: RADIUS.rowInCard, backgroundColor: COLOR.textPrimary },
  // A used ticket's QR, dimmed and still scannable for a re-check at the door.
  dim: { opacity: OPACITY.disabled },
  codeBlock: { alignItems: 'center', gap: SPACE.xs },
  code: { letterSpacing: SPACE.xxs, fontVariant: ['tabular-nums'] },
  center: { textAlign: 'center' },
  primary: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
})
