import { router } from 'expo-router'
import { memo, useCallback, useMemo, useState, type ReactNode, type RefObject } from 'react'
import { FlatList, StyleSheet, Text, View, type ListRenderItemInfo } from 'react-native'

import { Skeleton } from '../Skeleton'
import { Button } from '../ds/Button'
import { Chip } from '../ds/Chip'
import type { Rect } from '../ds/chatShared'
import { EventCard, type EventCardKind } from '../ds/EventCard'
import { ScrimPill } from '../ds/MonoFamily'
import { SectionHeader } from '../ds/SectionHeader'
import { Sheet } from '../ds/Sheet'
import { font, useBoldText } from '../ds/shared'
import { Icon } from '../ui/Icon'
import { FeaturedCard, FEATURED_CARD_GAP } from './FeaturedCard'
import { LocationAskCard } from './LocationAskCard'
import { Rail, RAIL_GAP, SectionReveal } from './Rail'
import { SetList } from './SetList'
import type { BlendnEvent } from '../../lib/api'
import { COLOR, ICON, RADIUS, SPACE } from '../../lib/design/tokens'
import { categoryGlyph } from '../../lib/categoryGlyph'
import { feedPlaylist } from '../../lib/feedMedia'
import { featuredDateLabel, homeCardProps, peopleLabel, placeLabel } from '../../lib/pulse'
import { featuredLabel, isLiveNow, PROMOTED_LABEL, SECTION_ORDER, weekendWindow, type PulseSection, type PulseSectionKey } from '../../lib/pulseSections'

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
        <SectionHeader live title="Happening now" count={section.count} action={{ label: 'See all', onPress: onSeeAll }} testID="pulse-now-header" />
      </View>
      <CompactRail {...rest} events={section.events} testID="pulse-now" />
    </View>
  )
})

/* -------------------------------------------------------------------------- */
/* Featured                                                                   */
/* -------------------------------------------------------------------------- */

/** Why the section exists, in the owner's words once approved (BUILD-SPEC A3: the copy needs owner approval). */
export const WHY_THESE = {
  title: 'Why you’re seeing these',
  body: 'Featured events are picked by Blend’n or paid for by the organiser. Never more than five, and the order changes every day.',
  promoted: 'The organiser paid for this place.',
  picked: 'Picked by Blend’n.',
} as const

function WhyThese({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const bold = useBoldText()
  return (
    <Sheet visible={visible} onClose={onClose} title={WHY_THESE.title} body={WHY_THESE.body} actions={[{ label: 'Got it', kind: 'strong', onPress: onClose }]} testID="why-these">
      <View style={styles.whyRow}>
        <ScrimPill>
          <Icon name="megaphone" size={ICON.inline} color={COLOR.textSecondary} />
          <Text style={[font('label', bold), styles.secondary]}>{PROMOTED_LABEL.toUpperCase()}</Text>
        </ScrimPill>
        <Text style={[font('meta', bold), styles.secondary, styles.fill]}>{WHY_THESE.promoted}</Text>
      </View>
      <View style={styles.whyRow}>
        <Chip label="No label" variant="outline" />
        <Text style={[font('meta', bold), styles.secondary, styles.fill]}>{WHY_THESE.picked}</Text>
      </View>
    </Sheet>
  )
}

const FEATURED_VIEWABILITY = { itemVisiblePercentThreshold: 60, minimumViewTime: 250 }

export const FeaturedSection = memo(function FeaturedSection({
  section,
  layout,
  now,
  visible,
  coachRef,
  onPress,
  onPressIn,
  onLongPress,
}: CardHandlers & {
  section: PulseSection<BlendnEvent>
  layout: { width: number; inset: number }
  now: number
  /** The pane is on screen: only then may the settled card play its media. */
  visible: boolean
  coachRef?: RefObject<View | null>
}) {
  const [why, setWhy] = useState(false)
  const [active, setActive] = useState(0)
  const cards = useMemo(
    () =>
      section.events.map((e) => ({
        id: e.id,
        title: e.title,
        tag: e.category || null,
        playlist: feedPlaylist(e.media, e.cover_image_url),
        dateLabel: featuredDateLabel(e.start_time, new Date(now)),
        placeLabel: placeLabel(e),
        peopleLabel: peopleLabel(e, isLiveNow(e, now)),
        promoted: featuredLabel(e) === PROMOTED_LABEL,
        onPress: () => onPress(e),
        onPressIn: () => onPressIn(e),
        onLongPress: (anchor: Rect) => onLongPress(e, anchor, 'hero'),
      })),
    [section.events, now, onPress, onPressIn, onLongPress]
  )
  const onViewable = useCallback(({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
    const first = viewableItems.find((v) => v.index !== null)
    if (first?.index != null) setActive(first.index)
  }, [])
  const solo = cards.length === 1
  return (
    <View style={styles.section}>
      <View style={styles.gutter}>
        <SectionHeader
          title="Featured"
          count={section.count}
          right={
            <Button kind="tertiary" size="sm" label="Why these?" icon="info" onPress={() => setWhy(true)} accessibilityLabel="Why these?" accessibilityHint="Explains how Featured events are chosen" testID="why-these-open" />
          }
          testID="pulse-featured-header"
        />
      </View>
      {solo ? (
        <View style={[styles.soloBleed, { paddingHorizontal: layout.inset }]}>
          <View ref={coachRef}>
            <FeaturedCard {...cards[0]} isActive={visible} width={layout.width} />
          </View>
        </View>
      ) : (
        <Rail
          testID="pulse-featured"
          data={cards}
          itemWidth={layout.width}
          gap={FEATURED_CARD_GAP}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={FEATURED_VIEWABILITY}
          renderItem={({ item, index }) => (
            <View ref={index === 0 ? coachRef : undefined}>
              <FeaturedCard {...item} isActive={visible && index === active} width={layout.width} />
            </View>
          )}
        />
      )}
      <WhyThese visible={why} onClose={() => setWhy(false)} />
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
        <SectionHeader title="Tonight" count={section.count} action={{ label: 'See all', onPress: onSeeAll }} testID="pulse-tonight-header" />
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
  visible,
  handlers,
  coachRef,
  pending,
  featuredLayout,
  askForLocation,
}: {
  sections: PulseSection<BlendnEvent>[]
  now: number
  withDistance: boolean
  visible: boolean
  handlers: CardHandlers
  coachRef: RefObject<View | null>
  pending: RefObject<boolean>
  featuredLayout: (solo: boolean) => { width: number; inset: number }
  askForLocation: { denied: boolean; onAsk: () => void } | null
}) {
  const first = sections[0]?.key
  const at = (key: PulseSectionKey) => (first === key ? coachRef : undefined)
  const weekend = weekendWindow(now)
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
      push(key, <NowSection section={section} now={now} withDistance={withDistance} coachRef={at('now')} {...handlers} onSeeAll={() => goSeeAll('live')} />)
    } else if (key === 'featured' && section) {
      push(key, <FeaturedSection section={section} layout={featuredLayout(section.events.length === 1)} now={now} visible={visible} coachRef={at('featured')} {...handlers} />)
    } else if (key === 'tonight' && section) {
      push(key, <TonightSection section={section} now={now} withDistance={withDistance} coachRef={at('tonight')} {...handlers} onSeeAll={() => goSeeAll('tonight')} />)
    } else if (key === 'nearby') {
      if (section) push(key, <NearbySection section={section} now={now} coachRef={at('nearby')} {...handlers} onSeeAll={() => goSeeAll('nearby')} />)
      else if (askForLocation) push(key, <NearbyLocationCard denied={askForLocation.denied} onAsk={askForLocation.onAsk} />)
    } else if (key === 'forYou' && section) {
      push(key, <ForYouSection section={section} now={now} withDistance={withDistance} coachRef={at('forYou')} {...handlers} onSeeAll={() => goSeeAll('forYou', { categorySlug: section.interest?.slug ?? '' })} />)
    } else if (key === 'weekend' && section) {
      push(
        key,
        <WeekendSection section={section} caption={weekend.label} now={now} withDistance={withDistance} coachRef={at('weekend')} {...handlers} onSeeAll={() => goSeeAll('weekend', { startDate: weekend.startDate, endDate: weekend.endDate })} />
      )
    }
  }
  return <>{nodes}</>
})

/**
 * Loading (BUILD-SPEC A9): the sections' own shapes as static `surfaceSunken`
 * blocks: a header bar and two compact cards, a header bar and two hero cards.
 * Nothing loops; the real header and search are above it.
 */
const SKELETON = { bar: 26, hero: { width: 313, height: 340 }, headerNow: 160, headerFeatured: 110 } as const
export function PulseSkeleton() {
  return (
    <View accessibilityLabel="Loading events" accessibilityState={{ busy: true }} testID="pulse-skeleton">
      <View style={[styles.section, styles.skeletonFirst]}>
        <View style={styles.gutter}>
          <Skeleton width={SKELETON.headerNow} height={SKELETON.bar} />
        </View>
        <View style={styles.rail}>
          {[0, 1].map((i) => (
            <Skeleton key={`c${i}`} width={COMPACT_WIDTH} height={COMPACT_HEIGHT} borderRadius={RADIUS.mediaInCard} />
          ))}
        </View>
      </View>
      <View style={styles.section}>
        <View style={styles.gutter}>
          <Skeleton width={SKELETON.headerFeatured} height={SKELETON.bar} />
        </View>
        <View style={styles.rail}>
          {[0, 1].map((i) => (
            <Skeleton key={`f${i}`} width={SKELETON.hero.width} height={SKELETON.hero.height} borderRadius={RADIUS.card} />
          ))}
        </View>
      </View>
    </View>
  )
}

/** Where "See all" goes: the full list, scoped to the section. */
export function seeAllHref(kind: 'live' | 'tonight' | 'nearby' | 'forYou' | 'weekend', extra: Record<string, string> = {}) {
  return { pathname: '/nearby-events', params: { filter: kind, ...extra } } as never
}
export const goSeeAll = (kind: Parameters<typeof seeAllHref>[0], extra?: Record<string, string>) => router.push(seeAllHref(kind, extra))


const styles = StyleSheet.create({
  section: { marginTop: SPACE.xxl, gap: SPACE.md },
  gutter: { paddingHorizontal: SPACE.gutter },
  rail: { paddingHorizontal: SPACE.gutter, gap: RAIL_GAP },
  soloBleed: {},
  skeletonFirst: { marginTop: SPACE.lg + SPACE.xs },
  nearRow: { paddingHorizontal: SPACE.gutter },
  everything: { marginTop: SPACE.xxl, gap: SPACE.md },
  chipsScroll: { flexGrow: 0 },
  chips: { paddingHorizontal: SPACE.gutter, gap: SPACE.sm },
  whyRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.sm + SPACE.xxs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLOR.hairline },
  fill: { flex: 1 },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
})
