import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { RefreshControl, StyleSheet, View } from 'react-native'
import Animated, { LinearTransition, useReducedMotion } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { TAB_BAR_CLEARANCE } from '../../app/(tabs)/_layout'
import { Spinner } from '../ds/Loader'
import { StateScreen } from '../ds/StateScreen'
import { LiveRail, OpenHeader, OpenRow, PlacesSkeleton, QuietFold, QuietRow, RefreshFailed, TypeChips } from '../places/PlaceParts'
import { apiClient } from '../../lib/apiClient'
import { COLOR, SPACE, SPRING } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { Logger } from '../../lib/logger'
import { initialPlaces, mayLoadMore, placesKey, placesReducer } from '../../lib/places'
import { mayReadNext, peekLine, PLACE_TYPES, placeRows, splitPlaces, type PlaceRow, type PlaceTypeFilter } from '../../lib/placesPane'
import { useNow } from '../../lib/useNow'
import type { HomeBrowse } from './HomeShell'

const PAGE = 30
/** The clock the strata are judged by moves a minute at a time: "In 25 min" does not need a render per second. */
const MINUTE_MS = 60_000
/** The fold opens in place on `M.settle`; Reduce Motion is a cut. */
const UNFOLD = LinearTransition.springify().stiffness(SPRING.settle.stiffness).damping(SPRING.settle.damping).mass(SPRING.settle.mass)

const keyOf = (row: PlaceRow) => row.key

/**
 * Places — the drawer's second pane (guidelines/places/places.js `placesPane`,
 * Places.html): not a list but three strata ordered by what is true tonight.
 * Live now (tiles, the only photos), Open tonight (rows with the event line)
 * and the quiet places folded behind one line with a count. Nearest first
 * inside each. A type chip row asks the server for that type.
 *
 * The server decides what is listed. A venue a real event has taken over (an
 * hour before it starts until it ends) is not in the response, and its
 * event's card in Events says "at <Venue>" instead; nothing here filters by
 * time (HM-CU04). Live is a bucket, never a number, never who.
 *
 * One virtualised list over pages of 30; no row fetches anything. The loading
 * rules are `lib/places.ts` (a reducer, tested): a new city, spot or type
 * starts the list again, a page for an old one is dropped, a failed refresh
 * keeps the list and says so, and a later page never repeats a venue. While
 * the quiet places are folded only the first few pages are read on their own
 * (`mayReadNext`): thousands of venues are not a hundred requests for a fold.
 */
export function PlacesList({ browse, active, onSummary }: { browse: HomeBrowse; active: boolean; onSummary?: (line: string | null) => void }) {
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()
  const { city, location, ready, openCityPicker } = browse
  const [venueType, setVenueType] = useState<PlaceTypeFilter>(null)
  const [quietOpen, setQuietOpen] = useState(false)
  const key = placesKey(city, location, venueType)
  // To ~100 m, as the key is: a GPS jitter is not a new request.
  const lat = location ? Number(location.latitude.toFixed(3)) : undefined
  const lon = location ? Number(location.longitude.toFixed(3)) : undefined
  const [state, dispatch] = useReducer(placesReducer, key, initialPlaces)
  const [refreshing, setRefreshing] = useState(false)
  const inFlight = useRef(false)

  // A new city, spot or type is a new list.
  useEffect(() => {
    dispatch({ type: 'reset', key })
  }, [key])

  const request = useCallback(
    async (page: number, fresh: boolean) => {
      dispatch({ type: 'request', key, page })
      try {
        const res = await apiClient.getVenues(
          { page, limit: PAGE, city: city ?? undefined, lat, lon, sortBy: lat !== undefined ? 'distance' : 'name', venueType: venueType ?? undefined, order: 'live' },
          // Opening the pane, pull-to-refresh and Try again are the person asking: never a cached page.
          fresh ? { force: true } : undefined
        )
        if (res.success && res.data) {
          dispatch({ type: 'loaded', key, page, venues: res.data.venues, hasMore: res.data.pagination.hasMore, orderedLive: (res.data.pagination.order ?? res.data.order) === 'live' })
        } else {
          Logger.warn('events', 'Could not load places', { page, error: res.error })
          dispatch({ type: 'failed', key, page })
        }
      } catch (error) {
        Logger.warn('events', 'Places request threw', { page, error: String(error) })
        dispatch({ type: 'failed', key, page })
      }
    },
    [key, city, lat, lon, venueType]
  )

  /*
   * Each time the pane is opened (or the tab comes back to it), a fresh read:
   * that is the person asking, and a venue an event has taken over since must
   * not linger from a cached page. Not before the city is decided — a list for
   * no city would be the wrong list, briefly.
   */
  useEffect(() => {
    if (!active || !ready) return
    void request(1, true)
  }, [active, ready, request])

  const now = useNow(MINUTE_MS)
  const strata = splitPlaces(state.venues, now)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await request(1, true)
    } finally {
      setRefreshing(false)
    }
  }, [request])

  const loadMore = async () => {
    if (inFlight.current || !mayLoadMore(state) || !mayReadNext(state, quietOpen, strata.quiet.length > 0)) return
    inFlight.current = true
    try {
      await request(state.page + 1, false)
    } finally {
      inFlight.current = false
    }
  }

  // The drawer keeps this one line at peek, when only its header shows.
  const summary = peekLine(strata, state.hasMore)
  useEffect(() => onSummary?.(summary), [onSummary, summary])
  const rows = placeRows(strata, quietOpen, state.hasMore)

  const renderItem = useCallback(
    ({ item }: { item: PlaceRow }) => {
      switch (item.kind) {
        case 'live':
          return <LiveRail venues={item.venues} now={now} />
        case 'openHeader':
          return <OpenHeader />
        case 'open':
          return <OpenRow venue={item.venue} now={now} />
        case 'fold':
          return <QuietFold count={item.count} more={item.more} open={item.open} onPress={() => setQuietOpen((o) => !o)} />
        case 'quiet':
          return <QuietRow venue={item.venue} />
      }
    },
    [now]
  )

  // A chosen type keeps the chips up through its loading and its failure: a tap must never take the row away.
  const showChips = venueType !== null || state.venues.length > 0
  const typeLabel = PLACE_TYPES.find((t) => t.venueType === venueType)?.label ?? 'All'
  const header = (
    <View>
      {showChips ? <TypeChips selected={venueType} onSelect={setVenueType} /> : null}
      {state.refreshFailed ? <RefreshFailed onRetry={() => void refresh()} /> : null}
    </View>
  )

  const empty =
    state.status === 'idle' || state.status === 'loading' ? (
      <PlacesSkeleton />
    ) : state.status === 'error' ? (
      <View style={styles.state} testID="places-error">
        <StateScreen
          icon="cloud-off"
          title="Couldn’t load places"
          body="Check your connection and try again."
          actions={[{ label: 'Try again', onPress: () => void refresh() }]}
        />
      </View>
    ) : (
      <View style={styles.state} testID="places-empty">
        <StateScreen
          icon="map-pin"
          title={venueType ? `No ${typeLabel.toLowerCase()} in ${city ?? 'your area'} yet` : city ? `No places in ${city} yet` : 'No places near you yet'}
          body={venueType ? 'Try another type, or another city.' : 'We list venues as they come on. Try another city.'}
          actions={[{ label: 'Change city', kind: 'secondary', onPress: openCityPicker }]}
        />
      </View>
    )

  return (
    <Animated.FlatList
      data={rows}
      keyExtractor={keyOf}
      renderItem={renderItem}
      itemLayoutAnimation={reduceMotion ? undefined : UNFOLD}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={state.loadingMore ? <View style={styles.more}><Spinner /></View> : null}
      testID="places-list"
      onEndReachedThreshold={0.5}
      onEndReached={() => void loadMore()}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            H.threshold()
            void refresh()
          }}
          tintColor={COLOR.textSecondary}
        />
      }
      contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + SPACE.xl }]}
      initialNumToRender={8}
      windowSize={7}
      showsVerticalScrollIndicator={false}
      // A tap on a row or a chip lands first time with the keyboard up from the Pulse's search.
      keyboardShouldPersistTaps="handled"
    />
  )
}

const styles = StyleSheet.create({
  list: { paddingTop: SPACE.sm },
  state: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.xl },
  more: { alignItems: 'center', paddingVertical: SPACE.lg },
})
