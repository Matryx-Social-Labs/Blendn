import { StyleSheet, View } from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated'

import { Banner } from '../ds/Banner'
import { bannerFadeIn, bannerIn, bannerOut } from '../motion/presence'
import { RateLimitedBanner } from '../system/RateLimitedBanner'
import RealtimeStatusBanner from '../RealtimeStatusBanner'
import { SPACE, SPRING } from '../../lib/design/tokens'
import type { AwayNotice } from '../../lib/city'
import type { SocketConnectionStatus } from '../../lib/socketClient'
import { useReducedMotion } from '../../lib/motion'

type BannersProps = {
  socketStatus: SocketConnectionStatus
  /** The phone is in a city we serve that is not the one browsed: "You're in Mumbai. Browse events here?" */
  switchTo: string | null
  onSwitch: (city: string) => void
  /** The phone is somewhere we do not serve, or whose city is coming soon: passive, no action. */
  away: AwayNotice | null
  /** Browsing another country than home's (`travelBanner`): once per switch, with the way back. */
  travel?: { kind: 'browsing' | 'visiting'; text: string; back: string } | null
  onTravelBack?: () => void
  onTravelDismiss?: () => void
  /** Location is denied and Nearby is not already asking. */
  locationDenied: boolean
  onOpenSettings: () => void
  /** A refresh failed over a list that is still on screen. */
  refreshFailed: boolean
  /** Seconds the server asked us to wait after refusing a read for asking too fast (Flow 15 #15); null when it has not. */
  rateLimit?: number | null
  onRateLimitDone?: () => void
  onRetry: () => void
  onLayout?: (height: number) => void
}

/**
 * The Pulse's system banners, the DS `Banner` every time (Flow 3 `home` banners): offline, the switch offer, the away
 * notice, location denied, a failed refresh. Each slides 16 pt and fades in (#44), leaves in a quick fade, and the rest
 * of the pane shifts on `M.settle`. Under Reduce Motion they fade and the pane shifts at once.
 *
 * Offline is worth saying here, a dead socket is not: this screen loads over HTTP, so "Realtime disconnected" was
 * showing above a list that had loaded perfectly (`showSocketIssues={false}`).
 *
 * The first-run tip is not a banner any more (it is the one-off coach mark), and a switch offer and the away notice
 * are never both: `lib/city.ts` pins that across every combination.
 */
export function PulseBanners({ socketStatus, switchTo, onSwitch, away, travel = null, onTravelBack = () => {}, onTravelDismiss, locationDenied, onOpenSettings, refreshFailed, rateLimit = null, onRateLimitDone, onRetry, onLayout }: BannersProps) {
  const reduceMotion = useReducedMotion()
  const enter = reduceMotion ? bannerFadeIn : bannerIn
  const glide = reduceMotion ? undefined : LinearTransition.springify().stiffness(SPRING.settle.stiffness).damping(SPRING.settle.damping).mass(SPRING.settle.mass)
  return (
    <Animated.View layout={glide} style={styles.bar} onLayout={(e) => onLayout?.(Math.round(e.nativeEvent.layout.height))} testID="pulse-banners">
      <RealtimeStatusBanner status={socketStatus} style={styles.item} showSocketIssues={false} />
      {switchTo ? (
        <Animated.View entering={enter} exiting={bannerOut} style={styles.item}>
          <Banner kind="info" text={`You’re in ${switchTo}. Browse events here?`} action={{ label: 'Switch', onPress: () => onSwitch(switchTo) }} testID="pulse-switch" />
        </Animated.View>
      ) : null}
      {travel ? (
        <Animated.View entering={enter} exiting={bannerOut} style={styles.item}>
          <Banner kind="info" icon="plane" text={travel.text} action={{ label: `Back to ${travel.back}`, onPress: onTravelBack }} onDismiss={onTravelDismiss} testID="pulse-travel" />
        </Animated.View>
      ) : null}
      {away ? (
        <Animated.View entering={enter} exiting={bannerOut} style={styles.item}>
          <Banner kind="info" icon="map-pin" text={awayText(away)} testID="pulse-away" />
        </Animated.View>
      ) : null}
      {locationDenied ? (
        <Animated.View entering={enter} exiting={bannerOut} style={styles.item}>
          <Banner kind="paused" text="Turn on location to see nearby events and check in." action={{ label: 'Settings', onPress: onOpenSettings }} testID="pulse-denied" />
        </Animated.View>
      ) : null}
      {rateLimit !== null ? (
        <View style={styles.item}>
          <RateLimitedBanner seconds={rateLimit} onDone={onRateLimitDone} testID="pulse-rate-limited" />
        </View>
      ) : null}
      {refreshFailed && rateLimit === null ? (
        <Animated.View entering={enter} exiting={bannerOut} style={styles.item}>
          <Banner kind="offline" text="Couldn’t refresh events." action={{ label: 'Try again', onPress: onRetry }} testID="pulse-refresh-failed" />
        </Animated.View>
      ) : null}
    </Animated.View>
  )
}

/** Where the phone is, said plainly; never "near you" for a place we do not serve (travel plan §4.4). */
export function awayText(away: AwayNotice): string {
  return away.kind === 'comingSoon'
    ? `${away.deviceCity} is coming soon. You’re browsing ${away.selected}.`
    : `We’re not in ${away.deviceCity} yet. You’re browsing ${away.selected}.`
}

const styles = StyleSheet.create({
  bar: { gap: SPACE.sm, paddingBottom: SPACE.sm },
  item: { paddingHorizontal: SPACE.gutter },
})
