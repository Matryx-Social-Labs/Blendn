import { ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  BANTER_PADDING_HORIZONTAL,
  BANTER_SECTION_GAP,
  BanterBucketHeading,
  BanterConversation,
  BanterHeading,
  BanterLiveRoom,
  BanterRequest,
  BanterSearch,
  type ConversationItem,
} from '../../components/banter/BanterSections'
import { NotificationBell } from '../../components/pulse/NotificationBell'
import { PulseTopBar, TOP_BAR_HEIGHT } from '../../components/pulse/PulseTopBar'
import { EMBER, SPACE } from '../../lib/theme'
import { TAB_BAR_CLEARANCE } from '../(tabs)/_layout'

/**
 * The Banter, against fixtures.
 *
 * Same reason as `__preview` and `__preview-scene`: the real screen needs a
 * login, a network and a conversation that exists, and none of those has
 * anything to do with whether a row is the right height.
 *
 * Deep-link `exp+blendn:///preview/banter`.
 */

/*
 * Rooms only, because that is all Live now holds: the rooms you are checked
 * into. One with a cover and a count, one with neither, so both fallbacks show.
 */
const LIVE = [
  { id: 'l1', title: 'Gala Night', coverUrl: 'https://picsum.photos/seed/gala/200/200', memberCount: 42 },
  { id: 'l2', title: 'Rooftop Sessions', coverUrl: null, memberCount: 0 },
]

const REQUESTS = [
  {
    id: 'r1',
    name: 'Noor A.',
    avatarUrl: 'https://picsum.photos/seed/noor/200/200',
    timeLabel: '12m',
    message: 'Loved your take on the panel earlier — are you going to the after-party?',
  },
  { id: 'r2', name: 'Someone', avatarUrl: null, timeLabel: 'Yesterday', message: 'Wants to message you' },
]

/*
 * Realistic length, not "Chat 1" — a two-word fixture would hide the
 * truncation the one-line preview exists to handle.
 */
const TODAY: ConversationItem[] = [
  {
    id: 'c1',
    title: 'Julian Ember',
    preview: 'The gallery opening starts at 8! Are you coming?',
    timeLabel: '2m',
    avatarUrl: 'https://picsum.photos/seed/julian/200/200',
    kind: 'direct',
    unread: true,
  },
  {
    id: 'c2',
    title: 'Creative Circles #12',
    preview: 'Velvet Otter: New design assets have been uploaded to the shared folder',
    timeLabel: '1h',
    avatarUrl: 'https://picsum.photos/seed/circles/200/200',
    kind: 'event',
    unread: true,
  },
  {
    id: 'c3',
    title: 'Aria Vance',
    preview: 'You: That layout looks incredible. Great job.',
    timeLabel: '4h',
    avatarUrl: 'https://picsum.photos/seed/aria/200/200',
    kind: 'direct',
  },
]

const THIS_WEEK: ConversationItem[] = [
  {
    /*
     * A match who has not revealed and has asked you to. The server sends the
     * pseudonym as the name and no photo, so this row draws the generated mark.
     */
    id: 'c4',
    title: 'Cosmic Panda',
    preview: 'Asked to reveal names',
    previewEmphasis: true,
    timeLabel: 'Yesterday',
    kind: 'direct',
    pseudonymous: true,
  },
  {
    id: 'c5',
    title: 'Jazz on the Pier',
    preview: 'You: See everyone next time',
    timeLabel: 'Tue',
    kind: 'event',
  },
]

const EARLIER: ConversationItem[] = [
  {
    id: 'c6',
    title: 'David K.',
    preview: 'Can you send over the final specs?',
    timeLabel: 'Oct 4',
    avatarUrl: 'https://picsum.photos/seed/davidk/200/200',
    kind: 'direct',
  },
]

export default function BanterPreview() {
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.container}>
      <PulseTopBar title="The Banter" actions={<NotificationBell />} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + TOP_BAR_HEIGHT + SPACE.xxl,
            paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + SPACE.xl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <BanterSearch />

        <View style={styles.section}>
          <BanterHeading title="Live now" />
          <View style={styles.liveList}>
            {LIVE.map((l) => (
              <BanterLiveRoom key={l.id} title={l.title} coverUrl={l.coverUrl} memberCount={l.memberCount} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <BanterHeading title="Requests" detail={String(REQUESTS.length)} />
          <View>
            {REQUESTS.map((r) => (
              <BanterRequest
                key={r.id}
                name={r.name}
                avatarUrl={r.avatarUrl}
                timeLabel={r.timeLabel}
                message={r.message}
                onAccept={() => {}}
                onDecline={() => {}}
              />
            ))}
          </View>
        </View>

        <View>
          <BanterBucketHeading title="Today" action="Mark all read" />
          {TODAY.map((c) => (
            <BanterConversation key={c.id} item={c} />
          ))}
          <View style={styles.bucketGap}>
            <BanterBucketHeading title="This week" />
          </View>
          {THIS_WEEK.map((c) => (
            <BanterConversation key={c.id} item={c} />
          ))}
          <View style={styles.bucketGap}>
            <BanterBucketHeading title="Earlier" />
          </View>
          {EARLIER.map((c) => (
            <BanterConversation key={c.id} item={c} />
          ))}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  content: {
    paddingHorizontal: BANTER_PADDING_HORIZONTAL,
    gap: BANTER_SECTION_GAP,
  },
  section: { gap: SPACE.lg },
  liveList: { gap: SPACE.md },
  // Matches `bucketGap` in app/(tabs)/chat.tsx.
  bucketGap: { marginTop: SPACE.xl },
})
