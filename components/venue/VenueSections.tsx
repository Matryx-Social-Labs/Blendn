import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { Button } from '../ds/Button'
import { MonoRun } from '../ds/MonoFamily'
import { SectionHeader } from '../ds/SectionHeader'
import { font, minTarget, PRESSED_WASH, useBoldText } from '../ds/shared'
import { TimeRing } from '../ds/TimeRing'
import { Icon } from '../ui/Icon'
import ScalePress from '../motion/ScalePress'
import type { VenueDetail } from '../../lib/apiClient'
import { COLOR, FONT_FAMILY, ICON, MAX_FONT_SCALE, PRESS, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { distanceText } from '../../lib/placesPane'
import { useSessionTime } from '../../lib/useSessionTime'
import { liveNowWord } from '../../lib/home'
import { DateStamp } from '../ds/DateStamp'
import { Image } from 'expo-image'
import { eventClock } from '../../lib/time'
import { hasMoreThanShown, ringWords, UPCOMING_SHOWN, type UpcomingRow } from '../../lib/venuePage'

/** The ring around the live card (the design's 88, a 56 face inside). */
const RING = 88
const FACE = SIZE.primary
const EVENT_HEIGHT = 220
const READ_LINES = 3
/** The date column on "Coming up here" and the Board row's height (fullpages.js). */
const DAY_WIDTH = 84
const BOARD_ROW = 64

/** A section: its heading, then its content 12 apart. */
export function Section({ children }: { children: React.ReactNode }) {
  return <View style={styles.section}>{children}</View>
}

/**
 * You’re live here: the ring reads "Live · 42 min left". The design draws your
 * creature inside it; the page does not know today’s nickname until the room
 * answers, so it holds the radio glyph rather than a name it cannot read.
 */
export function LiveCard({ live, name, onZero }: { live: VenueDetail['live']; name: string; onZero: () => void }) {
  const bold = useBoldText()
  const time = useSessionTime(live, onZero)
  return (
    <View style={[styles.card, styles.liveCard]} testID="venue-live-card">
      <TimeRing text={ringWords(time)} size={RING}>
        <View style={styles.face} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name="radio" size={ICON.nav} />
        </View>
      </TimeRing>
      <View style={styles.cardText}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.ink]}>{`You’re live at ${name}`}</Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>People live here can see you. Open the room from the Blend’n button.</Text>
      </View>
    </View>
  )
}

/*
 * Flow 4 V-A's Tonight here (`tonightCard`, `.tn`): one surface card, the night's cover at 56, a live label in its own
 * slot, the title over two lines and how busy it is ("20+ here now"). Nothing on: one card that says so and what to do.
 */
export function TonightHere({
  tonight,
  liveNow,
  now,
  onOpen,
}: {
  tonight: VenueDetail['tonight']
  liveNow: VenueDetail['live']['liveNow']
  now: number
  onOpen: (eventId: string) => void
}) {
  const bold = useBoldText()
  const on = tonight && Date.parse(tonight.startTime) <= now
  const label = tonight ? (on ? `● Live · till ${eventClock(tonight.endTime, tonight.timezone)}` : `Tonight · ${eventClock(tonight.startTime, tonight.timezone)}`) : ''
  const busy = liveNowWord(liveNow)
  return (
    <View style={styles.section}>
      <SectionHeader title="Tonight here" />
      {tonight ? (
        <ScalePress
          haptic={false}
          onPress={() => onOpen(tonight.id)}
          accessibilityRole="button"
          accessibilityLabel={[tonight.title, label.replace('● ', ''), busy ? `${busy} here now` : null].filter(Boolean).join(', ')}
          style={styles.tonight}
          testID="venue-tonight"
        >
          <View style={styles.thumb}>
            {tonight.coverImageUrl ? <Image source={{ uri: tonight.coverImageUrl }} contentFit="cover" style={StyleSheet.absoluteFill} accessible={false} /> : <DateStamp iso={tonight.startTime} timeZone={tonight.timezone} />}
          </View>
          <View style={styles.tonightWords}>
            <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.label} style={[font('label', bold), on ? styles.live : styles.secondary]}>
              {label}
            </Text>
            <Text numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('rowTitle', bold), styles.ink]}>
              {tonight.title}
            </Text>
            {busy ? (
              <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
                <Text style={{ fontFamily: FONT_FAMILY.mono[500] }}>{busy}</Text> here now
              </Text>
            ) : null}
          </View>
        </ScalePress>
      ) : (
        <View style={[styles.tonight, styles.tonightNone]} accessible testID="venue-tonight-none">
          <View style={styles.tonightWords}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('rowTitle', bold), styles.ink]}>Nothing on here tonight</Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>When you’re here, go live and see who else is.</Text>
          </View>
        </View>
      )}
    </View>
  )
}

/** Flow 4 V-A's Coming up here: date-led rows (the stamp at 48), the title over two lines, its time in Geist Mono. */
export function UpcomingList({
  rows,
  total,
  onOpen,
  onSeeAll,
}: {
  rows: UpcomingRow[]
  total: number
  onOpen: (eventId: string) => void
  onSeeAll: () => void
}) {
  const bold = useBoldText()
  return (
    <View style={styles.section}>
      <SectionHeader title="Coming up here" count={total} action={hasMoreThanShown(total) ? { label: 'See all', onPress: onSeeAll } : undefined} />
      {rows.slice(0, UPCOMING_SHOWN).map((r) => (
        <Pressable
          key={r.id}
          onPress={() => onOpen(r.id)}
          android_ripple={{ color: PRESSED_WASH.android }}
          accessibilityRole="button"
          accessibilityLabel={`${r.title}, ${r.day}, ${r.time}`}
          style={styles.upcoming}
          testID={`venue-upcoming-${r.id}`}
        >
          <DateStamp iso={r.start} timeZone={r.timeZone} size={STAMP} />
          <View style={styles.tonightWords}>
            <Text numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('rowTitle', bold), styles.ink]}>
              {r.title}
            </Text>
            <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.secondary]}>
              {r.time}
            </Text>
          </View>
          <Icon name="chevron-right" size={ICON.control} color={COLOR.textSecondary} />
        </Pressable>
      ))}
    </View>
  )
}

export function WhosHere({ live, onSeeWho }: { live: VenueDetail['live']; onSeeWho: () => void }) {
  const bold = useBoldText()
  const liveWord = liveNowWord(live.liveNow)
  return (
    <Section>
      <SectionHeader title="Who’s here" />
      {live.youAreLive ? (
        <>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
            {liveWord ? `${liveWord} live · ` : ''}
            Pseudonyms only, until someone reveals.
          </Text>
          <Button kind="lit" size="md" icon="users" label="See who’s here" onPress={onSeeWho} testID="venue-see-who" />
        </>
      ) : (
        <View style={styles.note}>
          <View style={styles.noteIcon}>
            <Icon name="eye-off" size={ICON.inline} color={COLOR.textSecondary} />
          </View>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary, styles.fill]}>
            Go live here to see who else is. Everyone is a creature until they choose otherwise.
          </Text>
        </View>
      )}
    </Section>
  )
}

/** The Board row (an event here tonight, before its doors): going alone? find someone to go with. */
export function BoardRow({ title, onPress }: { title: string; onPress: () => void }) {
  const bold = useBoldText()
  return (
    <ScalePress
      onPress={onPress}
      pressedScale={PRESS.scale}
      accessibilityRole="button"
      accessibilityLabel={`The Lobby, tonight. Heading to ${title}? Find someone to go with.`}
      style={styles.boardRow}
      testID="venue-board"
    >
      <Icon name="users" size={ICON.nav} />
      <View style={styles.fill}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.ink]}>The Lobby · tonight</Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} numberOfLines={1} style={[font('meta', bold), styles.secondary]}>
          Heading here tonight? Find someone to go with.
        </Text>
      </View>
      <Icon name="chevron-right" size={ICON.control} color={COLOR.textSecondary} />
    </ScalePress>
  )
}

/** About: the owner's words, three lines and Read more; nothing is cut for a screen reader. */
export function About({ text }: { text: string }) {
  const bold = useBoldText()
  const [open, setOpen] = useState(false)
  const [clipped, setClipped] = useState(false)
  return (
    <Section>
      <SectionHeader title="About" />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body}
        numberOfLines={open ? undefined : READ_LINES}
        onTextLayout={(e) => !open && setClipped(e.nativeEvent.lines.length > READ_LINES)}
        style={[font('body', bold), styles.secondary]}
        testID="venue-about"
      >
        {text}
      </Text>
      {clipped || open ? (
        <Pressable
          onPress={() => setOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityLabel={open ? 'Show less' : 'Read more'}
          hitSlop={(minTarget() - SPACE.xl) / 2}
          style={styles.readMore}
        >
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.ink]}>{open ? 'Show less' : 'Read more'}</Text>
        </Pressable>
      ) : null}
    </Section>
  )
}

/**
 * Where: the name, the address, Directions and copy, then the map card. A
 * picture of the place and a pin; the fence is never drawn. No coordinate
 * (or the 0,0 of an unset one) draws no map, only the card.
 */
export function Where({
  venue,
  km,
  onCopy,
}: {
  venue: VenueDetail['venue']
  km: number | null
  onCopy: () => void
}) {
  const bold = useBoldText()
  const distance = distanceText(km)
  // The city once: an address that already names it ("…, Bengaluru 560001") does not get it again underneath (r7 L4).
  const city = venue.city && !venue.address?.toLowerCase().includes(venue.city.toLowerCase()) ? venue.city : null
  return (
    <Section>
      <SectionHeader title="Where" />
      <View style={styles.card}>
        <View style={styles.whereTop}>
          <Icon name="map-pin" size={ICON.nav} />
          <View style={styles.fill}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.ink]}>{venue.name}</Text>
            {venue.address ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.secondary]}>{venue.address}</Text> : null}
            {city || distance ? (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
                {city}
                {distance ? (
                  <>
                    {city ? ' · ' : ''}
                    <Text style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.tabular]}>
                      <MonoRun text={distance} />
                    </Text>
                  </>
                ) : null}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.whereActions}>
          {venue.address ? (
            <Pressable
              onPress={onCopy}
              accessibilityRole="button"
              accessibilityLabel="Copy address"
              android_ripple={{ color: PRESSED_WASH.android }}
              style={styles.copy}
              testID="venue-copy"
            >
              <Icon name="copy" size={ICON.control} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </Section>
  )
}

/** "Own this place? Claim it ↗": the last line, never a button in the dock. The server decides whether it shows. */
export function ClaimLine({ onPress }: { onPress: () => void }) {
  const bold = useBoldText()
  return (
    <View style={styles.claimRule}>
      <Pressable
        testID="claim-venue-link"
        onPress={onPress}
        accessibilityRole="link"
        accessibilityLabel="Own this place? Claim it"
        accessibilityHint="Opens the Blend’n dashboard in your browser"
        hitSlop={(minTarget() - SPACE.xl) / 2}
        style={styles.claim}
      >
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
          Own this place? <Text style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.ink, styles.underline]}>Claim it</Text>
        </Text>
        <Icon name="arrow-up-right" size={ICON.inline} color={COLOR.textSecondary} />
      </Pressable>
    </View>
  )
}

/** The Tonight card's cover and the Coming up stamp (`th56`, `stamp(48)`). */
const THUMB = SIZE.disc
const STAMP = SPACE.xxxl
// design-exception: the board's Tonight card has 20 pt corners (`.tn`), between RADIUS.rowInCard and RADIUS.mediaInCard.
const TONIGHT_RADIUS = 20

const styles = StyleSheet.create({
  section: { gap: SPACE.md },
  eventCard: { height: EVENT_HEIGHT },
  // design-exception: places.js draws the ring and its words in a row, centred, 14 apart (between SPACE.md and lg)
  liveCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  card: { borderRadius: RADIUS.mediaInCard, backgroundColor: COLOR.surface, padding: SPACE.lg, gap: SPACE.md },
  face: { width: FACE, height: FACE, borderRadius: RADIUS.capsule, backgroundColor: COLOR.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, gap: SPACE.xs },
  eventOn: { borderRadius: RADIUS.mediaInCard, backgroundColor: COLOR.surface, padding: SPACE.lg, gap: SPACE.sm },
  eventOnHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  // `.gr4.v`: 64 at least, 8 above and below, 12 between the stamp, the words and the chevron.
  upcoming: { minHeight: SIZE.tabBar, paddingVertical: SPACE.sm, flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  // `.tn`: the surface, 20 corners, 12 in, a hairline; nothing on is 16 in.
  tonight: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, padding: SPACE.md, borderRadius: TONIGHT_RADIUS, backgroundColor: COLOR.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: COLOR.hairline },
  tonightNone: { padding: SPACE.lg },
  tonightWords: { flex: 1, minWidth: 0, gap: SPACE.xxs },
  thumb: { width: THUMB, height: THUMB, borderRadius: SPACE.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: COLOR.surfaceSunken },
  live: { color: COLOR.live },
  // A date never wraps ("Sun 25 / Oct"): it is as wide as it needs, no narrower than the column, so titles still line up.
  day: { minWidth: DAY_WIDTH, flexShrink: 0 },
  upcomingTitle: { flex: 1 },
  upcomingTime: { flexShrink: 0 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm },
  noteIcon: { marginTop: SPACE.xxs },
  boardRow: {
    minHeight: BOARD_ROW,
    borderRadius: RADIUS.rowInCard,
    backgroundColor: COLOR.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
  },
  readMore: { alignSelf: 'flex-start' },
  whereTop: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md },
  whereActions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  copy: {
    width: SIZE.control,
    height: SIZE.control,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLOR.hairline, paddingTop: SPACE.lg },
  claim: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, alignSelf: 'flex-start' },
  underline: { textDecorationLine: 'underline' },
  fill: { flex: 1 },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  tabular: { fontVariant: ['tabular-nums'] },
})
