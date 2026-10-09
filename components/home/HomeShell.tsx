import { useIsFocused } from 'expo-router'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Keyboard, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { tabBarTop } from '../../app/(tabs)/_layout'
import { NotificationBell } from '../pulse/NotificationBell'
import { PulseTopBar, TOP_BAR_HEIGHT } from '../pulse/PulseTopBar'
import { Text } from '../ui/Text'
import { DRAWER_SEGMENTED_HEIGHT, drawerSnapPoints, snapOnKeyboard, type DrawerSnap } from '../../lib/home'
import { Logger } from '../../lib/logger'
import { EMBER, EMBER_RADIUS, SPACE } from '../../lib/theme'
import { HomeDrawer } from './HomeDrawer'
import { HomeMap } from './HomeMap'
import { PlacesList } from './PlacesList'

/** What the Pulse is browsing, so Places browses the same city from the same spot. */
export interface HomeBrowse {
  city: string | null
  location: { latitude: number; longitude: number } | null
  /** The city has been decided (stored, inferred or none at all): Places may ask now. */
  ready: boolean
  /** Where the picked city is (`/events/cities` `centre`): the map goes there when the city changes. */
  cityCentre: { latitude: number; longitude: number } | null
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
export function HomeShell({
  renderEvents,
}: {
  renderEvents: (onBrowse: (browse: HomeBrowse) => void, visible: boolean) => ReactNode
}) {
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const focused = useIsFocused()
  const points = useMemo(
    () => drawerSnapPoints({ height, topChrome: insets.top + TOP_BAR_HEIGHT, tabBarTop: tabBarTop(height, insets.bottom) }),
    [height, insets.top, insets.bottom]
  )
  const [snap, setSnap] = useState<DrawerSnap>('half')
  const restore = useRef<DrawerSnap | null>(null)
  const [segment, setSegment] = useState<Segment>('events')
  const [placesOpened, setPlacesOpened] = useState(false)
  const [screenReader, setScreenReader] = useState(false)
  const [browse, setBrowse] = useState<HomeBrowse>({ city: null, location: null, ready: false, cityCentre: null })

  /*
   * With a screen reader the list is the screen: open it, and take the map out
   * of the reading order (it says nothing the list does not). Followed live,
   * not read once at mount: VoiceOver is switched on and off mid-session.
   */
  useEffect(() => {
    const apply = (on: boolean) => {
      setScreenReader(on)
      if (on) setSnap('full')
    }
    AccessibilityInfo.isScreenReaderEnabled()
      .then(apply)
      .catch((error) => Logger.warn('general', 'Could not read the screen reader state', { error: String(error) }))
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', apply)
    return () => sub.remove()
  }, [])

  // The Pulse's search sits in the drawer: typing opens it fully, so the field is not under the keyboard.
  useEffect(() => {
    if (!focused) return
    const move = (event: 'show' | 'hide') =>
      setSnap((current) => {
        const next = snapOnKeyboard({ snap: current, restore: restore.current }, event)
        restore.current = next.restore
        return next.snap
      })
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => move('show'))
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => move('hide'))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [focused])

  const onSnap = (next: DrawerSnap) => {
    // Moved by hand: the keyboard no longer has a place to put it back to.
    restore.current = null
    setSnap(next)
  }

  const choose = (next: Segment) => {
    setSegment(next)
    if (next === 'places') setPlacesOpened(true)
  }

  // The Pulse's media plays only while you can see it: its pane, the drawer open past peek, this tab.
  const pulseVisible = focused && segment === 'events' && snap !== 'peek'
  const events = useMemo(() => renderEvents(setBrowse, pulseVisible), [renderEvents, pulseVisible])

  return (
    <View style={styles.root}>
      <View
        style={StyleSheet.absoluteFill}
        importantForAccessibility={screenReader ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={screenReader}
      >
        <HomeMap
          center={browse.location}
          cityCentre={browse.cityCentre}
          segment={segment}
          topInset={insets.top + TOP_BAR_HEIGHT}
          bottomInset={height - points[snap]}
          active={focused}
        />
      </View>
      <PulseTopBar actions={<NotificationBell />} />
      <HomeDrawer
        points={points}
        snap={snap}
        onSnap={onSnap}
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
            <PlacesList browse={browse} active={focused && segment === 'places'} />
          </View>
        ) : null}
      </HomeDrawer>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: EMBER.bg },
  // 44pt segments inside a 4pt inset.
  segmented: {
    flexDirection: 'row',
    height: DRAWER_SEGMENTED_HEIGHT,
    padding: SPACE.xs,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surfaceSunken,
  },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: EMBER_RADIUS.pill },
  segmentOn: { backgroundColor: EMBER.textPrimary },
  pane: { flex: 1 },
  hidden: { display: 'none' },
})
