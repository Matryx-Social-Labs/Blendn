import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { HueProvider } from '../../components/ds/shared'
import { StateScreen } from '../../components/ds/StateScreen'
import { TopBar } from '../../components/ds/TopBar'
import { SharedEventRow } from '../../components/profile/ProfileSparseBlocks'
import { apiClient, type SharedEvent } from '../../lib/apiClient'
import { COLOR, SPACE } from '../../lib/design/tokens'
import { useTopBarOverlay } from '../../lib/useTopBarState'

/** A page of the list; the server's default too. */
const PAGE = 20

/**
 * "You've both been to", all of it (SCRUM-1042 state 2 C's See all): every past event you and this person were both at
 * where they were not a pseudonym to you, newest first, a page at a time. The rule is the server's alone; this screen
 * draws what it is sent, so a ref the server does not name answers an empty list here too.
 */
function SharedEventsContent() {
  const insets = useSafeAreaInsets()
  const bar = useTopBarOverlay()
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>()
  const [events, setEvents] = useState<SharedEvent[]>([])
  const [total, setTotal] = useState(0)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const next = useRef<string | null>(null)
  const busy = useRef(false)

  const load = useCallback(
    async (first: boolean) => {
      if (busy.current || (!first && !next.current)) return
      busy.current = true
      try {
        const r = await apiClient.getSharedEvents(id, PAGE, first ? null : next.current)
        if (!r.success || !r.data) throw new Error(r.error ?? 'no data')
        const page = r.data
        next.current = page.pagination.nextCursor
        setTotal(page.pagination.totalCount)
        setEvents((had) => (first ? page.events : [...had, ...page.events.filter((e) => !had.some((h) => h.id === e.id))]))
        setState('ready')
      } catch {
        if (first) setState('failed')
      } finally {
        busy.current = false
      }
    },
    [id]
  )
  useEffect(() => {
    void load(true)
  }, [load])

  // The bar's large title says what this is; its line under says with whom and how many.
  const sub = [name ? `With ${name}` : null, total ? `${total} ${total === 1 ? 'event' : 'events'}, newest first` : null].filter(Boolean).join(' · ')
  const empty =
    state === 'loading' ? (
      <ActivityIndicator color={COLOR.textSecondary} style={styles.loading} />
    ) : state === 'failed' ? (
      <StateScreen icon="cloud-off" title="These didn’t load" body="Check your connection and try again." actions={[{ label: 'Try again', onPress: () => void load(true) }]} testID="shared-events-failed" />
    ) : (
      <StateScreen icon="calendar" title="No events together yet" body="Events you have both been to show up here." testID="shared-events-empty" />
    )

  return (
    <View style={styles.container}>
      <FlatList
        testID="shared-events-list"
        data={events}
        keyExtractor={(e) => e.id}
        renderItem={({ item, index }) => <SharedEventRow event={item} testID={`shared-events-${index}`} />}
        ListEmptyComponent={empty}
        onEndReached={() => void load(false)}
        onEndReachedThreshold={0.5}
        contentContainerStyle={[styles.content, { paddingTop: bar.contentTop, paddingBottom: insets.bottom + SPACE.xl }]}
        scrollIndicatorInsets={{ top: bar.indicatorTop }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        windowSize={7}
        {...bar.scrollProps}
      />
      <View style={bar.barPin} pointerEvents="box-none">
        <TopBar title="You’ve both been to" sub={sub || undefined} state={bar.state} onBack={() => router.back()} testID="shared-events-top" />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.ink },
  content: { paddingHorizontal: SPACE.gutter, flexGrow: 1 },
  loading: { marginTop: SPACE.xxl },
})

/** The person's page is rose; so is the list it opens. */
export default function SharedEventsScreen() {
  return (
    <HueProvider value="rose">
      <SharedEventsContent />
    </HueProvider>
  )
}
