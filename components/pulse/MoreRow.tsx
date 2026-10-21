import { memo, type Ref } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { EventCard } from '../ds/EventCard'
import type { Rect } from '../ds/chatShared'
import { IconButton } from '../ds/IconButton'
import { ScrimPill } from '../ds/MonoFamily'
import { font } from '../ds/shared'
import type { BlendnEvent } from '../../lib/api'
import { COLOR, SPACE } from '../../lib/design/tokens'

type Props = {
  event: BlendnEvent
  title: string
  time: string
  venue: string
  distance?: string
  cover: string | null
  /** "Checked in" or "Ended". */
  note: string | null
  saved: boolean
  /** The coach mark's hole, when this row is the first card the page draws. */
  coachRef?: Ref<View>
  onPress: (event: BlendnEvent) => void
  onPressIn: (event: BlendnEvent) => void
  onPeek: (event: BlendnEvent, anchor: Rect) => void
  onSave: (event: BlendnEvent) => void
}

/**
 * One Everything-else row: the DS `EventCard row`, its "Checked in" / "Ended" pill and the save heart. Memoised on
 * per-row values (this event's saved flag and note, plus stable handlers), so saving one row re-renders that row and not
 * the list: the handlers take the event, they are not made per row.
 */
export const MoreRow = memo(function MoreRow({ event, title, time, venue, distance, cover, note, saved, coachRef, onPress, onPressIn, onPeek, onSave }: Props) {
  return (
    <View style={styles.row}>
      {/* The coach mark's hole is the card, not the pill beside it. */}
      <View style={styles.fill} ref={coachRef} collapsable={false}>
        <EventCard
          kind="row"
          title={title}
          time={time}
          venue={venue}
          distance={distance}
          cover={cover}
          onPress={() => onPress(event)}
          onPressIn={() => onPressIn(event)}
          onLongPress={(anchor) => onPeek(event, anchor)}
          testID={`pulse-row-${event.id}`}
        />
      </View>
      {note ? (
        <ScrimPill testID={`pulse-row-note-${event.id}`}>
          <Text style={[font('caption', false), styles.ink]}>{note}</Text>
        </ScrimPill>
      ) : null}
      {/* Saving is the whole of `event_favorites` and what the Going tab's Saved is built from: a silent toggle beside the row. */}
      <IconButton
        icon="heart"
        selected={saved}
        accessibilityLabel={saved ? `Saved, ${title}` : `Save ${title}`}
        onPress={() => onSave(event)}
        testID={`pulse-row-save-${event.id}`}
      />
    </View>
  )
})

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.gutter, paddingBottom: SPACE.md },
  fill: { flex: 1, minWidth: 0 },
  ink: { color: COLOR.textPrimary },
})
