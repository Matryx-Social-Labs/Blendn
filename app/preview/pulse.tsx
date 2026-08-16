import { useState } from 'react'
import { Dimensions, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import NearbyEventCard from '../../components/NearbyEventCard'
import { FilterSheet } from '../../components/pulse/FilterControl'
import {
  FeaturedCard,
  FEATURED_CARD_GAP,
  featuredCardLayout,
} from '../../components/pulse/FeaturedCard'
import { NotificationBell } from '../../components/pulse/NotificationBell'
import { PulseHeader } from '../../components/pulse/PulseHeader'
import { PulseTopBar, TOP_BAR_HEIGHT } from '../../components/pulse/PulseTopBar'
import { SectionHeader } from '../../components/pulse/SectionHeader'
import { UpcomingCard } from '../../components/pulse/UpcomingCard'
import { activeFilterCount, NO_FILTERS, type EventFilters } from '../../lib/eventFilters'
import { feedPlaylist } from '../../lib/feedMedia'
import { EMBER } from '../../lib/theme'
import { TAB_BAR_CLEARANCE, tabBarTop } from '../(tabs)/_layout'

/**
 * The Pulse, rendered against fixtures — a screenshot harness, not a screen.
 *
 * ## Why this exists
 *
 * Eight passes at this design shipped without anyone ever comparing a rendered
 * screen to the frame. The loop was: read frame → write code → grep code →
 * ship. Every test in `__tests__` is a source grep; there is not one render
 * test, because `react-test-renderer` 19 returns `null` for a bare `<View>` in
 * this jest-expo setup. So the suite can be entirely green while the screen is
 * wrong, and it was, repeatedly.
 *
 * The missing half was never a test. It was a way to *look at the thing*
 * cheaply and deterministically. Getting to the real Pulse needs a login, a
 * network, a location permission and a staging database with unexpired events —
 * four things that can each independently blank the screen and none of which
 * has anything to do with whether a card is the right height.
 *
 * So: fixed data, no auth, no network, deep-linkable. Boot the simulator and
 * open `exp+blendn:///preview/pulse` to get the same pixels every time.
 *
 * ## What it is not
 *
 * Not a replacement for testing the real screen — it renders the *components*,
 * so it proves card and section geometry, type scale and palette. It cannot
 * catch anything about data, empty states or scroll behaviour.
 *
 * Dev-only. `app/_layout.tsx` lets a signed-out user reach it behind `__DEV__`,
 * and it is excluded from a production bundle by the same flag.
 */

/** Frame `1141:4643` → Main: `paddingHorizontal 12`, `gap 48`. */
const MAIN_PADDING_HORIZONTAL = 12
const MAIN_GAP = 48
const SCREEN_W = Dimensions.get('window').width
const SCREEN_HEIGHT = Dimensions.get('window').height

/*
 * Deliberately boring strings of realistic length.
 *
 * A fixture reading "Test Event 1" is shorter than any real title and hides
 * exactly the wrapping bugs a screenshot is meant to catch — which is the same
 * reason the staging seed is not allowed to say "QA".
 */
const FEATURED = [
  {
    id: 'f1',
    title: 'Sunset Rooftop Sessions',
    tag: 'Live music',
    // A real clip, so the harness exercises the poster-then-video path rather
    // than only the still one. Public sample; the seed uses our own assets.
    videoUrl:
      'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4',
    dateLabel: 'Fri, 22 Aug',
    placeLabel: 'The Humming Tree, Indiranagar',
  },
  {
    id: 'f2',
    title: 'Analog Film Photography Walk',
    tag: 'Culture',
    dateLabel: 'Sat, 23 Aug',
    placeLabel: 'Cubbon Park',
  },
]

const UPCOMING = [
  {
    id: 'u1',
    title: 'Founders & Filter Coffee',
    category: 'Networking',
    dayLabel: '24',
    joinedCount: 142,
    distanceLabel: '1.2 km',
    description:
      'An early start with people building things in the city. No pitches, no badges — just coffee and whatever you are working on.',
  },
  {
    id: 'u2',
    title: 'Kannada Poetry Open Mic',
    category: 'Spoken word',
    dayLabel: 'Sep 2',
    joinedCount: 38,
    distanceLabel: '4.8 km',
    description: 'Read something, or come and listen. Sign-ups open at the door.',
  },
]

/*
 * The frame's Nearby section is asymmetric — a `Large Featured Local` 366x782
 * with a 366x342 image over a 440pt body, then a `Small Info Local` 366x343.
 * We draw a uniform stack of `NearbyEventCard`. Rendered here so the difference
 * is visible rather than argued about.
 */
const NEARBY = [
  {
    id: 'n1',
    title: 'The Umbra Kitchen',
    address: 'Lavelle Road',
    cover_image_url: null,
  },
  {
    id: 'n2',
    title: 'Basement Six Listening Bar',
    address: 'Church Street',
    cover_image_url: null,
  },
]

export default function PulsePreview() {
  const insets = useSafeAreaInsets()
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<EventFilters>(NO_FILTERS)
  const [draft, setDraft] = useState<EventFilters>(NO_FILTERS)
  const [sheetOpen, setSheetOpen] = useState(false)
  // Same sizing the real screen uses, or the harness proves the wrong geometry.
  const featured = featuredCardLayout(insets, tabBarTop(SCREEN_HEIGHT, insets.bottom))

  return (
    <View style={styles.container}>
      <PulseTopBar actions={<NotificationBell />} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + TOP_BAR_HEIGHT + 32,
            paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + 24,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <PulseHeader
          title="The "
          titleAccent="Pulse"
          city="Bengaluru"
          onPressCity={() => {}}
          query={query}
          onChangeQuery={setQuery}
          activeFilterCount={activeFilterCount(filters)}
          onPressFilter={() => {
            setDraft(filters)
            setSheetOpen(true)
          }}
        />

        <View style={styles.section}>
          <SectionHeader title="Featured" actionLabel="VIEW ALL" onAction={() => {}} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.rail, { paddingHorizontal: featured.inset }]}
          >
            {FEATURED.map((e, i) => (
              <FeaturedCard
                key={e.id}
                title={e.title}
                tag={e.tag}
                playlist={feedPlaylist(
                  'videoUrl' in e
                    ? [
                        {
                          id: e.id,
                          url: (e as { videoUrl?: string }).videoUrl,
                          thumbnail_url: 'https://loremflickr.com/1024/1024/concert?lock=3',
                          type: 'video',
                          order: 1,
                        },
                      ]
                    : [],
                  'https://loremflickr.com/1024/1024/rooftop,party?lock=11'
                )}
                isActive={i === 0}
                dateLabel={e.dateLabel}
                placeLabel={e.placeLabel}
                width={featured.width}
                onPress={() => {}}
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <SectionHeader title="Upcoming" />
          <View style={styles.stack}>
            {UPCOMING.map((e) => (
              <UpcomingCard
                key={e.id}
                title={e.title}
                category={e.category}
                imageUrl={null}
                dayLabel={e.dayLabel}
                joinedCount={e.joinedCount}
                distanceLabel={e.distanceLabel}
                description={e.description}
                onPress={() => {}}
              />
            ))}
          </View>
        </View>
        <View style={styles.section}>
          <SectionHeader title="Nearby Experiences" />
          <View style={styles.stack}>
            {NEARBY.map((e) => (
              <NearbyEventCard
                key={e.id}
                event={e as never}
                width={SCREEN_W - MAIN_PADDING_HORIZONTAL * 2}
                timeLabel="Tonight, 8:00 PM"
                locationLabel={`${e.address} · 2.1 km`}
              />
            ))}
          </View>
        </View>
      </ScrollView>

      <FilterSheet
        visible={sheetOpen}
        draft={draft}
        categories={[
          { slug: 'social', name: 'Social' },
          { slug: 'music', name: 'Music' },
          { slug: 'food-drink', name: 'Food & Drink' },
          { slug: 'nightlife', name: 'Nightlife' },
          { slug: 'arts-culture', name: 'Arts & Culture' },
          { slug: 'sports', name: 'Sports' },
        ]}
        hasLocation
        onChange={setDraft}
        onApply={() => {
          setFilters(draft)
          setSheetOpen(false)
        }}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  content: { gap: MAIN_GAP },
  section: { gap: 24 },
  /*
   * The Featured row, and it does **not** take `Main`'s gutter.
   *
   * Frame `1141:4660` masks the carousel at section-x `-12` — full-bleed 390,
   * with card 1 at x=24 inside it. This had `MAIN_PADDING_HORIZONTAL` (12) and
   * a 16pt gap, so the harness was demonstrating a card 12pt too far left with
   * the cards 8pt too close together, which is exactly the geometry the real
   * screen was being checked against.
   */
  rail: { gap: FEATURED_CARD_GAP },
  stack: { paddingHorizontal: MAIN_PADDING_HORIZONTAL, gap: 32 },
})
