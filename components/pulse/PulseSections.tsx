import { memo, useCallback, type ReactNode, type RefObject } from 'react'
import { FlatList, StyleSheet, View, type ListRenderItemInfo } from 'react-native'

import { Skeleton } from '../Skeleton'
import { Chip } from '../ds/Chip'
import type { Rect } from '../ds/chatShared'
import { EventCard, type EventCardKind } from '../ds/EventCard'
import { SectionHeader } from '../ds/SectionHeader'
import { LocationAskCard } from './LocationAskCard'
import { Rail, RAIL_GAP, SectionReveal } from './Rail'
import { SetList } from './SetList'
import type { BlendnEvent } from '../../lib/api'
import { RADIUS, SPACE } from '../../lib/design/tokens'
import { categoryGlyph } from '../../lib/categoryGlyph'
import { homeCardProps } from '../../lib/pulse'
import type { SeeAllKind } from '../../lib/nearby'
import { SECTION_ORDER, weekendWindow, type PulseSection, type PulseSectionKey } from '../../lib/pulseSections'

/**
 * The Pulse's sections as components (BUILD-SPEC §A; pulse.html). Each takes the
 * events `lib/pulseSections` chose and draws them; none decides what shows.
 * Every section is a memo over stable props, rails are virtualised horizontal
 * lists, and no card fetches anything.
 */

export type CardHandlers = {
  onPress: (event: BlendnEvent) => void
  onPressIn: (event: BlendnEvent) => void
  /** The hold: the event, the card's frame in the window, and which card to lift (a hero, a compact card or a row). */
  onLongPress: (event: BlendnEvent, anchor: Rect, kind: EventCardKind) => void
}

/** The compact card's size: a snap interval is the width plus the rail gap. */
export const COMPACT_WIDTH = 240
export const COMPACT_HEIGHT = 170

/* -------------------------------------------------------------------------- */
/* Happening now                                                              */
/* -------------------------------------------------------------------------- */

type SectionProps = CardHandlers & {
  now: number
  withDistance: boolean
  /** The first card of the page's first section: the coach mark's hole. */
  coachRef?: RefObject<View | null>
}
type CompactProps = SectionProps & { events: BlendnEvent[] }

const CompactRail = memo(function CompactRail({ events, now, withDistance, coachRef, onPress, onPressIn, onLongPress, testID }: CompactProps & { testID: string }) {
  const render = useCallback(
    ({ item, index }: ListRenderItemInfo<BlendnEvent>) => {
      const card = homeCardProps(item, now, withDistance)
      const node = (
        <EventCard
          kind="compact"
          title={card.title}
          time={card.time}
          venue={card.venue}
          distance={card.distance}
          here={card.here}
          going={card.going}
          cover={card.cover}
          onPress={() => onPress(item)}
          onPressIn={() => onPressIn(item)}
          onLongPress={(anchor) => onLongPress(item, anchor, 'compact')}
          testID={`${testID}-${item.id}`}
        />
      )
      return index === 0 && coachRef ? <View ref={coachRef}>{node}</View> : node
    },
    [now, withDistance, coachRef, onPress, onPressIn, onLongPress, testID]
  )
  return <Rail data={events} itemWidth={COMPACT_WIDTH} renderItem={render} testID={testID} />
})

export const NowSection = memo(function NowSection({ section, onSeeAll, ...rest }: SectionProps & { section: PulseSection<BlendnEvent>; onSeeAll: () => void }) {
  return (
    <View style={styles.section}>
      <View style={styles.gutter}>
        <SectionHeader live title="Happening now" count={section.count} more={section.more} action={{ label: 'See all', onPress: onSeeAll }} testID="pulse-now-header" />
      </View>
      <CompactRail {...rest} events={section.events} testID="pulse-now" />
    </View>
  )
})

/* -------------------------------------------------------------------------- */
/* Tonight                                                                    */
/* -------------------------------------------------------------------------- */

export const TonightSection = memo(function TonightSection({
  section,
  now,
  withDistance,
  onSeeAll,
  coachRef,
  onPress,
  onPressIn,
  onLongPress,
}: CardHandlers & { section: PulseSection<BlendnEvent>; now: number; withDistance: boolean; onSeeAll: () => void; coachRef?: RefObject<View | null> }) {
  return (
    <View style={styles.section}>
      <View style={styles.gutter}>
        <SectionHeader title="Tonight" count={section.count} more={section.more} action={{ label: 'See all', onPress: onSeeAll }} testID="pulse-tonight-header" />
      </View>
      <SetList events={section.events} now={now} withDistance={withDistance} coachRef={coachRef} onPress={onPress} onPressIn={onPressIn} onLongPress={(event, anchor) => onLongPress(event, anchor, 'row')} />
    </View>
  )
})

/* -------------------------------------------------------------------------- */
/* Nearby                                                                     */
/* -------------------------------------------------------------------------- */

export const NearbySection = memo(function NearbySection({
  section,
  now,
  onSeeAll,
  coachRef,
  onPress,
  onPressIn,
  onLongPress,
}: CardHandlers & { section: PulseSection<BlendnEvent>; now: number; onSeeAll: () => void; coachRef?: RefObject<View | null> }) {
  return (
    <View style={styles.section}>
      <View style={styles.gutter}>
        <SectionHeader title="Nearby" action={{ label: 'See all', onPress: onSeeAll }} testID="pulse-nearby-header" />
      </View>
      {section.events.map((event, i) => {
        const card = homeCardProps(event, now, true)
        return (
          <View key={event.id} ref={i === 0 ? coachRef : undefined} collapsable={false} style={styles.nearRow}>
            <EventCard
              kind="row"
              lead="distance"
              title={card.title}
              time={card.time}
              venue={card.venue}
              distance={card.distance}
              cover={card.cover}
              onPress={() => onPress(event)}
              onPressIn={() => onPressIn(event)}
              onLongPress={(anchor) => onLongPress(event, anchor, 'row')}
              testID={`pulse-nearby-${event.id}`}
            />
          </View>
        )
      })}
    </View>
  )
})

/** No fix: one card that asks in place; denied reads "Open Settings" and sends there. */
export function NearbyLocationCard({ denied, onAsk }: { denied: boolean; onAsk: () => void }) {
  return (
    <View style={styles.section}>
      <LocationAskCard
        heading="Nearby"
        body="Turn on location to see what’s on near you. Distances stay on your phone until you open an event."
        label={denied ? 'Open Settings' : 'Turn on location'}
        icon="navigation"
        onAsk={onAsk}
        testID="pulse-nearby-ask"
      />
    </View>
  )
}

/* -------------------------------------------------------------------------- */
/* Because you like · This weekend                                            */
/* -------------------------------------------------------------------------- */

export const ForYouSection = memo(function ForYouSection({ section, onSeeAll, ...rest }: SectionProps & { section: PulseSection<BlendnEvent>; onSeeAll: () => void }) {
  return (
    <View style={styles.section}>
      <View style={styles.gutter}>
        <SectionHeader
          title={`Because you like ${section.interest?.name ?? ''}`.trim()}
          caption="From your interests in Me."
          action={{ label: 'See all', onPress: onSeeAll }}
          testID="pulse-foryou-header"
        />
      </View>
      <CompactRail {...rest} events={section.events} testID="pulse-foryou" />
    </View>
  )
})

export const WeekendSection = memo(function WeekendSection({ section, caption, onSeeAll, ...rest }: SectionProps & { section: PulseSection<BlendnEvent>; caption: string; onSeeAll: () => void }) {
  return (
    <View style={styles.section}>
      <View style={styles.gutter}>
        <SectionHeader title="This weekend" caption={caption} action={{ label: 'See all', onPress: onSeeAll }} testID="pulse-weekend-header" />
      </View>
      <CompactRail {...rest} events={section.events} testID="pulse-weekend" />
    </View>
  )
})

/* -------------------------------------------------------------------------- */
/* Everything else                                                            */
/* -------------------------------------------------------------------------- */

/** The heading and the category chips over the day-grouped rows. A chip sorts the rows below, in place. */
export const EverythingHeader = memo(function EverythingHeader({
  chips,
  selected,
  onSelect,
}: {
  chips: { slug: string; name: string; count: number }[]
  selected: string | null
  onSelect: (slug: string | null) => void
}) {
  return (
    <View style={styles.everything}>
      <View style={styles.gutter}>
        <SectionHeader title="Everything else" testID="pulse-everything-header" />
      </View>
      {chips.length ? (
        <FlatList
          horizontal
          data={[{ slug: '', name: 'All', count: 0 }, ...chips]}
          keyExtractor={(c) => c.slug || 'all'}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.chips}
          style={styles.chipsScroll}
          testID="pulse-everything-chips"
          renderItem={({ item }) => (
            <Chip
              label={item.name}
              icon={item.slug ? categoryGlyph(item.slug) : undefined}
              count={item.slug ? item.count : undefined}
              accessibilityLabel={item.slug ? `${item.name}, ${item.count} events` : 'All'}
              selected={(item.slug || null) === selected}
              onPress={() => {
                // Chip's own press plays H.select.
                onSelect(item.slug || null)
              }}
            />
          )}
        />
      ) : null}
    </View>
  )
})

/**
 * The sections in the order `SECTION_ORDER` names. The first one carries the
 * coach mark's target; each rises in once, on the pane's first load
 * (`SectionReveal`). Nearby with no fix becomes the card that asks, in place,
 * once the permission is known not to be coming (`askForLocation`).
 */
export const SectionStack = memo(function SectionStack({
  sections,
  now,
  withDistance,
  handlers,
  coachRef,
  pending,
  askForLocation,
  timeZone,
  onSeeAll,
}: {
  sections: PulseSection<BlendnEvent>[]
  now: number
  withDistance: boolean
  handlers: CardHandlers
  coachRef: RefObject<View | null>
  pending: RefObject<boolean>
  askForLocation: { denied: boolean; onAsk: () => void } | null
  /** The browse city's zone: "This weekend" is that city's. */
  timeZone?: string
  /** A section's "See all": its chip, on this same list (Flow 3b · N1; the Nearby screen is gone). */
  onSeeAll: (kind: SeeAllKind, extra?: { categorySlug?: string }) => void
}) {
  const first = sections[0]?.key
  const at = (key: PulseSectionKey) => (first === key ? coachRef : undefined)
  const weekend = weekendWindow(now, timeZone)
  const nodes: ReactNode[] = []
  let index = 0
  const push = (key: string, node: ReactNode) =>
    nodes.push(
      <SectionReveal key={key} index={index++} pending={pending}>
        {node}
      </SectionReveal>
    )
  for (const key of SECTION_ORDER) {
    const section = sections.find((s) => s.key === key)
    if (key === 'now' && section) {
      push(key, <NowSection section={section} now={now} withDistance={withDistance} coachRef={at('now')} {...handlers} onSeeAll={() => onSeeAll('live')} />)
    } else if (key === 'tonight' && section) {
      push(key, <TonightSection section={section} now={now} withDistance={withDistance} coachRef={at('tonight')} {...handlers} onSeeAll={() => onSeeAll('tonight')} />)
    } else if (key === 'nearby') {
      if (section) push(key, <NearbySection section={section} now={now} coachRef={at('nearby')} {...handlers} onSeeAll={() => onSeeAll('nearby')} />)
      // Only in a feed that has something on: with nothing loaded the page's own state (failed, empty) is the answer, and
      // "Turn on location" under "Couldn't load events" was the wrong way back from offline (audit A24).
      else if (askForLocation && sections.length > 0) push(key, <NearbyLocationCard denied={askForLocation.denied} onAsk={askForLocation.onAsk} />)
    } else if (key === 'forYou' && section) {
      push(key, <ForYouSection section={section} now={now} withDistance={withDistance} coachRef={at('forYou')} {...handlers} onSeeAll={() => onSeeAll('forYou', { categorySlug: section.interest?.slug ?? '' })} />)
    } else if (key === 'weekend' && section) {
      push(
        key,
        <WeekendSection section={section} caption={weekend.label} now={now} withDistance={withDistance} coachRef={at('weekend')} {...handlers} onSeeAll={() => onSeeAll('weekend')} />
      )
    }
  }
  return <>{nodes}</>
})

/**
 * Loading (BUILD-SPEC A9; Option C): the page's own shapes as static `surfaceSunken` blocks: the lead card at its height,
 * then a header bar and two compact cards. Nothing loops; the chips are above it.
 */
const SKELETON = { bar: 26, headerNow: 160 } as const
export function PulseSkeleton({ lead }: { lead: number }) {
  return (
    <View accessibilityLabel="Loading events" accessibilityState={{ busy: true }} testID="pulse-skeleton">
      <View style={[styles.gutter, styles.skeletonLead]}>
        <Skeleton width="100%" height={lead} borderRadius={RADIUS.card} />
      </View>
      <View style={styles.section}>
        <View style={styles.gutter}>
          <Skeleton width={SKELETON.headerNow} height={SKELETON.bar} />
        </View>
        <View style={styles.rail}>
          {[0, 1].map((i) => (
            <Skeleton key={`c${i}`} width={COMPACT_WIDTH} height={COMPACT_HEIGHT} borderRadius={RADIUS.mediaInCard} />
          ))}
        </View>
      </View>
    </View>
  )
}



const styles = StyleSheet.create({
  section: { marginTop: SPACE.xxl, gap: SPACE.md },
  gutter: { paddingHorizontal: SPACE.gutter },
  rail: { paddingHorizontal: SPACE.gutter, flexDirection: 'row', gap: RAIL_GAP },
  skeletonLead: { marginTop: SPACE.lg },
  nearRow: { paddingHorizontal: SPACE.gutter },
  everything: { marginTop: SPACE.xxl, gap: SPACE.md },
  chipsScroll: { flexGrow: 0 },
  chips: { paddingHorizontal: SPACE.gutter, gap: SPACE.sm },
})
