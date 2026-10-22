import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'

import { Button } from '../ds/Button'
import { Spinner } from '../ds/Loader'
import { Sheet } from '../ds/Sheet'
import { font, PRESSED_WASH, useBoldText } from '../ds/shared'
import { apiClient } from '../../lib/apiClient'
import { COLOR, FONT_FAMILY, SIZE, SPACE } from '../../lib/design/tokens'
import { Logger } from '../../lib/logger'
import { appendUpcoming, upcomingRows, UPCOMING_PAGE, type UpcomingRow } from '../../lib/venuePage'

/** A row is as tall as a target, and fixed: the list can place any row without measuring the ones above it. */
const ROW = SIZE.primary
/** The list's own height, as a share of the screen: it scrolls inside the tall sheet and windows its rows, so thousands cost a screenful. */
const LIST_SHARE = 0.6
const DAY_WIDTH = 84

/**
 * Every coming event at a place, a page at a time (Flow 11 · the venue page, "See all"). It opens on what the page
 * already has and asks for the rest by cursor (`GET /venues/:id/upcoming`, `UPCOMING_PAGE` a time), so a place with
 * hundreds of events costs one page, then one more each time it is asked.
 *
 * The list is a FlatList with a height of its own inside the tall sheet: it windows its rows (fixed heights) and
 * asks for the next page as the end comes into view. A failed page keeps what is there and says so with Try again;
 * nothing is ever shown as the end that is not.
 */
export function UpcomingSheet({
  visible,
  onClose,
  venueId,
  first,
  firstCursor,
  total,
  onOpen,
}: {
  visible: boolean
  onClose: () => void
  venueId: string
  /** The rows the page already has. */
  first: UpcomingRow[]
  /** Where the rest starts; null when `first` is all of them. */
  firstCursor: string | null
  total: number
  onOpen: (eventId: string) => void
}) {
  const bold = useBoldText()
  const listHeight = Math.round(useWindowDimensions().height * LIST_SHARE)
  const [rows, setRows] = useState<UpcomingRow[]>(first)
  const [cursor, setCursor] = useState<string | null>(firstCursor)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // Each open starts from what the page has now (the page may have been read again since): state adjusted in render.
  const [wasVisible, setWasVisible] = useState(visible)
  if (visible !== wasVisible) {
    setWasVisible(visible)
    if (visible) {
      setRows(first)
      setCursor(firstCursor)
      setFailed(false)
    }
  }

  const more = useCallback(
    (from: string) => {
      setLoading(true)
      setFailed(false)
      apiClient
        .getVenueUpcoming(venueId, from, UPCOMING_PAGE)
        .then((res) => {
          if (!alive.current) return
          if (!res.success || !res.data) return setFailed(true)
          setRows((have) => appendUpcoming(have, upcomingRows(res.data?.events, UPCOMING_PAGE)))
          setCursor(res.data.pagination.hasMore ? res.data.pagination.nextCursor : null)
        })
        .catch((error) => {
          Logger.warn('events', 'Could not load more of the venue’s events', { error: String(error) })
          if (alive.current) setFailed(true)
        })
        .finally(() => alive.current && setLoading(false))
    },
    [venueId]
  )

  // Opening it brings in the first page of the rest: the person asked for all of them.
  const asked = useRef(false)
  useEffect(() => {
    if (!visible) {
      asked.current = false
      return
    }
    if (!asked.current && cursor) {
      asked.current = true
      more(cursor)
    }
  }, [visible, cursor, more])

  return (
    <Sheet visible={visible} onClose={onClose} title={`Coming up here · ${total}`} detents={['tall']} testID="venue-upcoming-sheet">
      <FlatList
        testID="venue-upcoming-list"
        data={rows}
        keyExtractor={(r) => r.id}
        style={{ height: listHeight }}
        nestedScrollEnabled
        onEndReachedThreshold={0.5}
        // The end comes into view: the next page. Never while one is on its way or after one failed (Try again is the ask).
        onEndReached={() => cursor && !loading && !failed && more(cursor)}
        getItemLayout={(_d, index) => ({ length: ROW, offset: ROW * index, index })}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              onClose()
              onOpen(item.id)
            }}
            android_ripple={{ color: PRESSED_WASH.android }}
            accessibilityRole="button"
            accessibilityLabel={[item.title, item.day, item.going].filter(Boolean).join(', ')}
            style={styles.row}
            testID={`venue-upcoming-all-${item.id}`}
          >
            <Text numberOfLines={1} style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.secondary, styles.day]}>
              {item.day}
            </Text>
            <Text numberOfLines={1} style={[font('bodyStrong', bold), styles.ink, styles.title]}>
              {item.title}
            </Text>
            {item.going ? <Text style={[font('meta', bold), styles.secondary]}>{item.going}</Text> : null}
          </Pressable>
        )}
        ListFooterComponent={
          <View style={styles.foot}>
            {loading ? (
              <View accessible accessibilityLabel="Loading more" style={styles.center}>
                <Spinner size={20} />
              </View>
            ) : failed ? (
              <View style={styles.center}>
                <Text style={[font('meta', bold), styles.secondary]}>Couldn’t load more.</Text>
                <Button kind="secondary" size="sm" label="Try again" onPress={() => cursor && more(cursor)} testID="venue-upcoming-retry" />
              </View>
            ) : null}
          </View>
        }
      />
    </Sheet>
  )
}

const styles = StyleSheet.create({
  row: { height: ROW, flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  day: { width: DAY_WIDTH },
  title: { flex: 1 },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  foot: { paddingTop: SPACE.sm },
  center: { alignItems: 'center', gap: SPACE.sm },
})
