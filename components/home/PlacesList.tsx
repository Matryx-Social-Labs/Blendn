import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
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
import { QuietFold, QuietRow, RefreshFailed } from '../places/PlaceParts'
import { PlacesSkeleton } from '../places/PlacesSkeleton'
import { SectionHeader } from '../ds/SectionHeader'
import { apiClient, type VenueListItem } from '../../lib/apiClient'
import { searchTermOf } from '../../lib/searchTerm'
import { SPACE, SPRING } from '../../lib/design/tokens'
import { roundCoordinate } from '../../lib/coordinates'
import { Logger } from '../../lib/logger'
import { getNetworkState, subscribeNetworkState } from '../../lib/networkStatus'
import { initialPlaces, mayLoadMore, placesKey, placesReducer, readStamp } from '../../lib/places'
import {
  activeFilterCount,
  LEAD_ROWS,
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
import { rateLimitWait } from '../../lib/rateLimited'
import { RESORT_WINDOW_MS, reflowsOnSpring, resortDelay } from '../../lib/resort'
import { resortFadeIn, resortIn, resortOut } from '../motion/presence'
import { clockTime } from '../../lib/roomMoments'
import { RateLimitedBanner } from '../system/RateLimitedBanner'
import { useNow } from '../../lib/useNow'
import { usePullToRefresh } from '../../lib/usePullToRefresh'
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
  // A kind chosen (the grid, the chip or the sheet) opens the fold: its places are under it, and a closed fold under
  // "91 BREWERIES" read as no results (audit A23). State adjusted in render, so every way a kind is set is covered.
  const [kindSeen, setKindSeen] = useState(filters.venueType)
  if (filters.venueType !== kindSeen) {
    setKindSeen(filters.venueType)
    if (filters.venueType) setQuietOpen(true)
  }
  const [search, setSearch] = useState('')
  // Under 2 characters is no search (the server's floor, admin #751): the normal list.
  const term = searchTermOf(search)
  const searching = term !== null
  // To ~100 m, as the key is: a GPS jitter is not a new request.
  const lat = location ? roundCoordinate(location.latitude) : undefined
  const lon = location ? roundCoordinate(location.longitude) : undefined
  const hasFix = lat !== undefined
  const key = placesKey(city, location, venueType, term, radiusKm)
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
            search: term ?? undefined,
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
          dispatch({ type: 'failed', key, page, rateLimit: rateLimitWait([res]) ?? undefined })
        }
      } catch (error) {
        Logger.warn('events', 'Places request threw', { page, error: String(error) })
        dispatch({ type: 'failed', key, page })
      }
    },
    [key, city, lat, lon, hasFix, venueType, term, radiusKm]
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

  // The wait is over: read again, the page it was refused on.
  const rateLimitPage = state.rateLimit?.page ?? 1
  const rateLimitDone = useCallback(() => {
    dispatch({ type: 'rateLimitDone', key })
    void (rateLimitPage <= 1 ? refresh() : request(rateLimitPage))
  }, [key, rateLimitPage, refresh, request])

  // The drawer keeps this one line at peek, when only its header shows.
  const summary = peekLine(strata, state.hasMore)
  useEffect(() => onSummary?.(summary), [onSummary, summary])

  const rows = useMemo(
    () => placeRows({ status: state.status, strata, more: state.hasMore, quietOpen, near, hasFix, filters, searching, rateLimited: state.rateLimit !== null, total: state.total }),
    [state.status, strata, state.hasMore, quietOpen, near, hasFix, filters, searching, state.rateLimit, state.total]
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
  const clearFilter = useCallback((field: keyof PlaceFilters) => setFilters((f) => ({ ...f, [field]: NO_FILTERS[field] })), [])
  // The list has scrolled past its title: the sticky search takes its bar.
  const [barOn, setBarOn] = useState(false)
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => setBarOn(e.nativeEvent.contentOffset.y > STICKY_BAR_AFTER), [])
  // The branded pull (motion #18): the monogram traces as you pull and H.threshold plays once when it arms; Android keeps the platform's.
  const pullRefresh = useCallback(() => void refresh(), [refresh])
  const pull = usePullToRefresh({ refreshing, onRefresh: pullRefresh, onScroll })

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

  const renderRow = useCallback(
    ({ item }: { item: PlaceRow }) => {
      switch (item.kind) {
        case 'title':
          return (
            <View>
              <PlacesTitle stat={stat} />
              {offline ? (
                <View style={styles.banner}>
                  <Banner kind="offline" text="Offline. Live as of" mono={state.readAt ? clockTime(state.readAt) : undefined} testID="places-offline" />
                </View>
              ) : null}
              {state.refreshFailed && !offline ? <RefreshFailed onRetry={() => void refresh()} /> : null}
              {/* Asked too fast: the wait, counting down, and then it reads again (Flow 15 #15). */}
              {state.rateLimit && state.rateLimit.page <= 1 ? (
                <View style={styles.banner}>
                  <RateLimitedBanner seconds={state.rateLimit.seconds} onDone={rateLimitDone} testID="places-rate-limited" />
                </View>
              ) : null}
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
                filters={filters}
                onClear={clearFilter}
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
              <QuietFold count={item.count} more={item.more} open={item.open} nearest={item.nearest} placeKind={item.placeKind} onPress={toggleFold} />
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
                <StateScreen icon="search" title={`No places match “${term}”`} body="Try another name or area." />
              ) : item.reason === 'filters' ? (
                <StateScreen
                  icon="sliders-horizontal"
                  title={whatsOn === 'live' ? 'Nothing is live right now' : whatsOn === 'open' ? 'Nothing is open tonight' : 'No places match these filters'}
                  body="Try widening the filters."
                  actions={[{ label: 'Clear filters', kind: 'lit', onPress: () => setFilters(NO_FILTERS) }]}
                />
              ) : (
                <StateScreen
                  icon="map-pin"
                  title={item.reason === 'kind' ? `No ${typeLabel.toLowerCase()} in ${city ?? 'your area'} yet` : city ? `No places in ${city} yet` : 'No places near you yet'}
                  body={item.reason === 'kind' ? 'Try another type, or another city.' : 'We list venues as they come on. Try another city.'}
                  actions={[{ label: 'Change city', kind: 'lit', onPress: openCityPicker }]}
                />
              )}
            </View>
          )
      }
    },
    [
      city, openCityPicker, stat, searching, state.status, state.readAt, state.refreshFailed, state.rateLimit, rateLimitDone, filters, offline, now, term, whatsOn, typeLabel, barOn,
      chooseKind, refresh, requestLocation, onShowNearOnMap, toggleFold, seeAllLive, seeAllOpen, openFilters, clearFilter,
    ]
  )

  /*
   * Filter re-sort (#38, `lib/resort.ts`): choosing a kind or a filter jumps the list to the top; the rows that leave fade over
   * `quick`, those that arrive rise in with an 18 ms stagger down the first six. `resorting` is true from the render that
   * carries the new filters until the last of them has arrived, so only rows that mount in that window arrive this way: a row
   * the list draws as it is scrolled never replays it. The title and the sticky search are not rows that re-sort.
   */
  const resortKey = `${venueType ?? '-'}|${whatsOn}|${radiusKm ?? '-'}`
  const [settledKey, setSettledKey] = useState(resortKey)
  const resorting = settledKey !== resortKey
  const listRef = useRef<Animated.FlatList<PlaceRow>>(null)
  const sorted = useRef(resortKey)
  useEffect(() => {
    if (sorted.current === resortKey) return
    sorted.current = resortKey
    listRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, [resortKey])
  // The window opens when the answer is on screen, not when the chip is tapped: the rows that arrive are the ones that rise, and a
  // read that takes longer than the window must not lose them.
  const answered = state.key === key && state.status === 'ready'
  useEffect(() => {
    if (!resorting || !answered) return
    const timer = setTimeout(() => setSettledKey(resortKey), RESORT_WINDOW_MS)
    return () => clearTimeout(timer)
  }, [resorting, answered, resortKey])

  const renderItem = useCallback(
    ({ item, index }: { item: PlaceRow; index: number }) => {
      const row = renderRow({ item })
      if (row === null || item.kind === 'title' || item.kind === 'search') return row
      return (
        <ResortRow index={index - LEAD_ROWS} resorting={resorting} reduceMotion={reduceMotion}>
          {row}
        </ResortRow>
      )
    },
    [renderRow, resorting, reduceMotion]
  )

  return (
    <>
      <Animated.FlatList
        ref={listRef}
        data={rows}
        keyExtractor={keyOf}
        renderItem={renderItem}
        // Up to twelve rows reflow on M.settle; more crossfade (#38).
        itemLayoutAnimation={reflowsOnSpring(rows.length, reduceMotion) ? UNFOLD : undefined}
        stickyHeaderIndices={PLACES_STICKY}
        ListFooterComponent={
          state.loadingMore ? (
            <View style={styles.more}><Spinner /></View>
          ) : state.rateLimit && state.rateLimit.page > 1 ? (
            <View style={styles.banner}>
              <RateLimitedBanner seconds={state.rateLimit.seconds} onDone={rateLimitDone} testID="places-more-rate-limited" />
            </View>
          ) : null
        }
        testID="places-list"
        onEndReachedThreshold={0.5}
        onEndReached={() => void loadMore()}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + SPACE.xl }]}
        initialNumToRender={10}
        windowSize={7}
        showsVerticalScrollIndicator={false}
        // A tap on a row, a plate or a chip lands first time with the keyboard up from the search.
        keyboardShouldPersistTaps="handled"
        {...pull.listProps}
      />
      {pull.indicator}
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

/**
 * One row of the list, arriving as a re-sort's (`lib/resort.ts`): a rise and fade in order while `resorting`, else as it always
 * did. Only the rows that are there when the re-sort begins fade out: a row the list lets go of as it is scrolled leaves quietly.
 */
function ResortRow({ index, resorting, reduceMotion, children }: { index: number; resorting: boolean; reduceMotion: boolean; children: ReactNode }) {
  return (
    <Animated.View entering={resorting ? (reduceMotion ? resortFadeIn : resortIn(resortDelay(index))) : undefined} exiting={resorting ? resortOut : undefined}>
      {children}
    </Animated.View>
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
