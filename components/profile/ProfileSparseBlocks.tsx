/**
 * The person page's state 2 (SCRUM-1042, owner OK of the combined A + B + C board): a person who has shown you who they
 * are, with little on their profile. After the lens blocks (B: tonight, then the bio) come A, their other photos and
 * "Say hi · ask {name} about", and C, "You've both been to". Each draws only what it is given: the photos and the bio
 * arrive only once they are shown to you, and the shared events are the server's (`GET /users/:ref/shared-events`).
 */
import { Image } from 'expo-image'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { OpenerRow } from '../ds/LensBlocks'
import { font, useBoldText, useIncreaseContrast, useSelection } from '../ds/shared'
import { Icon } from '../ui/Icon'
import type { SharedEvent } from '../../lib/apiClient'
import { COLOR, FONT_FAMILY, ICON, MATERIAL, MAX_FONT_SCALE, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { sayHiAbout } from '../../lib/roomLens'
import { calendarDate } from '../../lib/time'

/** The page shows this many shared events, then See all (orchestrator rule: cap, then paginate). */
export const SHARED_SHOWN = 5
/** At most three of their other photos in the row; past that the last says "+N". */
const PHOTOS_SHOWN = 3
// design-exception: 148, the board's photo tile (`.phs i`); no size token is a gallery tile
const PHOTO_HEIGHT = 148
// design-exception: 52, the board's event cover (`.evr .cv`); between `SIZE.avatarMd` and the 56 list art
const COVER = 52
// design-exception: 12, the board's cover corner (`.evr .cv`); between `thumb` 8 and `rowInCard` 16
const COVER_RADIUS = 12

/** "12 Oct · Champaca Bookstore": the app's one date grammar, in the event's own zone. */
export const sharedEventLine = (e: SharedEvent) =>
  [calendarDate(e.startTime, { timeZone: e.timezone }), e.venueName].filter(Boolean).join(' · ')

function Label({ text }: { text: string }) {
  const bold = useBoldText()
  const quiet = useIncreaseContrast() ? COLOR.textPrimary : COLOR.textSecondary
  return <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('note', bold, FONT_FAMILY.brand[500]), { color: quiet }]}>{text}</Text>
}

/** A: their other photos (the first is the hero), only when there is more than one. Tapping one opens the viewer there. */
export function OtherPhotos({ photos, onOpen, testID }: { photos: readonly string[]; onOpen: (index: number) => void; testID?: string }) {
  const bold = useBoldText()
  const others = photos.slice(1)
  if (!others.length) return null
  const shown = others.slice(0, PHOTOS_SHOWN)
  const more = others.length - shown.length
  return (
    <View testID={testID} style={styles.photos}>
      {shown.map((uri, i) => (
        <Pressable
          key={`${i}:${uri}`}
          testID={testID && `${testID}-${i}`}
          onPress={() => onOpen(i + 1)}
          accessibilityRole="imagebutton"
          accessibilityLabel={`Photo ${i + 2} of ${photos.length}`}
          style={styles.photo}
        >
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          {more > 0 && i === shown.length - 1 ? (
            <View style={styles.more}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('note', bold, FONT_FAMILY.brand[500]), styles.ink]}>{`+${more}`}</Text>
            </View>
          ) : null}
        </Pressable>
      ))}
    </View>
  )
}

/** A: "Say hi · ask {name} about", built from what they wrote (their first interest, their work). Nothing to build from: nothing. */
export function SayHi({ name, topics, onPick, testID }: { name: string; topics: readonly string[]; onPick: (text: string) => void; testID?: string }) {
  const bold = useBoldText()
  const quiet = useIncreaseContrast() ? COLOR.textPrimary : COLOR.textSecondary
  if (!topics.length) return null
  return (
    <View testID={testID}>
      <Label text={`Say hi · ask ${name} about`} />
      <View style={styles.rows}>
        {topics.map((t, i) => <OpenerRow key={t} label={t} onPress={() => onPick(sayHiAbout(t))} testID={testID && `${testID}-${i}`} />)}
      </View>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('note', bold), { color: quiet }, styles.foot]}>Tapping one puts it in Message; you send it.</Text>
    </View>
  )
}

/** One event you have both been to: its cover (or a calendar on the surface), its title on one line, the date and place. */
export function SharedEventRow({ event, testID }: { event: SharedEvent; testID?: string }) {
  const bold = useBoldText()
  const quiet = useIncreaseContrast() ? COLOR.textPrimary : COLOR.textSecondary
  const line = sharedEventLine(event)
  return (
    <View testID={testID} accessible accessibilityLabel={`${event.title}, ${line}`} style={styles.event}>
      <View style={styles.cover}>
        {event.coverImageUrl ? (
          <Image source={{ uri: event.coverImageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <Icon name="calendar" size={ICON.inline} color={COLOR.textSecondary} />
        )}
      </View>
      <View style={styles.eventText}>
        <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.title} style={[font('control', bold, FONT_FAMILY.brand[500]), styles.ink]}>{event.title}</Text>
        <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('note', bold), { color: quiet }]}>{line}</Text>
      </View>
    </View>
  )
}

/** C: "You've both been to", newest first, five, then See all with the whole count. None: no card at all. */
export function SharedEvents({ events, total, onSeeAll, testID }: { events: readonly SharedEvent[]; total: number; onSeeAll: () => void; testID?: string }) {
  const bold = useBoldText()
  const sel = useSelection()
  if (!events.length) return null
  return (
    <View testID={testID}>
      <Label text="You’ve both been to" />
      <View>
        {events.slice(0, SHARED_SHOWN).map((e, i) => <SharedEventRow key={e.id} event={e} testID={testID && `${testID}-${i}`} />)}
      </View>
      {total > SHARED_SHOWN ? (
        <Pressable testID={testID && `${testID}-all`} onPress={onSeeAll} accessibilityRole="button" accessibilityLabel={`See all ${total} events you have both been to`} style={styles.seeAll}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.title} style={[font('control', bold, FONT_FAMILY.brand[500]), { color: sel.glyph }]}>
            {'See all '}
            <Text style={font('control', bold, FONT_FAMILY.mono[500])}>{String(total)}</Text>
          </Text>
          <Icon name="chevron-right" size={ICON.inline} color={sel.glyph} />
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  ink: { color: COLOR.textPrimary },
  /** `.phs`: three across, 8 apart, 148 tall, 16 round. */
  photos: { flexDirection: 'row', gap: SPACE.sm },
  photo: { flex: 1, height: PHOTO_HEIGHT, borderRadius: RADIUS.rowInCard, overflow: 'hidden', backgroundColor: COLOR.surface },
  more: { position: 'absolute', right: SPACE.sm, bottom: SPACE.sm, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xxs, borderRadius: RADIUS.capsule, backgroundColor: MATERIAL.scrimPill },
  /** `.opn`: rows 12 under the label, 8 apart; the note 10 under. */
  rows: { marginTop: SPACE.md, gap: SPACE.sm },
  foot: { marginTop: SPACE.sm + SPACE.xxs },
  /** `.evr`: 8 above and below each (so 8 under the label), 12 between cover and words. */
  event: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.sm },
  cover: { width: COVER, height: COVER, borderRadius: COVER_RADIUS, overflow: 'hidden', backgroundColor: COLOR.surface, alignItems: 'center', justifyContent: 'center' },
  eventText: { flex: 1, minWidth: 0 },
  seeAll: { minHeight: SIZE.targetIos, marginTop: SPACE.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
})
