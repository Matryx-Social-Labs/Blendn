import { useIsFocused } from 'expo-router'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Keyboard, Platform, Pressable, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native'
import { useSharedValue } from 'react-native-reanimated'
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
  /** Where the selected city is (`/events/cities` `centre`). */
  cityCentre: { latitude: number; longitude: number } | null
  /**
   * Bumped by every city the person chooses, never by one the app decided: the
   * map goes there, even to the city it shows. `here` when the choice was where
   * they stand ("Use my current location", the switch banner): the map shows them.
   */
  cityPick: { n: number; here: boolean }
  /** Ask for the phone's position: the Pulse's own location flow (the OS ask, or its "Turn on location" tray). Settles when it does. */
  requestLocation: () => void | Promise<void>
}

type Segment = 'events' | 'places'

/**
 * Off the list, nothing closes the keyboard by itself: the list does it for
 * its own surface (`keyboardShouldPersistTaps` in `events.tsx`), the map and
 * the drawer's chrome call this. No-op with no keyboard up.
 */
const dismissKeyboard = () => Keyboard.dismiss()

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
  /** `full`: the drawer all the way up and no keyboard, so the Pulse's first card is on screen and nobody is typing (its coach mark waits for it). */
  renderEvents: (onBrowse: (browse: HomeBrowse) => void, visible: boolean, full: boolean) => ReactNode
}) {
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const focused = useIsFocused()
  const points = useMemo(
    () => drawerSnapPoints({ height, topChrome: insets.top + TOP_BAR_HEIGHT, tabBarTop: tabBarTop(height, insets.bottom) }),
    [height, insets.top, insets.bottom]
  )
  const [snap, setSnap] = useState<DrawerSnap>('half')
  // The drawer's top edge as it moves; "my location" rides on it.
  const drawerTop = useSharedValue(points[snap])
  // The map's own height: the screen less the tab bar. The map waits for it, so its first frame is centred.
  const [mapHeight, setMapHeight] = useState<number | null>(null)
  const onLayout = (e: LayoutChangeEvent) => setMapHeight(e.nativeEvent.layout.height)
  const restore = useRef<DrawerSnap | null>(null)
  const [segment, setSegment] = useState<Segment>('events')
  const [placesOpened, setPlacesOpened] = useState(false)
  const [screenReader, setScreenReader] = useState(false)
  const [browse, setBrowse] = useState<HomeBrowse>({
    city: null,
    location: null,
    ready: false,
    cityCentre: null,
    cityPick: { n: 0, here: false },
    requestLocation: () => {},
  })

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

  /** Someone is typing (the Pulse's search): its coach mark never pops over them. */
  const [keyboardUp, setKeyboardUp] = useState(false)
  // The Pulse's search sits in the drawer: typing opens it fully, so the field is not under the keyboard.
  useEffect(() => {
    if (!focused) return
    const move = (event: 'show' | 'hide') => {
      setKeyboardUp(event === 'show')
      setSnap((current) => {
        const next = snapOnKeyboard({ snap: current, restore: restore.current }, event)
        restore.current = next.restore
        return next.snap
      })
    }
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => move('show'))
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => move('hide'))
    return () => {
      show.remove()
      hide.remove()
      // A hide missed while away must not keep the mark waiting for good.
      setKeyboardUp(false)
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
  const pulseFull = pulseVisible && snap === 'full' && !keyboardUp
  const events = useMemo(() => renderEvents(setBrowse, pulseVisible, pulseFull), [renderEvents, pulseVisible, pulseFull])

  return (
    <View style={styles.root} onLayout={onLayout}>
      {/* A touch on the map (or through the top bar, which lets touches by) puts the search's keyboard away. */}
      <View
        style={StyleSheet.absoluteFill}
        onTouchStart={dismissKeyboard}
        importantForAccessibility={screenReader ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={screenReader}
      >
        {mapHeight !== null ? (
          <HomeMap
            center={browse.location}
            cityCentre={browse.cityCentre}
            cityPick={browse.cityPick}
            requestLocation={browse.requestLocation}
            locateVisible={snap !== 'full'}
            drawerTop={drawerTop}
            drawer={points}
            segment={segment}
            topChrome={insets.top + TOP_BAR_HEIGHT}
            mapHeight={mapHeight}
            drawerSnapTop={points[snap]}
            focused={focused}
            // Nothing breathes where nobody can see it: the drawer full over the map, or a screen reader (which hides the map).
            glowVisible={focused && snap !== 'full' && !screenReader}
          />
        ) : null}
      </View>
      <PulseTopBar actions={<NotificationBell />} />
      <HomeDrawer
        y={drawerTop}
        points={points}
        snap={snap}
        onSnap={onSnap}
        onChromeTouch={dismissKeyboard}
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
