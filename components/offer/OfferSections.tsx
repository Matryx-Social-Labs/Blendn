import { BAR_BOTTOM, barTop } from '../../lib/barGeometry'
import type { Ref } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button } from '../ds/Button'
import { DoorCode } from '../ds/VenuePass'
import { IconButton } from '../ds/IconButton'
import { LiquidDisc } from '../ds/LiquidDisc'
import { MonoRun } from '../ds/MonoFamily'
import { VenuePlate } from '../ds/VenuePlate'
import { font, IC_HAIRLINE, useAnnounced, useBoldText, useIncreaseContrast, useMinMeasure } from '../ds/shared'
import { Icon, type IconName } from '../ui/Icon'
import { COLOR, FONT_FAMILY, ICON, MAX_FONT_SCALE, RADIUS, SIZE, SPACE, TYPE } from '../../lib/design/tokens'
import { knownLine, REGULAR_COPY, type PassView, type RegularPrefs } from '../../lib/offers'
import { plateOf } from '../../lib/placesPane'

/** The disc at the ticket's middle (flow-4 offer board .disc4: 184). */
const DISC = 184
/** The board's .vp: a 48 pt tile beside the head, the venue's plate (the API sends no venue photo). */
const TILE = SIZE.control
/** The board's head label sits inline in a 24 pt line, so the venue starts 26 under the row's top. */
const HEAD_LABEL_LINE = SPACE.xl
/** A used pass dims its disc to 55% (pass.js `st==='used'`). */
const USED_DISC_OPACITY = 0.55
/** The punched notches at the tear are 24 pt circles, half inside the card. */
const NOTCH = SPACE.xl
/** The stamp is a 32 pt capsule (taller only when the largest text wraps it). */
const STAMP = SIZE.tag

/** Back on the left, ⋯ on the right: two glass circles, 8 pt apart from the top inset. */
export function OfferHeader({ onBack, onMore, moreLabel }: { onBack: () => void; onMore?: () => void; moreLabel: string }) {
  const insets = useSafeAreaInsets()
  return (
    <View testID="offer-header" style={[styles.header, { paddingTop: barTop(insets.top) }]}>
      <IconButton icon={Platform.OS === 'android' ? 'arrow-left' : 'chevron-left'} accessibilityLabel="Back" onPress={onBack} />
      {onMore ? <IconButton icon="ellipsis" accessibilityLabel={moreLabel} onPress={onMore} /> : null}
    </View>
  )
}

/**
 * "Redeemed 9:43 PM" (the phone's clock): white capsule, ink text, a check (the flow-4 board's .stampR). The time is
 * Geist Mono, as every time is, its space in the brand face (`MonoRun`).
 */
function Stamp({ text, clock }: { text: string; clock?: string }) {
  const bold = useBoldText()
  const word = clock && text.endsWith(clock) ? text.slice(0, -clock.length) : null
  return (
    <View testID="door-stamp" accessible accessibilityLabel={text} style={styles.stamp}>
      <Icon name="check" size={ICON.inline} color={COLOR.selectionInk} active />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.stampText]}>
        {word !== null && clock ? (
          <>
            {word}
            <Text style={font('meta', bold, FONT_FAMILY.mono[500])}>
              <MonoRun text={clock} />
            </Text>
          </>
        ) : (
          text
        )}
      </Text>
    </View>
  )
}

/**
 * The door pass (Flow 13 · 13.2, "PassDisc B · the ticket", with R3-G's code
 * row): a surface card, venue and offer on top, the liquid disc in the middle,
 * a torn edge, and the door code at the foot. Staff type the code on their
 * dashboard and tap Redeemed; nothing is held on this phone.
 *
 * Read venue → offer → validity, then the code. Redeemed stamps the disc and
 * the code goes; used tonight is still and dimmed; ended is empty with dashes.
 */
export function DoorTicket({
  venueName,
  venueType,
  offerText,
  until,
  view,
  code,
  rotatesAt,
  active,
  codeRef,
}: {
  venueName: string
  /** The venue_type key: its plate on the tile, as on the venue's page. None, or a type with no plate: the gift. */
  venueType?: string | null
  offerText: string
  /** "Valid today, till 11 PM", "Ended today at 9:52 AM"; null when there is no time to say (an offer ended early). */
  until: string | null
  view: PassView
  /** The server's six characters, while there is a fresh one. */
  code?: string
  /** When it turns, in this phone's clock (ms since the epoch). */
  rotatesAt?: number
  /** False while another screen covers this one: the ring stops ticking. */
  active: boolean
  /** The door code row, for the first-time coach mark's spotlight. */
  codeRef?: Ref<View>
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const plate = plateOf(venueType)
  return (
    <View testID="door-ticket" style={[styles.ticket, contrast ? IC_HAIRLINE : styles.edge]}>
      <View accessible accessibilityLabel={[`Offer from ${venueName}.`, `${offerText}.`, until && `${until}.`].filter(Boolean).join(' ')} style={styles.top}>
        <View style={styles.headRow}>
          <View testID="door-tile" style={styles.tile}>
            {plate ? (
              <VenuePlate type={plate} size={TILE} radius={RADIUS.thumb} testID="door-plate" />
            ) : (
              <Icon name="gift" size={ICON.nav} color={COLOR.textSecondary} />
            )}
          </View>
          <View style={styles.fill}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.label} style={[font('label', bold), styles.secondary, styles.headLabel]}>OFFER</Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.title} accessibilityRole="header" style={[font('title', bold), styles.ink, styles.venue]}>
              {venueName}
            </Text>
          </View>
        </View>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.ink, styles.offerText]}>{offerText}</Text>
        {until ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary, styles.until]}>
            {until}
          </Text>
        ) : null}
      </View>
      <View style={[styles.middle, view.door === 'used' && { opacity: USED_DISC_OPACITY }]}>
        <LiquidDisc size={DISC} level={view.level} still={view.spent} stamp={view.stamp ? <Stamp text={view.stamp} clock={view.redeemedClock} /> : undefined} testID="door-disc" />
      </View>
      <View style={styles.tear}>
        <View style={[styles.notch, styles.notchLeft]} />
        <View style={[styles.notch, styles.notchRight]} />
      </View>
      <View ref={codeRef} collapsable={false} testID="door-code-row" style={styles.bottom}>
        <DoorCode
          state={view.door}
          code={code}
          rotatesAt={rotatesAt}
          redeemedAt={view.redeemedClock}
          active={active}
          testID="door-code"
        />
      </View>
    </View>
  )
}


/** One row of the regular card: a glyph, what it says, and the plain words. */
function FactRow({ icon, title, text }: { icon: IconName; title?: string; text: string }) {
  const bold = useBoldText()
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={ICON.control} color={COLOR.textPrimary} />
      <View style={styles.fill}>
        {title ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('meta', bold, TYPE.bodyStrong.fontFamily), styles.ink]}>{title}</Text> : null}
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), title ? styles.secondary : styles.ink]}>{text}</Text>
      </View>
    </View>
  )
}

/**
 * "Let {venue} know you're a regular" (Flow 13 · 13.4): an explicit yes to the
 * people who run the place, with what they would see and what they would not.
 * Opt-in, per venue, never pre-ticked; "Not now" sends nothing and is
 * remembered on this phone. No photo, no list of regulars anywhere.
 */
export function RegularAsk({
  venueName,
  prefs,
  saving,
  onYes,
  onLater,
}: {
  venueName: string
  prefs: Pick<RegularPrefs, 'ownerName'>
  saving: boolean
  onYes: () => void
  onLater: () => void
}) {
  const bold = useBoldText()
  return (
    <View testID="regular-ask" style={styles.card}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.heading} accessibilityRole="header" style={[font('heading', bold), styles.ink]}>{`Let ${venueName} know you’re a regular`}</Text>
      <FactRow icon="eye" title={`${venueName} will see`} text={knownLine(prefs, venueName)} />
      <FactRow icon="eye-off" title={`${venueName} won’t see`} text={REGULAR_COPY.wontSee} />
      <FactRow icon="hand-heart" title="Why" text={REGULAR_COPY.why} />
      <View style={styles.actions}>
        <View style={styles.fill}>
          <Button kind="lit" size="md" label={`Let ${venueName} know`} loading={saving} onPress={onYes} />
        </View>
        <View style={styles.fill}>
          <Button kind="secondary" size="md" label="Not now" disabled={saving} onPress={onLater} />
        </View>
      </View>
    </View>
  )
}

/** They said yes: one line, and Turn off in one tap (no confirmation sheet). */
export function RegularOn({ venueName, saving, onOff }: { venueName: string; saving: boolean; onOff: () => void }) {
  const bold = useBoldText()
  const measure = useMinMeasure('bodyStrong')
  return (
    <View testID="regular-on" style={styles.rowCard}>
      <Icon name="badge-check" size={ICON.control} color={COLOR.textPrimary} />
      {/* The sentence keeps its measure and Turn off wraps under it, rather than squeeze a long venue name a word a line. */}
      <View testID="regular-on-body" style={styles.beside}>
        <Text testID="regular-on-text" maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.ink, styles.besideText, measure]}>
          {`${venueName} knows you’re a regular`}
        </Text>
        <Button kind="tertiary" size="sm" label="Turn off" loading={saving} accessibilityLabel={`Turn off: ${venueName} knows you’re a regular`} onPress={onOff} />
      </View>
    </View>
  )
}

/** After Turn off, for this visit: the card does not come straight back. */
export function RegularOff({ venueName }: { venueName: string }) {
  const bold = useBoldText()
  const done = `Done — ${venueName} no longer sees you as a regular. Offers to regulars still reach you without your name.`
  useAnnounced(done)
  return (
    <View testID="regular-off" accessibilityLiveRegion="polite" style={styles.rowCard}>
      <Icon name="check" size={ICON.control} color={COLOR.textPrimary} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.ink, styles.fill]}>
        {done}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACE.lg, paddingBottom: BAR_BOTTOM },
  ticket: { borderRadius: RADIUS.card, backgroundColor: COLOR.surface, overflow: 'hidden' },
  edge: { borderWidth: StyleSheet.hairlineWidth, borderColor: COLOR.hairline },
  /** The board's .pass: 20 round the head; then .ob 14 under it, .ov 2 under that. */
  top: { paddingHorizontal: SPACE.xl - SPACE.xs, paddingTop: SPACE.xl - SPACE.xs },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  tile: { width: TILE, height: TILE, borderRadius: RADIUS.thumb, backgroundColor: COLOR.surfaceSunken, alignItems: 'center', justifyContent: 'center' },
  headLabel: { lineHeight: HEAD_LABEL_LINE },
  venue: { marginTop: SPACE.xxs },
  offerText: { marginTop: SPACE.md + SPACE.xxs },
  until: { marginTop: SPACE.xxs },
  /** The disc 20 under the validity, the tear 24 under the disc. */
  middle: { alignItems: 'center', paddingHorizontal: SPACE.xl - SPACE.xs, paddingTop: SPACE.xl - SPACE.xs, paddingBottom: SPACE.xl },
  tear: { height: 0, borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: COLOR.hairlineStrong },
  notch: { position: 'absolute', top: -NOTCH / 2, width: NOTCH, height: NOTCH, borderRadius: RADIUS.capsule, backgroundColor: COLOR.ink },
  notchLeft: { left: -NOTCH / 2 },
  notchRight: { right: -NOTCH / 2 },
  /** The board's .cd: 20 over, 22 under. */
  bottom: { paddingHorizontal: SPACE.xl - SPACE.xs, paddingTop: SPACE.xl - SPACE.xs, paddingBottom: SPACE.xl - SPACE.xxs },
  /** At least the board's 32; taller when the largest text wraps the words inside the disc. */
  stamp: {
    minHeight: STAMP,
    maxWidth: '100%',
    paddingVertical: SPACE.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs + SPACE.xxs,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.selectionFill,
  },
  stampText: { color: COLOR.selectionInk, flexShrink: 1, textAlign: 'center' },
  card: { borderRadius: RADIUS.sheet, backgroundColor: COLOR.surface, padding: SPACE.lg, gap: SPACE.md },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, borderRadius: RADIUS.rowInCard, backgroundColor: COLOR.surface, paddingVertical: SPACE.md, paddingHorizontal: SPACE.lg },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md },
  actions: { flexDirection: 'row', gap: SPACE.sm, paddingTop: SPACE.xs },
  fill: { flex: 1 },
  /** A sentence and its action in a row that wraps (`useMinMeasure`). */
  beside: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACE.md },
  besideText: { flexGrow: 1, flexShrink: 1 },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
})
