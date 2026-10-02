import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { tabBarTop } from '../../app/(tabs)/_layout'
import { NotificationBell } from '../pulse/NotificationBell'
import { PulseTopBar, TOP_BAR_HEIGHT } from '../pulse/PulseTopBar'
import { Text } from '../ui/Text'
import { drawerSnapPoints, type DrawerSnap } from '../../lib/home'
import { CONTROL, EMBER, EMBER_RADIUS, SPACE } from '../../lib/theme'
import { HomeDrawer } from './HomeDrawer'
import { HomeMap } from './HomeMap'
import { PlacesList } from './PlacesList'

/** What the Pulse is browsing, so Places browses the same city from the same spot. */
export interface HomeBrowse {
  city: string | null
  location: { latitude: number; longitude: number } | null
}

type Segment = 'events' | 'places'

/**
 * The home screen: a map, and over it a drawer holding Events | Places (plan v2
 * step 2). PLACEHOLDER DESIGN — docs/PLACEHOLDER_SCREENS.md §8.
 *
 * Events is The Pulse exactly as it was, moved into the drawer: its sections,
 * search, city picker and empty states are the same component. Both panes stay
 * mounted once opened, so switching never refetches or loses a scroll.
 *
 * ## The top bar
 *
 * `PulseTopBar` floats over the map holding the wordmark and the bell, and the
 * drawer's `full` stops under it, so the bell is always reachable. It reserves
 * no height: the map runs under it edge to edge.
 */
export function HomeShell({ renderEvents }: { renderEvents: (onBrowse: (browse: HomeBrowse) => void) => ReactNode }) {
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const points = useMemo(
    () => drawerSnapPoints({ height, topChrome: insets.top + TOP_BAR_HEIGHT, tabBarTop: tabBarTop(height, insets.bottom) }),
    [height, insets.top, insets.bottom]
  )
  const [snap, setSnap] = useState<DrawerSnap>('half')
  const [segment, setSegment] = useState<Segment>('events')
  const [placesOpened, setPlacesOpened] = useState(false)
  const [browse, setBrowse] = useState<HomeBrowse>({ city: null, location: null })
  // One element for the life of the screen: a drag or a segment switch must not re-render the Pulse.
  const events = useMemo(() => renderEvents(setBrowse), [renderEvents])

  // With a screen reader the list is the screen: open it, so nothing is below the edge.
  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled()
      .then((on) => {
        if (on) setSnap('full')
      })
      .catch(() => {})
  }, [])

  const choose = (next: Segment) => {
    setSegment(next)
    if (next === 'places') setPlacesOpened(true)
  }

  return (
    <View style={styles.root}>
      <HomeMap center={browse.location} segment={segment} topInset={insets.top + TOP_BAR_HEIGHT} />
      <PulseTopBar actions={<NotificationBell />} />
      <HomeDrawer
        points={points}
        snap={snap}
        onSnap={setSnap}
        header={
          <View style={styles.segmented} accessibilityRole="tablist">
            {(['events', 'places'] as const).map((s) => (
              <Pressable
                key={s}
                onPress={() => choose(s)}
                style={[styles.segment, segment === s && styles.segmentOn]}
                accessibilityRole="tab"
                accessibilityLabel={s === 'events' ? 'Events' : 'Places'}
                accessibilityState={{ selected: segment === s }}
              >
                <Text variant="bodyStrong" color={segment === s ? EMBER.bg : EMBER.textSecondary}>
                  {s === 'events' ? 'Events' : 'Places'}
                </Text>
              </Pressable>
            ))}
          </View>
        }
      >
        <View style={[styles.pane, segment !== 'events' && styles.hidden]}>{events}</View>
        {placesOpened ? (
          <View style={[styles.pane, segment !== 'places' && styles.hidden]}>
            <PlacesList browse={browse} active={segment === 'places'} />
          </View>
        ) : null}
      </HomeDrawer>
    </View>
  )
}


const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: EMBER.bg },
  segmented: {
    flexDirection: 'row',
    height: CONTROL.md,
    padding: SPACE.xs,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surfaceSunken,
  },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: EMBER_RADIUS.pill },
  segmentOn: { backgroundColor: EMBER.textPrimary },
  pane: { flex: 1 },
  hidden: { display: 'none' },
})
