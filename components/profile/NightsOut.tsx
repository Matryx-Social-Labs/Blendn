import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'

import { nightLabel, nightsView, NIGHT_TILES, type NightsStatus } from '../../lib/meProfile'
import { COLOR, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'
import { Banner } from '../ds/Banner'
import { Button } from '../ds/Button'
import { font, useBoldText } from '../ds/shared'
import { SkeletonBlock } from '../Skeleton'
import { MemoryTile, MEMORY_HEIGHT } from './MemoryTile'
import { ProfileSection } from './ProfileSections'

type Night = { id: string; title: string; start_time: string; cover_image_url: string | null; timezone?: string }

const COLUMNS = 3
/** Flow 6 `me`: the first-night card pads 20, between the 16 and 24 steps. */
// design-exception: the frame's card padding is 20
const FIRST_PAD = 20

/** Flow 6 `me` 06: what a first night asks of you. */
export const FIRST_NIGHT = {
  title: 'Your first night isn’t written yet',
  body: 'Check in somewhere and it lands here, with the people you met.',
  action: 'See what’s on tonight',
} as const

/** Flow 6 `me` 05: the notice over the last good list. */
export const NIGHTS_FAILED = { withTiles: 'Your nights didn’t load. Showing what we had.', alone: 'Your nights didn’t load.' } as const

/**
 * What the count counts, and over what: every ended night since you joined. With the nights still running (said under the
 * tiles) it is the NIGHTS stat; "in the last 12 weeks" counted the shown tiles only and read "3" under 46 (rc7).
 */
export const nightsLine = (ended: number) => `${ended.toLocaleString('en-US')} ended ${ended === 1 ? 'night' : 'nights'} since you joined`

const nightsCount = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'night' : 'nights'}`
const landsOnceEnded = (n: number) => `${n === 1 ? 'it lands' : 'they land'} here once ${n === 1 ? 'it ends' : 'they end'}`

/** D-H1: a count above 0 with nothing the list may show yet. Never "your first night". */
export const NIGHTS_HELD = {
  locked: (total: number) => `${nightsCount(total)} · the older ones are with Blend’n+`,
  /** Under the tiles: the server's admin S-1 contract, the latest 3 ended nights shown and the rest counted. */
  more: (locked: number) => `${locked.toLocaleString('en-US')} more ${locked === 1 ? 'night' : 'nights'} with Blend’n+`,
  pending: (total: number) => `${nightsCount(total)} · ${landsOnceEnded(total)}`,
  /** Beside the ended tiles: the count's nights the grid doesn't draw yet, so the stat and the section add up (RC 7). */
  running: (n: number) => `${nightsCount(n)} still running · ${landsOnceEnded(n)}`,
  action: 'See Blend’n+',
} as const

/**
 * Nights out on Me (Flow 6 `me` 01 · 04 · 05 · 06): the section heading with See all, the count in a line, and the six latest
 * nights as a grid of three. Loading is that grid as skeletons at the tiles' own size; a refresh that failed keeps the last good
 * grid under a notice with Try again; no night yet is an invitation, never a grid ("an empty grid reads as something you failed at").
 */
export function NightsOut({
  status,
  events,
  onOpenEvent,
  onSeeAll,
  onRetry,
  retrying = false,
  onFirstNight,
  lockedCount = 0,
  total = null,
  runningCount = 0,
  onUnlock,
}: {
  status: NightsStatus
  /** Past events you attended, newest first (`pastEventRows`). */
  events: readonly Night[]
  onOpenEvent: (id: string) => void
  onSeeAll: () => void
  onRetry: () => void
  retrying?: boolean
  /** What the first-night card's button does (open what's on). */
  onFirstNight: () => void
  /** Nights the server kept behind Blend'n+ (`/me/attendance` `lockedCount`). */
  lockedCount?: number
  /** Every night you have, the locked ones included; null when the server didn't say. */
  total?: number | null
  /** Nights in `total` that haven't ended, so aren't tiles yet (`nightsCounts().running`). */
  runningCount?: number
  /** What "See Blend'n+" does when nights are locked. */
  onUnlock?: () => void
}) {
  const bold = useBoldText()
  const { width } = useWindowDimensions()
  const view = nightsView(status, events, lockedCount, total, runningCount)
  // Three across, two 8 pt gaps between them, inside the screen's gutters.
  const cell = { width: Math.floor((width - SPACE.gutter * 2 - SPACE.sm * (COLUMNS - 1)) / COLUMNS) }

  if (view.kind === 'first') {
    return (
      <View testID="nights-first" style={styles.first}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.heading} accessibilityRole="header" style={[font('heading', bold), styles.ink]}>
          {FIRST_NIGHT.title}
        </Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.muted]}>{FIRST_NIGHT.body}</Text>
        <Button kind="lit" size="md" label={FIRST_NIGHT.action} onPress={onFirstNight} style={styles.firstAction} />
      </View>
    )
  }

  return (
    <ProfileSection title="Nights out" action={view.kind === 'tiles' ? { label: 'See all', onPress: onSeeAll } : undefined} testID="nights-out">
      {view.kind === 'loading' ? (
        <View testID="nights-loading" accessibilityLabel="Loading your nights" accessibilityState={{ busy: true }} style={styles.grid}>
          {Array.from({ length: COLUMNS }, (_, i) => (
            <View key={i} style={cell}>
              <SkeletonBlock height={MEMORY_HEIGHT} borderRadius={RADIUS.mediaInCard} />
            </View>
          ))}
        </View>
      ) : null}

      {view.kind === 'failed' || (view.kind === 'tiles' && view.failed) ? (
        <Banner
          kind="info"
          text={view.kind === 'tiles' ? NIGHTS_FAILED.withTiles : NIGHTS_FAILED.alone}
          action={{ label: 'Try again', onPress: onRetry }}
          busy={retrying}
          testID="nights-failed"
        />
      ) : null}

      {view.kind === 'locked' || view.kind === 'pending' ? (
        <View testID={`nights-${view.kind}`} style={styles.held}>
          <Text style={[font('meta', bold), styles.muted]} maxFontSizeMultiplier={MAX_FONT_SCALE.meta}>
            {view.kind === 'locked' ? NIGHTS_HELD.locked(view.total) : NIGHTS_HELD.pending(view.total)}
          </Text>
          {view.kind === 'locked' && onUnlock ? <Button kind="lit" size="md" label={NIGHTS_HELD.action} onPress={onUnlock} /> : null}
        </View>
      ) : null}

      {view.kind === 'tiles' ? (
        <>
          {view.ended > 0 ? <Text testID="nights-line" maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.muted]}>{nightsLine(view.ended)}</Text> : null}
          <View testID="nights-grid" style={styles.grid}>
            {events.slice(0, NIGHT_TILES).map((event) => (
              <View key={event.id} style={cell}>
                <MemoryTile title={event.title} imageUrl={event.cover_image_url} when={nightLabel(event.start_time, event.timezone)} onPress={() => onOpenEvent(event.id)} />
              </View>
            ))}
          </View>
          {view.running > 0 ? (
            <Text testID="nights-running" style={[font('meta', bold), styles.muted]} maxFontSizeMultiplier={MAX_FONT_SCALE.meta}>
              {NIGHTS_HELD.running(view.running)}
            </Text>
          ) : null}
          {view.locked > 0 ? (
            <View testID="nights-more" style={styles.held}>
              <Text style={[font('meta', bold), styles.muted]} maxFontSizeMultiplier={MAX_FONT_SCALE.meta}>
                {NIGHTS_HELD.more(view.locked)}
              </Text>
              {onUnlock ? <Button kind="lit" size="md" label={NIGHTS_HELD.action} onPress={onUnlock} /> : null}
            </View>
          ) : null}
        </>
      ) : null}
    </ProfileSection>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  first: { borderRadius: RADIUS.mediaInCard, backgroundColor: COLOR.surfaceSunken, padding: FIRST_PAD, gap: SPACE.sm },
  held: { gap: SPACE.sm, alignItems: 'flex-start' },
  firstAction: { alignSelf: 'stretch', marginTop: SPACE.sm },
  ink: { color: COLOR.textPrimary },
  muted: { color: COLOR.textSecondary },
})
