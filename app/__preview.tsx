import { Stack } from 'expo-router'
import { useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { FeaturedCard, FEATURED_CARD_WIDTH } from '../components/pulse/FeaturedCard'
import { PulseHeader } from '../components/pulse/PulseHeader'
import { PulseTopBar, TOP_BAR_HEIGHT } from '../components/pulse/PulseTopBar'
import { SectionHeader } from '../components/pulse/SectionHeader'
import { UpcomingCard } from '../components/pulse/UpcomingCard'
import { EMBER } from '../lib/theme'

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
 * open `exp+blendn:///__preview` to get the same pixels every time.
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

export default function PulsePreview() {
  const insets = useSafeAreaInsets()
  const [query, setQuery] = useState('')

  return (
    <View style={styles.container}>
      {/*
        No router header. It is 96pt of white chrome the real tab screen does
        not have, and leaving it on makes every vertical measurement taken from
        this harness wrong by exactly that much — which would be a worse lie
        than having no harness.
      */}
      <Stack.Screen options={{ headerShown: false }} />
      <PulseTopBar />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + TOP_BAR_HEIGHT + 32,
            paddingBottom: insets.bottom + 128,
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
        />

        <View style={styles.section}>
          <SectionHeader title="Featured" actionLabel="VIEW ALL" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail}
          >
            {FEATURED.map((e) => (
              <FeaturedCard
                key={e.id}
                title={e.title}
                tag={e.tag}
                imageUrl={null}
                dateLabel={e.dateLabel}
                placeLabel={e.placeLabel}
                width={FEATURED_CARD_WIDTH}
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
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  content: { gap: MAIN_GAP },
  section: { gap: 24 },
  // The rail bleeds to the edge; the gutter is the card's own leading inset.
  rail: { paddingHorizontal: MAIN_PADDING_HORIZONTAL, gap: 16 },
  stack: { paddingHorizontal: MAIN_PADDING_HORIZONTAL, gap: 32 },
})
