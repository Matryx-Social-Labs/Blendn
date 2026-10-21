import { StyleSheet, View } from 'react-native'

import { CityArtBanner } from '../cityArt/CityArtCard'
import { drawableCityArt } from '../cityArt/drawable'
import { StateScreen } from '../ds/StateScreen'
import type { IconName } from '../ui/Icon'
import { SPACE } from '../../lib/design/tokens'
import type { PulseEmptyKind } from '../../lib/pulseFeed'

/** The skyline strip over a quiet city's state (R4.1 3-7). */
const SKYLINE_HEIGHT = 140

const ICON: Record<PulseEmptyKind, IconName> = {
  search: 'search',
  filters: 'search',
  noCity: 'calendar',
  notLive: 'rocket',
  quiet: 'calendar',
}

/**
 * What an empty Pulse says, as the DS `StateScreen` (Flow 3 `home` 06–08, 11, 13, 25): four different empties, and
 * conflating them is a lie (`lib/pulseFeed.ts`): a quiet week, a city not on the list, a search that found nothing and
 * filters that found nothing. "Nothing on in Bengaluru" over a "this weekend, 2 km" filter told somebody the city was
 * empty when it was not.
 *
 * A city we have drawn gets its skyline above the words (the quiet, coming-soon and no-city states: the city itself, so
 * an empty week is still Bengaluru); a search or filter miss is about the query, not the place.
 *
 * The way out is real: the query or the filters are the reason, so they are the fix; otherwise another city, or a refresh.
 */
export function PulseEmpty({
  kind,
  copy,
  city,
  canChangeCity,
  onClearSearch,
  onClearFilters,
  onChangeCity,
  onRefresh,
}: {
  kind: PulseEmptyKind
  copy: { title: string; message: string }
  city: string | null
  canChangeCity: boolean
  onClearSearch: () => void
  onClearFilters: () => void
  onChangeCity: () => void
  onRefresh: () => void
}) {
  const art = kind !== 'search' && kind !== 'filters' ? drawableCityArt(city) : null
  const actions =
    kind === 'search'
      ? [{ label: 'Clear search', kind: 'secondary' as const, onPress: onClearSearch }]
      : kind === 'filters'
        ? [{ label: 'Clear filters', kind: 'secondary' as const, onPress: onClearFilters }]
        : [
            ...(canChangeCity ? [{ label: 'Change city', kind: 'secondary' as const, onPress: onChangeCity }] : []),
            { label: 'Refresh', kind: 'secondary' as const, onPress: onRefresh },
          ]
  return (
    <View style={styles.wrap} testID={`pulse-empty-${kind}`}>
      {art ? <CityArtBanner art={art} height={SKYLINE_HEIGHT} /> : null}
      <StateScreen icon={ICON[kind]} title={copy.title} body={copy.message} actions={actions} />
    </View>
  )
}

/** The first load failed: nothing on screen, and the page says why with one way forward (not a thin banner over a blank page). */
export function PulseLoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.wrap} testID="pulse-load-failed">
      <StateScreen icon="cloud-off" title="Couldn’t load events" body="Check your connection and try again." actions={[{ label: 'Try again', onPress: onRetry }]} />
    </View>
  )
}

const styles = StyleSheet.create({ wrap: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.xl } })
