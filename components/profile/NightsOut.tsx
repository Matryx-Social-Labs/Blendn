import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'

import { nightLabel, nightsView, NIGHT_TILES, NIGHTS_WEEKS, type NightsStatus } from '../../lib/meProfile'
import { COLOR, RADIUS, SPACE } from '../../lib/design/tokens'
import { Banner } from '../ds/Banner'
import { Button } from '../ds/Button'
import { font, useBoldText } from '../ds/shared'
import { SkeletonBlock } from '../Skeleton'
import { MemoryTile, MEMORY_HEIGHT } from './MemoryTile'
import { ProfileSection } from './ProfileSections'

type Night = { id: string; title: string; start_time: string; cover_image_url: string | null }

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

/** `n nights out in the last 12 weeks`, in one voice for the line and the screen reader. */
export const nightsLine = (nights: number) => `${nights} ${nights === 1 ? 'night' : 'nights'} out in the last ${NIGHTS_WEEKS} weeks`

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
}) {
  const bold = useBoldText()
  const { width } = useWindowDimensions()
  const view = nightsView(status, events)
  // Three across, two 8 pt gaps between them, inside the screen's gutters.
  const cell = { width: Math.floor((width - SPACE.gutter * 2 - SPACE.sm * (COLUMNS - 1)) / COLUMNS) }

  if (view.kind === 'first') {
    return (
      <View testID="nights-first" style={styles.first}>
        <Text accessibilityRole="header" style={[font('heading', bold), styles.ink]}>
          {FIRST_NIGHT.title}
        </Text>
        <Text style={[font('meta', bold), styles.muted]}>{FIRST_NIGHT.body}</Text>
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

      {view.kind === 'tiles' ? (
        <>
          {view.nights > 0 ? <Text style={[font('meta', bold), styles.muted]}>{nightsLine(view.nights)}</Text> : null}
          <View testID="nights-grid" style={styles.grid}>
            {events.slice(0, NIGHT_TILES).map((event) => (
              <View key={event.id} style={cell}>
                <MemoryTile title={event.title} imageUrl={event.cover_image_url} when={nightLabel(event.start_time)} onPress={() => onOpenEvent(event.id)} />
              </View>
            ))}
          </View>
        </>
      ) : null}
    </ProfileSection>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  first: { borderRadius: RADIUS.mediaInCard, backgroundColor: COLOR.surfaceSunken, padding: FIRST_PAD, gap: SPACE.sm },
  firstAction: { alignSelf: 'stretch', marginTop: SPACE.sm },
  ink: { color: COLOR.textPrimary },
  muted: { color: COLOR.textSecondary },
})
