import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import { Platform, RefreshControl, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import Animated, { LinearTransition, useReducedMotion } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { TAB_BAR_CLEARANCE } from '../../app/(tabs)/_layout'
import { Banner } from '../ds/Banner'
import { Spinner } from '../ds/Loader'
import { StateScreen } from '../ds/StateScreen'
import { SectionReveal } from '../pulse/Rail'
import { KindGrid, LiveSection, NearSection, OpenSection } from '../places/PlaceCards'
import { PlacesFilterSheet } from '../places/PlacesFilterSheet'
import { PlacesSearch, PlacesTitle } from '../places/PlacesHeader'
import { StickyBar, STICKY_BAR_AFTER } from '../pulse/StickyBar'
import { PlacesSkeleton, QuietFold, QuietRow, RefreshFailed } from '../places/PlaceParts'
import { SectionHeader } from '../ds/SectionHeader'
import { apiClient, type VenueListItem } from '../../lib/apiClient'
import { COLOR, SPACE, SPRING } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { Logger } from '../../lib/logger'
import { getNetworkState, subscribeNetworkState } from '../../lib/networkStatus'
import { initialPlaces, mayLoadMore, placesKey, placesReducer, readStamp } from '../../lib/places'
import {
  activeFilterCount,
  mayReadNext,
  nearPins,
  NEAR_COUNT,
  NO_FILTERS,
  peekLine,
  PLACES_STICKY,
  PLACE_TYPES,
  placeRows,
  splitPlaces,
  statLine,
  type NearPin,
  type PlaceFilters,
  type PlaceRow,
  type PlaceStrata,
  type WhatsOn,
} from '../../lib/placesPane'
import { clockTime } from '../../lib/roomMoments'
import { useNow } from '../../lib/useNow'
import type { HomeBrowse } from './HomeShell'

const PAGE = 30
/** The clock the strata are judged by moves a minute at a time: "In 25 min" does not need a render per second. */
const MINUTE_MS = 60_000
/** The fold opens in place on `M.settle`; Reduce Motion is a cut. */
const UNFOLD = LinearTransition.springify().stiffness(SPRING.settle.stiffness).damping(SPRING.settle.damping).mass(SPRING.settle.mass)
const NO_STRATA: PlaceStrata = { live: [], open: [], quiet: [] }
const NO_VENUES: VenueListItem[] = []

type NearState = { key: string; venues: VenueListItem[] } | null
const keyOf = (row: PlaceRow) => row.key

/**
 * Places — the drawer's second pane (BUILD-SPEC §B; places.html): not a list but sections ordered by what is
 * true tonight. A header with the stat line and the search; Live now (glow tiles), Open tonight (cards),
 * Near you (five rows, numbered on the map), What kind of night (plates) and, behind one line, the rest.
 * Nearest first inside each.
 *
 * The server decides what is listed. A venue a real event has taken over (an hour before it starts until it
 * ends) is not in the response, and its event's card in Events says "at <Venue>" instead; nothing here filters
 * by time (HM-CU04). Live is a bucket, never a number, never who.
 *
 * One virtualised list; every section is one row and no row fetches anything. The paged list is
 * `lib/places.ts` (a reducer, tested): a new city, spot, kind, search or radius starts it again, a page for an
 * old one is dropped, a failed refresh keeps the list and says so, and a later page never repeats a venue.
 * The rows are `placeRows` (pure, tested). Near you is the one extra request (five by distance, with a fix).
 * While the rest is folded only the pages that hold live and open venues are read (`mayReadNext`).
 */
export function PlacesList({
  browse,
  active,
  onSummary,
  onNearPins,
  onShowNearOnMap,
}: {
  browse: HomeBrowse
  active: boolean
  onSummary?: (line: string | null) => void
  /** The five numbered pins for the map (empty when Near you is not on screen). */
  onNearPins?: (pins: NearPin[]) => void
  /** "Show on map": the drawer goes to half and the map fits the pins. */
  onShowNearOnMap?: () => void
}) {
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()
  const { city, location, ready, openCityPicker, requestLocation } = browse
  const [filters, setFilters] = useState<PlaceFilters>(NO_FILTERS)
  const { venueType, whatsOn, radiusKm } = filters
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [quietOpen, setQuietOpen] = useState(false)
  const [search, setSearch] = useState('')
  const searching = search.trim().length > 0
  // To ~100 m, as the key is: a GPS jitter is not a new request.
  const lat = location ? Number(location.latitude.toFixed(3)) : undefined
  const lon = location ? Number(location.longitude.toFixed(3)) : undefined
  const hasFix = lat !== undefined
  const key = placesKey(city, location, venueType, searching ? search.trim() : null, radiusKm)
  const [state, dispatch] = useReducer(placesReducer, key, initialPlaces)
  const [refreshing, setRefreshing] = useState(false)
  const inFlight = useRef(false)
  const network = useSyncExternalStore(subscribeNetworkState, getNetworkState)

  // A new city, spot, kind, search or radius is a new list.
  useEffect(() => {
    dispatch({ type: 'reset', key })
  }, [key])

  const request = useCallback(
    async (page: number) => {
      dispatch({ type: 'request', key, page })
      try {
        const res = await apiClient.getVenues(
          {
            page,
            limit: PAGE,
            city: city ?? undefined,
            lat,
            lon,
            sortBy: hasFix ? 'distance' : 'name',
            venueType: venueType ?? undefined,
            order: 'live',
            search: searching ? search.trim() : undefined,
            radius: hasFix && radiusKm !== null ? radiusKm : undefined,
          },
          // Never a cached page, for any page: with live-first ordering a venue moves up the order between
          // reads, so a page served from cache against a fresh page 1 skips and repeats venues.
          { force: true }
        )
        if (res.success && res.data) {
          dispatch({
            type: 'loaded',
            key,
            page,
            venues: res.data.venues,
            hasMore: res.data.pagination.hasMore,
            orderedLive: (res.data.pagination.order ?? res.data.order) === 'live',
            total: res.data.pagination.totalCount,
            at: readStamp(),
          })
        } else {
          Logger.warn('events', 'Could not load places', { page, error: res.error })
          dispatch({ type: 'failed', key, page })
        }
      } catch (error) {
        Logger.warn('events', 'Places request threw', { page, error: String(error) })
        dispatch({ type: 'failed', key, page })
      }
    },
    [key, city, lat, lon, hasFix, venueType, search, searching, radiusKm]
  )

  /*
   * Each time the pane is opened (or the tab comes back to it), a fresh read:
   * that is the person asking, and a venue an event has taken over since must
   * not linger from a cached page. Not before the city is decided — a list for
   * no city would be the wrong list, briefly.
   */
  useEffect(() => {
    if (!active || !ready) return
    void request(1)
  }, [active, ready, request])

  // Near you: the five nearest, with a fix. One read per ~100 m; the answer is kept with what it was of.
  const nearKey = hasFix ? `${city ?? '-'}|${lat},${lon}` : null
  const [nearState, setNearState] = useReducer((_: NearState, next: NearState) => next, null)
  const readNear = useCallback(async () => {
    if (!nearKey) return
    try {
      const res = await apiClient.getVenues({ page: 1, limit: NEAR_COUNT, city: city ?? undefined, lat, lon, sortBy: 'distance' }, { force: true })
      if (res.success && res.data) setNearState({ key: nearKey, venues: res.data.venues })
    } catch (error) {
      Logger.warn('events', 'Near you request threw', { error: String(error) })
    }
  }, [nearKey, city, lat, lon])
  useEffect(() => {
    if (!active || !ready) return
    void readNear()
  }, [active, ready, readNear])
  const near = nearState && nearState.key === nearKey ? nearState.venues : NO_VENUES

  const now = useNow(MINUTE_MS)
  const strata = useMemo(() => splitPlaces(state.venues, now), [state.venues, now])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await Promise.all([request(1), readNear()])
    } finally {
      setRefreshing(false)
    }
  }, [request, readNear])

  const loadMore = async () => {
    const may = searching ? state.hasMore : mayReadNext(state, quietOpen, strata.quiet.length > 0)
    if (inFlight.current || !mayLoadMore(state) || !may) return
    inFlight.current = true
    try {
      await request(state.page + 1)
    } finally {
      inFlight.current = false
    }
  }

  // The drawer keeps this one line at peek, when only its header shows.
  const summary = peekLine(strata, state.hasMore)
  useEffect(() => onSummary?.(summary), [onSummary, summary])

  const rows = useMemo(
    () => placeRows({ status: state.status, strata, more: state.hasMore, quietOpen, near, hasFix, filters, searching }),
    [state.status, strata, state.hasMore, quietOpen, near, hasFix, filters, searching]
  )

  // The map's pins: Near you's rows, while Near you is on screen.
  const showsNear = active && rows.some((r) => r.kind === 'near' && r.hasFix)
  const pins = useMemo(() => (showsNear ? nearPins(near) : []), [showsNear, near])
  useEffect(() => onNearPins?.(pins), [onNearPins, pins])

  // Sections rise once, on the first load of the pane: not on a refresh, a return or a filter.
  const revealPending = useRef(true)
  useEffect(() => {
    if (state.status === 'ready') revealPending.current = false
  }, [state.status])

  const focus = useCallback((next: WhatsOn) => setFilters((f) => ({ ...f, whatsOn: next })), [])
  const chooseKind = useCallback((next: PlaceFilters['venueType']) => setFilters((f) => ({ ...f, venueType: next })), [])
  const toggleFold = useCallback(() => setQuietOpen((o) => !o), [])
  const seeAllLive = useCallback(() => focus('live'), [focus])
  const seeAllOpen = useCallback(() => focus('open'), [focus])
  const openFilters = useCallback(() => setFiltersOpen(true), [])
  const clearKind = useCallback(() => chooseKind(null), [chooseKind])
  // The list has scrolled past its title: the sticky search takes its bar.
  const [barOn, setBarOn] = useState(false)
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => setBarOn(e.nativeEvent.contentOffset.y > STICKY_BAR_AFTER), [])

  const countFor = useCallback(
    async (draft: PlaceFilters) => {
      const res = await apiClient.getVenues(
        { page: 1, limit: 1, city: city ?? undefined, lat, lon, venueType: draft.venueType ?? undefined, radius: hasFix && draft.radiusKm !== null ? draft.radiusKm : undefined },
        { force: true }
      )
      return res.success && res.data ? res.data.pagination.totalCount : null
    },
    [city, lat, lon, hasFix]
  )

  const stat = useMemo(() => statLine({ total: state.total, strata: searching ? NO_STRATA : strata, more: state.hasMore, kind: venueType }), [state.total, strata, state.hasMore, venueType, searching])
  const typeLabel = PLACE_TYPES.find((t) => t.venueType === venueType)?.label ?? 'All'
  const offline = network === 'offline' && state.venues.length > 0

  const renderItem = useCallback(
    ({ item }: { item: PlaceRow }) => {
      switch (item.kind) {
        case 'title':
          return (
            <View>
              <PlacesTitle city={city} onPressCity={openCityPicker} stat={stat} />
              {offline ? (
                <View style={styles.banner}>
                  <Banner kind="offline" text="Offline. Live as of" mono={state.readAt ? clockTime(state.readAt) : undefined} testID="places-offline" />
                </View>
              ) : null}
              {state.refreshFailed && !offline ? <RefreshFailed onRetry={() => void refresh()} /> : null}
            </View>
          )
        case 'search':
          return (
            <StickyBar scrolled={barOn}>
              <PlacesSearch
                onSearch={setSearch}
                searching={searching && state.status === 'loading'}
                filterCount={activeFilterCount(filters)}
                onPressFilter={openFilters}
                venueType={venueType}
                onClearKind={clearKind}
              />
            </StickyBar>
          )
        case 'live':
          return (
            <SectionReveal index={0} pending={revealPending}>
              <LiveSection venues={item.venues} total={item.total} focused={item.focused} now={now} onSeeAll={seeAllLive} />
            </SectionReveal>
          )
        case 'open':
          return (
            <SectionReveal index={1} pending={revealPending}>
              <OpenSection venues={item.venues} total={item.total} focused={item.focused} now={now} onSeeAll={seeAllOpen} />
            </SectionReveal>
          )
        case 'near':
          return (
            <SectionReveal index={2} pending={revealPending}>
              <NearSection venues={item.venues} hasFix={item.hasFix} onAsk={() => void requestLocation()} onShowOnMap={onShowNearOnMap} />
            </SectionReveal>
          )
        case 'areas':
          // The By area section waits for the owner's neighbourhood list (SHOW_AREA_SECTION).
          return null
        case 'kinds':
          return (
            <SectionReveal index={3} pending={revealPending}>
              <KindGrid onSelect={chooseKind} />
            </SectionReveal>
          )
        case 'fold':
          return (
            <View style={styles.foldRow}>
              <QuietFold count={item.count} more={item.more} open={item.open} nearest={item.nearest} onPress={toggleFold} />
            </View>
          )
        case 'quiet':
          return <QuietRow venue={item.venue} />
        case 'label':
          return (
            <View style={styles.label}>
              <SectionHeader title={item.text} testID="places-results-header" />
            </View>
          )
        case 'skeleton':
          return <PlacesSkeleton />
        case 'error':
          return (
            <View style={styles.state} testID="places-error">
              <StateScreen
                icon="cloud-off"
                title="Couldn’t load places"
                body="Check your connection and try again."
                actions={[{ label: 'Try again', onPress: () => void refresh() }]}
              />
            </View>
          )
        case 'empty':
          return (
            <View style={styles.state} testID="places-empty">
              {item.reason === 'search' ? (
                <StateScreen icon="search" title={`No places match “${search.trim()}”`} body="Try another name or area." />
              ) : item.reason === 'filters' ? (
                <StateScreen
                  icon="sliders-horizontal"
                  title={whatsOn === 'live' ? 'Nothing is live right now' : whatsOn === 'open' ? 'Nothing is open tonight' : 'No places match these filters'}
                  body="Try widening the filters."
                  actions={[{ label: 'Clear filters', kind: 'secondary', onPress: () => setFilters(NO_FILTERS) }]}
                />
              ) : (
                <StateScreen
                  icon="map-pin"
                  title={item.reason === 'kind' ? `No ${typeLabel.toLowerCase()} in ${city ?? 'your area'} yet` : city ? `No places in ${city} yet` : 'No places near you yet'}
                  body={item.reason === 'kind' ? 'Try another type, or another city.' : 'We list venues as they come on. Try another city.'}
                  actions={[{ label: 'Change city', kind: 'secondary', onPress: openCityPicker }]}
                />
              )}
            </View>
          )
      }
    },
    [
      city, openCityPicker, stat, searching, state.status, state.readAt, state.refreshFailed, filters, venueType, offline, now, search, whatsOn, typeLabel, barOn,
      chooseKind, refresh, requestLocation, onShowNearOnMap, toggleFold, seeAllLive, seeAllOpen, openFilters, clearKind,
    ]
  )

  return (
    <>
      <Animated.FlatList
        data={rows}
        keyExtractor={keyOf}
        renderItem={renderItem}
        itemLayoutAnimation={reduceMotion ? undefined : UNFOLD}
        stickyHeaderIndices={PLACES_STICKY}
        onScroll={onScroll}
        scrollEventThrottle={16}
        ListFooterComponent={state.loadingMore ? <View style={styles.more}><Spinner /></View> : null}
        testID="places-list"
        onEndReachedThreshold={0.5}
        onEndReached={() => void loadMore()}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              // iOS's UIRefreshControl ticks by itself at the threshold; a second tick doubled it. Android has no such tick.
              if (Platform.OS === 'android') H.threshold()
              void refresh()
            }}
            tintColor={COLOR.textSecondary}
          />
        }
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + SPACE.xl }]}
        initialNumToRender={10}
        windowSize={7}
        showsVerticalScrollIndicator={false}
        // A tap on a row, a plate or a chip lands first time with the keyboard up from the search.
        keyboardShouldPersistTaps="handled"
      />
      <PlacesFilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        hasFix={hasFix}
        onApply={(next) => {
          setFilters(next)
          setFiltersOpen(false)
        }}
        countFor={countFor}
      />
    </>
  )
}

const styles = StyleSheet.create({
  list: { paddingTop: SPACE.sm },
  state: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.xl },
  more: { alignItems: 'center', paddingVertical: SPACE.lg },
  banner: { paddingHorizontal: SPACE.gutter, paddingBottom: SPACE.md },
  foldRow: { paddingTop: SPACE.xs },
  label: { paddingHorizontal: SPACE.gutter, paddingBottom: SPACE.sm },
})
