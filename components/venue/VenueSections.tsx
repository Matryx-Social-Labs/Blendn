import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { Button } from '../ds/Button'
import { EventCard } from '../ds/EventCard'
import { MapCard } from '../ds/MapCard'
import { TimeBadge } from '../ds/MonoFamily'
import { SectionHeader } from '../ds/SectionHeader'
import { font, minTarget, PRESSED_WASH, useBoldText } from '../ds/shared'
import { TimeRing } from '../ds/TimeRing'
import { Icon } from '../ui/Icon'
import ScalePress from '../motion/ScalePress'
import type { VenueDetail } from '../../lib/apiClient'
import { COLOR, FONT_FAMILY, ICON, PRESS, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { distanceText } from '../../lib/placesPane'
import { startsLabel } from '../../lib/roomMoments'
import { useSessionTime } from '../../lib/useSessionTime'
import { liveNowWord } from '../../lib/home'
import { ringWords, timeRange, UPCOMING_SHOWN } from '../../lib/venuePage'
import { VenueMap } from './VenueMap'

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
        <Text style={[font('bodyStrong', bold), styles.ink]}>{`You’re live at ${name}`}</Text>
        <Text style={[font('meta', bold), styles.secondary]}>People live here can see you. Open the room from the Blend’n button.</Text>
      </View>
    </View>
  )
}

/** An event has the place: the venue defers, and its card is the way in. */
export function EventOnCard({ tonight, now, onPress }: { tonight: NonNullable<VenueDetail['tonight']> | null; now: number; onPress: () => void }) {
  const bold = useBoldText()
  const when = tonight ? startsLabel({ startsAt: tonight.startTime, endsAt: tonight.endTime }, now).text : ''
  return (
    <ScalePress
      testID="venue-event-on"
      onPress={tonight ? onPress : undefined}
      disabled={!tonight}
      pressedScale={PRESS.scale}
      accessibilityRole={tonight ? 'button' : 'text'}
      accessibilityLabel={
        tonight ? `On here tonight. ${tonight.title}. An event is on, so this room is the event’s room: check in to it.` : 'An event is on here. Check in to it to join its room.'
      }
      style={styles.eventOn}
    >
      <View style={styles.eventOnHead}>
        {when ? <TimeBadge when={when} /> : null}
        <Text style={[font('label', bold), styles.secondary]}>ON HERE TONIGHT</Text>
      </View>
      {tonight ? (
        <>
          <Text style={[font('title', bold), styles.ink]}>{tonight.title}</Text>
          <Text style={[font('meta', bold), styles.secondary]}>
            {`Doors ${timeRange(tonight.startTime, tonight.endTime)}. `}
            While an event is on, this room is the event’s room: check in to it.
          </Text>
        </>
      ) : (
        <Text style={[font('meta', bold), styles.secondary]}>An event is on here. While it is, this room is the event’s room: check in to it.</Text>
      )}
    </ScalePress>
  )
}

/** Tonight here: the event's card, or one sentence about going live. */
export function TonightHere({
  tonight,
  venue,
  km,
  now,
  onOpen,
}: {
  tonight: VenueDetail['tonight']
  venue: string
  km: number | null
  now: number
  onOpen: (eventId: string) => void
}) {
  const bold = useBoldText()
  const when = tonight ? startsLabel({ startsAt: tonight.startTime, endsAt: tonight.endTime }, now).text : ''
  return (
    <Section>
      <SectionHeader title="Tonight here" />
      {tonight && when ? (
        <EventCard
          kind="hero"
          title={tonight.title}
          time={when}
          venue={venue}
          distance={distanceText(km) ?? undefined}
          cover={tonight.coverImageUrl}
          onPress={() => onOpen(tonight.id)}
          style={styles.eventCard}
          testID="venue-tonight"
        />
      ) : (
        <Text style={[font('body', bold), styles.secondary]}>No event tonight. When you’re here, go live and see who else is.</Text>
      )}
    </Section>
  )
}

/** Coming up here: the date in Geist Mono, the title, the going count. */
export function UpcomingList({
  rows,
  onOpen,
}: {
  /** Every upcoming event the server sent, soonest first; three show, the rest behind See all. */
  rows: { id: string; title: string; day: string; going: string | null }[]
  onOpen: (eventId: string) => void
}) {
  const bold = useBoldText()
  const [all, setAll] = useState(false)
  const shown = all ? rows : rows.slice(0, UPCOMING_SHOWN)
  return (
    <Section>
      <SectionHeader title="Coming up here" action={rows.length > UPCOMING_SHOWN && !all ? { label: 'See all', onPress: () => setAll(true) } : undefined} />
      {shown.map((r) => (
        <Pressable
          key={r.id}
          onPress={() => onOpen(r.id)}
          android_ripple={{ color: PRESSED_WASH.android }}
          accessibilityRole="button"
          accessibilityLabel={[r.title, r.day, r.going].filter(Boolean).join(', ')}
          style={styles.upcoming}
          testID={`venue-upcoming-${r.id}`}
        >
          <Text numberOfLines={1} style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.secondary, styles.tabular, styles.day]}>
            {r.day}
          </Text>
          <Text numberOfLines={1} style={[font('bodyStrong', bold), styles.ink, styles.upcomingTitle]}>
            {r.title}
          </Text>
          {r.going ? <Text style={[font('meta', bold), styles.secondary]}>{r.going}</Text> : null}
        </Pressable>
      ))}
    </Section>
  )
}

/**
 * Who’s here: only somebody live here may see who. Everyone else gets the one
 * sentence; somebody live gets the bucket and the way into the room.
 */
export function WhosHere({ live, onSeeWho }: { live: VenueDetail['live']; onSeeWho: () => void }) {
  const bold = useBoldText()
  const liveWord = liveNowWord(live.liveNow)
  return (
    <Section>
      <SectionHeader title="Who’s here" />
      {live.youAreLive ? (
        <>
          <Text style={[font('meta', bold), styles.secondary]}>
            {liveWord ? `${liveWord} live · ` : ''}
            Pseudonyms only, until someone reveals.
          </Text>
          <Button kind="secondary" size="md" icon="users" label="See who’s here" onPress={onSeeWho} testID="venue-see-who" />
        </>
      ) : (
        <View style={styles.note}>
          <View style={styles.noteIcon}>
            <Icon name="eye-off" size={ICON.inline} color={COLOR.textSecondary} />
          </View>
          <Text style={[font('meta', bold), styles.secondary, styles.fill]}>
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
      accessibilityLabel={`The Board, tonight. Heading to ${title}? Find someone to go with.`}
      style={styles.boardRow}
      testID="venue-board"
    >
      <Icon name="users" size={ICON.nav} />
      <View style={styles.fill}>
        <Text style={[font('bodyStrong', bold), styles.ink]}>The Board · tonight</Text>
        <Text numberOfLines={1} style={[font('meta', bold), styles.secondary]}>
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
      <Text
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
          <Text style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.ink]}>{open ? 'Show less' : 'Read more'}</Text>
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
  onDirections,
  onCopy,
}: {
  venue: VenueDetail['venue']
  km: number | null
  onDirections: () => void
  onCopy: () => void
}) {
  const bold = useBoldText()
  const hasCoords = !!venue.latitude && !!venue.longitude
  const distance = distanceText(km)
  return (
    <Section>
      <SectionHeader title="Where" />
      <View style={styles.card}>
        <View style={styles.whereTop}>
          <Icon name="map-pin" size={ICON.nav} />
          <View style={styles.fill}>
            <Text style={[font('bodyStrong', bold), styles.ink]}>{venue.name}</Text>
            {venue.address ? <Text style={[font('body', bold), styles.secondary]}>{venue.address}</Text> : null}
            {venue.city || distance ? (
              <Text style={[font('meta', bold), styles.secondary]}>
                {venue.city}
                {distance ? (
                  <>
                    {venue.city ? ' · ' : ''}
                    <Text style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.tabular]}>{distance}</Text>
                  </>
                ) : null}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.whereActions}>
          <Button kind="secondary" size="raised" icon="navigation" label="Directions" onPress={onDirections} style={styles.fill} testID="venue-directions" />
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
      {hasCoords ? (
        <MapCard
          venue={venue.name}
          address={venue.address ?? undefined}
          map={<VenueMap latitude={venue.latitude as number} longitude={venue.longitude as number} />}
          onPress={onDirections}
          testID="venue-map"
        />
      ) : null}
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
        <Text style={[font('meta', bold), styles.secondary]}>
          Own this place? <Text style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.ink, styles.underline]}>Claim it</Text>
        </Text>
        <Icon name="arrow-up-right" size={ICON.inline} color={COLOR.textSecondary} />
      </Pressable>
    </View>
  )
}

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
  upcoming: { minHeight: SIZE.primary, flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  // A date never wraps ("Sun 25 / Oct"): it is as wide as it needs, no narrower than the column, so titles still line up.
  day: { minWidth: DAY_WIDTH, flexShrink: 0 },
  upcomingTitle: { flex: 1 },
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
