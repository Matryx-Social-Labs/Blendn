import { useSyncExternalStore } from 'react'

import { getNetworkState, subscribeNetworkState } from '../../lib/networkStatus'
import { Banner } from '../ds/Banner'

/**
 * The offline banner's words for a surface that acts (Flow 15 #16, DS #44; E6): one sentence per meaning. A cached view says
 * "Offline. Showing what you had." instead; a chat's banner (`RealtimeStatusBanner` `OFFLINE`) says this one too.
 */
export const OFFLINE_LINE = 'Offline. Some actions won’t work until you’re back.'

/** Whether the phone knows it has no connection: what an action here would fail on. */
export function useOffline() {
  return useSyncExternalStore(subscribeNetworkState, getNetworkState) === 'offline'
}

/**
 * Offline, said where it matters (Flow 15 #16 on Me, Friends, Edit profile and Requests): the DS banner, solid and in the flow, announced
 * once as it appears. Nothing when online. On Edit profile Save is disabled while it shows.
 */
export function OfflineStrip({ offline }: { offline: boolean }) {
  return offline ? <Banner kind="offline" text={OFFLINE_LINE} testID="offline-banner" /> : null
}
