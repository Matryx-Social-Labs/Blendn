import { StyleSheet, Text, View } from 'react-native'

import { CityArtBanner } from '../cityArt/CityArtCard'
import { drawableCityArt } from '../cityArt/drawable'
import { Button } from '../ds/Button'
import { monoCaption } from '../ds/MonoFamily'
import { SectionHeader } from '../ds/SectionHeader'
import { CONTROL_FONT_CAP, font, useBoldText } from '../ds/shared'
import { StateScreen } from '../ds/StateScreen'
import ScalePress from '../motion/ScalePress'
import { CornerGlow } from '../ui/GradientFill'
import { Icon, type IconName } from '../ui/Icon'
import type { CatalogueCountry, CityOption } from '../../lib/city'
import { COLOR, ICON, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'
import { whereWeAre, type PulseEmptyKind } from '../../lib/pulseFeed'

/** Board `.crow`: a city row under "Where Blend'n is on". */
const CITY_ROW_HEIGHT = 60
/** The skyline strip over a quiet city's state (R4.1 3-7). */
const SKYLINE_HEIGHT = 140

const KIND_ICON: Record<PulseEmptyKind, IconName> = {
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
  cities = [],
  countries = [],
  onChooseCity,
  onClearSearch,
  onClearFilters,
  onChangeCity,
  onRefresh,
}: {
  kind: PulseEmptyKind
  copy: { title: string; message: string }
  city: string | null
  canChangeCity: boolean
  /** The catalogue: a city we are not in yet lists where Blend'n is on, each opening that city. */
  cities?: readonly CityOption[]
  countries?: readonly CatalogueCountry[]
  onChooseCity?: (city: CityOption) => void
  onClearSearch: () => void
  onClearFilters: () => void
  onChangeCity: () => void
  onRefresh: () => void
}) {
  const open = kind === 'notLive' && onChooseCity ? whereWeAre(cities) : []
  if (open.length && onChooseCity) {
    return <NotHereYet copy={copy} rows={open} countries={countries} onChooseCity={onChooseCity} />
  }
  const art = kind !== 'search' && kind !== 'filters' ? drawableCityArt(city) : null
  const actions =
    kind === 'search'
      ? [{ label: 'Clear search', kind: 'lit' as const, onPress: onClearSearch }]
      : kind === 'filters'
        ? [{ label: 'Clear filters', kind: 'lit' as const, onPress: onClearFilters }]
        : [
            ...(canChangeCity ? [{ label: 'Change city', kind: 'lit' as const, onPress: onChangeCity }] : []),
            // The first recovery is lit; the rest stay quiet.
            { label: 'Refresh', kind: canChangeCity ? ('secondary' as const) : ('lit' as const), onPress: onRefresh },
          ]
  return (
    <View style={styles.wrap} testID={`pulse-empty-${kind}`}>
      {art ? <CityArtBanner art={art} height={SKYLINE_HEIGHT} /> : null}
      <StateScreen icon={KIND_ICON[kind]} title={copy.title} body={copy.message} actions={actions} />
    </View>
  )
}

/**
 * A city we are not in yet (Flow 3 · Pulse, the Canada frame; Waymo's shape): what is missing, then where Blend'n is on,
 * each row that city's Pulse. No skyline and no chips: the map stays dark, since only real places light, and there is
 * nothing to filter. Their asking is already counted (`recordCityDemand`), which is what the sentence says.
 */
function NotHereYet({
  copy,
  rows,
  countries,
  onChooseCity,
}: {
  copy: { title: string; message: string }
  rows: ReturnType<typeof whereWeAre<CityOption>>
  countries: readonly CatalogueCountry[]
  onChooseCity: (city: CityOption) => void
}) {
  const bold = useBoldText()
  return (
    <View style={styles.notHere} testID="pulse-empty-notLive">
      <View style={styles.words}>
        <Text style={[font('title', bold), styles.ink]} maxFontSizeMultiplier={MAX_FONT_SCALE.title} accessibilityRole="header">
          {copy.title}
        </Text>
        <Text style={[font('body', bold), styles.secondary]} maxFontSizeMultiplier={MAX_FONT_SCALE.body}>
          {copy.message}
        </Text>
      </View>
      <View style={styles.whereHead}>
        <SectionHeader title="Where Blend’n is on" testID="pulse-where-header" />
      </View>
      <View>
        {rows.map(({ city, count }) => {
          const country = countries.find((c) => c.code === city.country)?.name
          return (
            // Board `.crow`: 60 tall, the screen's width with the 24 pt gutter, a hairline under it.
            <ScalePress
              key={city.slug ?? city.city}
              haptic={false}
              onPress={() => onChooseCity(city)}
              accessibilityRole="button"
              accessibilityLabel={[city.city, count].filter(Boolean).join(', ')}
              style={styles.cityRow}
              testID={`pulse-where-${city.slug ?? city.city}`}
            >
              <Icon name="map-pin" size={ICON.control} color={COLOR.textSecondary} />
              <View style={styles.cityWords}>
                <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.ink]}>
                  {city.city}
                </Text>
                {country ? (
                  <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.caption} style={[font('caption', bold), styles.secondary]}>
                    {country}
                  </Text>
                ) : null}
              </View>
              {count ? <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[monoCaption(bold), styles.secondary]}>{count}</Text> : null}
              <Icon name="chevron-right" size={ICON.inline} color={COLOR.textSecondary} />
            </ScalePress>
          )
        })}
      </View>
    </View>
  )
}

/**
 * The end of a quiet week (Flow 3 · Pulse, Canada): one sentence that it is everything, then a way on. Places open tonight
 * is lit (the one offer), Change city is quiet. Only drawn when it is true (`quietWeekEnd`).
 */
export function QuietWeekEnd({ city, onPlaces, onChangeCity }: { city: string; onPlaces: () => void; onChangeCity: () => void }) {
  const bold = useBoldText()
  return (
    <View style={styles.quiet} testID="pulse-quiet-end">
      <Text style={[font('meta', bold), styles.secondary]} maxFontSizeMultiplier={MAX_FONT_SCALE.meta}>
        {`That’s everything in ${city} this week.`}
      </Text>
      <Button kind="lit" label="Places open tonight" onPress={onPlaces} testID="pulse-quiet-places" />
      <Button kind="secondary" label="Change city" onPress={onChangeCity} testID="pulse-quiet-city" />
    </View>
  )
}

type NearWaysProps = { city: string; onSeeCity: () => void; onPlaces: () => void }

/** Near me's ways on, the same at both of its ends: the whole city (lit), and Places. */
function NearWays({ city, onSeeCity, onPlaces }: NearWaysProps) {
  return (
    <View style={styles.nearWays}>
      <Button kind="lit" size="md" label={`See all of ${city}`} onPress={onSeeCity} testID="pulse-near-see-city" />
      <Button kind="secondary" size="md" label="Places open now" onPress={onPlaces} testID="pulse-near-places" />
    </View>
  )
}

/**
 * Nothing within a short ride (Flow 3b · N1 board `N1none`): an inline card under the chips that caused it, saying what
 * exists and how far (`nothingNearCopy`), never a bare radius; the map above still shows the dark beyond.
 */
export function NothingNear({ copy, ...ways }: NearWaysProps & { copy: { title: string; message: string } }) {
  const bold = useBoldText()
  return (
    <View style={styles.nearCard} testID="pulse-nothing-near">
      <CornerGlow color={COLOR.brandOrange} pointerEvents="none" style={StyleSheet.absoluteFill} />
      <Text style={[font('heading', bold), styles.ink]} maxFontSizeMultiplier={MAX_FONT_SCALE.heading} accessibilityRole="header">
        {copy.title}
      </Text>
      {copy.message ? (
        <Text style={[font('meta', bold), styles.secondary]} maxFontSizeMultiplier={MAX_FONT_SCALE.meta} testID="pulse-nothing-near-message">
          {copy.message}
        </Text>
      ) : null}
      <NearWays {...ways} />
    </View>
  )
}

/** The end of a Near me list (board `N1canada` `.endnote`): a hairline, that it is everything in reach, the ways on. */
export function NearEnd({ span, ...ways }: NearWaysProps & { span: string }) {
  const bold = useBoldText()
  return (
    <View style={styles.nearEnd} testID="pulse-near-end">
      <Text style={[font('meta', bold), styles.secondary]} maxFontSizeMultiplier={MAX_FONT_SCALE.meta}>
        {`That’s everything within a short ride ${span}.`}
      </Text>
      <NearWays {...ways} />
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

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.xl },
  // Board (Canada · not here yet): the title 4 under the header, 6 to its line, 22 to "Where Blend'n is on", 12 to the rows.
  notHere: { paddingTop: SPACE.xs },
  words: { paddingHorizontal: SPACE.gutter, gap: SPACE.xs + SPACE.xxs },
  whereHead: { paddingHorizontal: SPACE.gutter, marginTop: SPACE.lg + SPACE.xs + SPACE.xxs, marginBottom: SPACE.md },
  cityRow: {
    height: CITY_ROW_HEIGHT,
    paddingHorizontal: SPACE.gutter,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLOR.hairline,
  },
  cityWords: { flex: 1, minWidth: 0 },
  quiet: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.xl, gap: SPACE.md },
  // Board `.fc` (as the friends card): 16 under the chips, 16 / 16 / 16 / 18 in, 8 between, 4 more above the buttons.
  nearCard: {
    marginHorizontal: SPACE.gutter,
    marginTop: SPACE.lg,
    paddingTop: SPACE.lg,
    paddingRight: SPACE.lg,
    paddingBottom: SPACE.lg,
    paddingLeft: SPACE.lg + SPACE.xxs,
    gap: SPACE.sm,
    borderRadius: RADIUS.mediaInCard,
    backgroundColor: COLOR.surface,
    overflow: 'hidden',
  },
  nearWays: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginTop: SPACE.xs },
  // Board `.endnote`: 18 under the last row, a hairline, 16 to the words, 10 between.
  nearEnd: {
    marginHorizontal: SPACE.gutter,
    marginTop: SPACE.lg + SPACE.xxs,
    paddingTop: SPACE.lg,
    gap: SPACE.sm + SPACE.xxs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLOR.hairline,
  },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
})
