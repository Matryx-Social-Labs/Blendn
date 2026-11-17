import { Children, Fragment, useEffect, useState, type ReactNode } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import { Facepile, type Face } from '../ds/Facepile'
import { CategoryPlate } from '../ds/EventCard'
import { Sheet } from '../ds/Sheet'
import { font, IC_HAIRLINE, PRESSED_WASH, SELECTION, useBoldText, useGround, useIncreaseContrast, type Ground } from '../ds/shared'
import { Icon, type IconName } from '../ui/Icon'
import { apiClient, type EventApiItem } from '../../lib/apiClient'
import { COMMUNITY_GUIDELINES_URL } from '../../lib/communityGuidelines'
import { COLOR, FONT_FAMILY, ICON, MATERIAL, MAX_FONT_SCALE, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { openInApp } from '../../lib/links'
import { Logger } from '../../lib/logger'
import { printable } from '../../lib/pulseSections'
import { hereNowCount, roomHost, roomInfoLine } from '../../lib/roomInfo'
import { showRoomReportOptions } from '../../lib/safetyUtils'
import { ContainedCover } from '../ds/LinkPreviewCard'

/** The board's row (`.xli`): 56 tall, 14 in from the card's edge, the glyph 12 from the words. */
const ROW_INSET = SPACE.md + SPACE.xxs
/** Increase Contrast's hairline: 1 pt, as SettingsGroup draws it. */
const CONTRAST_LINE = 1
const EMBER = SELECTION.ember
const ROSE = SELECTION.rose

export type RoomInfoSheetProps = {
  visible: boolean
  onClose: () => void
  eventId: string | null
  /** The room's own title: what the head says until the event's detail answers (or if it never does). */
  title: string
  /** The room's chat; with none yet there is nothing to mute or report. */
  chatGroupId: string | null
  /** Inside now, the Room's number. Said in full from five up (`printable`). */
  hereCount: number
  /** The first faces of who else is here (the you-card's pile). Three are drawn. */
  faces: Face[]
  /** "Muted for 1 hour" while the room is muted, else null. */
  mutedLabel: string | null
  onMute: () => void
  onSeeAll: () => void
  onCheckOut: () => void
}

/**
 * Room info as a sheet over the room (Flow 5 C6, I-A, owner-approved): the event (cover, a 2-line title, "Tonight · 6 PM ·
 * High Ultra Lounge"); Mute this room, Community guidelines, Report this room; the host as the org (an ember megaphone and
 * "Host": never a face, a creature or a person's name); In the room (three faces, the exact count, See all); and the one
 * exit, Check out, through the room's own confirm. Leaving the chat while staying checked in is Mute. No new motion: the
 * sheet's standard rise and the rows' press.
 */
export function RoomInfoSheet({ visible, onClose, eventId, title, chatGroupId, hereCount, faces, mutedLabel, onMute, onSeeAll, onCheckOut }: RoomInfoSheetProps) {
  const bold = useBoldText()
  const event = useEventDetail(visible ? eventId : null)
  const host = roomHost(event?.organizer)
  const line = event ? roomInfoLine({ ...event, venueName: event.venueName ?? event.venue_name }) : ''
  const cover = event?.coverImageUrl ?? event?.cover_image_url ?? null
  const count = hereNowCount(printable(hereCount))

  // The sheet closes first, then the next thing opens: one sheet on screen at a time.
  const then = (next: () => void) => () => {
    onClose()
    next()
  }

  return (
    <Sheet visible={visible} onClose={onClose} flush testID="room-info">
      <View style={styles.blocks}>
        <View testID="room-info-event" accessible accessibilityRole="header" accessibilityLabel={[event?.title ?? title, line].filter(Boolean).join(', ')} style={styles.event}>
          <View style={styles.cover}>
            {cover ? <ContainedCover uri={cover} auto /> : <CategoryPlate />}
          </View>
          <View style={styles.words}>
            <Text numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE.rowTitle} style={[font('rowTitle', bold, FONT_FAMILY.brand[700]), styles.ink]}>
              {event?.title ?? title}
            </Text>
            {line ? (
              <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.note} style={[font('note', bold), styles.secondary]}>
                {line}
              </Text>
            ) : null}
          </View>
        </View>

        <Card testID="room-info-rows">
          {chatGroupId ? (
            <InfoRow testID="room-info-mute" icon="bell-off" title={mutedLabel ?? 'Mute this room'} hint="Only your pushes. Nobody is told." trail="chevron-right" onPress={then(onMute)} />
          ) : null}
          <InfoRow
            testID="room-info-guidelines"
            icon="shield"
            title="Community guidelines"
            trail="external-link"
            label="Community guidelines, opens in browser"
            onPress={() => {
              openInApp(COMMUNITY_GUIDELINES_URL).catch((error) => Logger.warn('chat', 'Could not open the community guidelines', { error }))
            }}
          />
          {chatGroupId ? (
            <InfoRow
              testID="room-info-report"
              icon="flag"
              title="Report this room"
              hint="For what no single message shows."
              trail="chevron-right"
              onPress={then(() => showRoomReportOptions(chatGroupId))}
            />
          ) : null}
        </Card>

        <Card testID="room-info-people-card">
          {host ? (
            <InfoRow
              testID="room-info-host"
              leading={
                <HostMark testID="room-info-host-mark" />
              }
              title={host.name}
              hint="Host"
              label={`Host, ${host.name}`}
            />
          ) : null}
          <InfoRow
            testID="room-info-people"
            leading={<PeoplePile faces={faces} />}
            title="In the room"
            hint={count ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.note} style={styles.mono}>{count}</Text> : null}
            hintTail={count ? ' here now' : undefined}
            label={count ? `In the room, ${count} here now, See all` : 'In the room, See all'}
            trail={
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE.control} style={[font('control', bold, FONT_FAMILY.brand[700]), { color: ROSE.glyph }]}>
                See all
              </Text>
            }
            onPress={then(onSeeAll)}
          />
        </Card>

        <Card testID="room-info-exit">
          <InfoRow testID="room-info-check-out" icon="log-out" title="Check out" hint="You leave the room and its chat." destructive onPress={then(onCheckOut)} />
        </Card>
      </View>
    </Sheet>
  )
}

/**
 * A card's fill on the sheet it sits in: `surface` on iOS's glass (the board's `.xlist`), `surfaceSunken` on Android, whose
 * sheet is itself `surface` (a `surface` card there has no edge at all: the audit's R3 on the old menu, seen again here).
 */
export const cardFill = (ground: Ground): string => (ground === 'surface' ? COLOR.surfaceSunken : COLOR.surface)

/** Three faces, each cut out of the card it sits on. */
function PeoplePile({ faces }: { faces: Face[] }) {
  return <Facepile testID="room-info-pile" faces={faces} max={3} total={3} text="" ring={cardFill(useGround())} accessibilityLabel="" />
}

/** The board's grouped rows (`.xlist`): one card, a hairline between rows and none under the last. */
function Card({ children, testID }: { children: ReactNode; testID: string }) {
  const contrast = useIncreaseContrast()
  const fill = cardFill(useGround())
  return (
    <View testID={testID} style={[styles.card, { backgroundColor: fill }, contrast && IC_HAIRLINE]}>
      {Children.toArray(children).map((row, i) => (
        <Fragment key={i}>
          {i ? <View style={[styles.hairline, contrast && styles.hairlineContrast]} /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  )
}

/** The event's detail while the sheet is open: its cover, its time and venue, and its host. Cached by the client for 30 s. */
export function useEventDetail(eventId: string | null): EventApiItem | null {
  const [event, setEvent] = useState<EventApiItem | null>(null)
  useEffect(() => {
    if (!eventId) return
    let live = true
    apiClient
      .getEvent(eventId)
      .then((result) => {
        if (live && result.success && result.data) setEvent(result.data)
      })
      .catch((error) => Logger.warn('chat', 'Room info could not load the event', { error }))
    return () => {
      live = false
    }
  }, [eventId])
  return event
}

/** The host's mark: an ember megaphone, never a face or a creature (the host is the org, I-A). The Room info page uses it too. */
export function HostMark({ testID }: { testID?: string }) {
  return (
    <View testID={testID} style={styles.hostMark}>
      <Icon name="megaphone" size={ICON.control} color={EMBER.glyph} />
    </View>
  )
}

/** One of the board's grouped rows: a glyph (or a mark), the words, and a chevron, a link glyph or a word at the end. */
function InfoRow({
  icon,
  leading,
  title,
  hint,
  hintTail,
  label,
  trail,
  destructive = false,
  onPress,
  testID,
}: {
  icon?: IconName
  leading?: ReactNode
  title: string
  hint?: ReactNode
  /** After a mono `hint` ("214" + " here now"). */
  hintTail?: string
  label?: string
  trail?: 'chevron-right' | 'external-link' | ReactNode
  destructive?: boolean
  onPress?: () => void
  testID: string
}) {
  const bold = useBoldText()
  const ink = destructive ? COLOR.destructive : COLOR.textPrimary
  const end = typeof trail === 'string' ? <Icon name={trail as IconName} size={ICON.inline} color={COLOR.textTertiary} /> : trail
  const body = (
    <>
      {leading ?? (icon ? <Icon name={icon} size={ICON.control} color={ink} /> : null)}
      <View style={styles.words}>
        <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.rowTitle} style={[font('rowTitle', bold), { color: ink }]}>
          {title}
        </Text>
        {hint ? (
          <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.note} style={[font('note', bold), styles.secondary]}>
            {hint}
            {hintTail}
          </Text>
        ) : null}
      </View>
      {end}
    </>
  )
  const spoken = label ?? [title, typeof hint === 'string' ? hint : null].filter(Boolean).join(', ')
  // A row with nothing to do (the host) is read as text, never as a dimmed button.
  if (!onPress)
    return (
      <View testID={testID} accessible accessibilityLabel={spoken} style={styles.row}>
        {body}
      </View>
    )
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole={trail === 'external-link' ? 'link' : 'button'}
      accessibilityLabel={spoken}
      android_ripple={{ color: PRESSED_WASH.android }}
      style={({ pressed }) => [styles.row, pressed && Platform.OS === 'ios' && styles.pressed]}
    >
      {body}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  blocks: { gap: SPACE.lg },
  event: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  cover: { width: SIZE.disc, height: SIZE.disc, borderRadius: RADIUS.rowInCard, overflow: 'hidden', backgroundColor: COLOR.surface },
  words: { flex: 1, minWidth: 0 },
  card: { borderRadius: RADIUS.tile, overflow: 'hidden' },
  row: {
    minHeight: SIZE.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: ROW_INSET,
    paddingVertical: SPACE.xs,
  },
  // Drawn over the row's top edge and taking no height, as the board's inset hairline: three rows are 168, not 168.7.
  hairline: { height: StyleSheet.hairlineWidth, marginBottom: -StyleSheet.hairlineWidth, zIndex: 1, backgroundColor: COLOR.hairline },
  hairlineContrast: { height: CONTRAST_LINE, marginBottom: -CONTRAST_LINE, backgroundColor: MATERIAL.hairlineIncreaseContrast },
  pressed: { backgroundColor: PRESSED_WASH.ios },
  hostMark: {
    width: SIZE.circleButtonSm,
    height: SIZE.circleButtonSm,
    borderRadius: RADIUS.capsule,
    backgroundColor: EMBER.fill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: EMBER.edge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  mono: { fontFamily: FONT_FAMILY.mono[500], fontVariant: ['tabular-nums'] },
})
