import { Ionicons } from '@expo/vector-icons'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  BANTER_PADDING_HORIZONTAL,
  BANTER_SECTION_GAP,
  BanterConversation,
  BanterHeading,
  BanterPinned,
  BanterSearch,
  type ConversationItem,
  type PinnedItem,
} from '../../components/banter/BanterSections'
import { NotificationBell } from '../../components/pulse/NotificationBell'
import { PulseTopBar, TOP_BAR_HEIGHT } from '../../components/pulse/PulseTopBar'
import { EMBER } from '../../lib/theme'
import { TAB_BAR_CLEARANCE } from './_layout'

/**
 * The Banter, against fixtures — frame `1141:5247`.
 *
 * Same reason as `__preview` and `__preview-scene`: the real screen needs a
 * login, a network and a conversation that exists, and none of those has
 * anything to do with whether a row is the right height.
 *
 * Deep-link `exp+blendn:///__preview-banter`.
 */

/*
 * Realistic length, not "Chat 1".
 *
 * The frame's own previews run to a full sentence — "The gallery opening
 * starts at 8! Are you coming?" — and a two-word fixture would hide the
 * wrapping the two-line preview exists to handle.
 */
/*
 * Event rooms, because that is all the rail holds.
 *
 * It was four people when the section was called "Pinned". It is called
 * "Live now" and holds the rooms you are checked into, so a fixture with a
 * face in it would show a layout the screen cannot produce.
 */
const PINNED: PinnedItem[] = [
  { id: 'p1', name: 'Gala Night', isEvent: true, online: true },
  { id: 'p2', name: 'Rooftop Sessions', isEvent: true, online: true },
]

const CONVERSATIONS: ConversationItem[] = [
  {
    id: 'c1',
    title: 'Julian Ember',
    preview: 'The gallery opening starts at 8! Are you coming?',
    timeLabel: '2m ago',
    avatarUrl: 'https://picsum.photos/seed/julian/200/200',
    kind: 'direct',
    unread: true,
  },
  {
    id: 'c2',
    title: 'Creative Circles #12',
    preview: 'New design assets have been uploaded...',
    timeLabel: '1h ago',
    kind: 'event',
  },
  {
    id: 'c3',
    title: 'Aria Vance',
    preview: 'That layout looks incredible. Great job.',
    timeLabel: '4h ago',
    avatarUrl: 'https://picsum.photos/seed/aria/200/200',
    kind: 'direct',
  },
  {
    /*
     * A match who has not revealed. The server sends the pseudonym as the name
     * and no photo, so this row must draw the generated mark rather than an
     * empty circle — the case that was rendering as a grey hole.
     */
    id: 'c3b',
    title: 'Cosmic Panda',
    preview: 'Nice to finally talk properly.',
    timeLabel: '5h ago',
    kind: 'direct',
    pseudonymous: true,
  },
  {
    id: 'c4',
    title: 'Product Team',
    preview: 'Liam: Meeting moved to 10 AM tomorrow.',
    timeLabel: 'Yesterday',
    kind: 'group',
  },
  {
    id: 'c5',
    title: 'David K.',
    preview: 'Can you send over the final specs?',
    timeLabel: 'Tuesday',
    avatarUrl: 'https://picsum.photos/seed/davidk/200/200',
    kind: 'direct',
  },
]

export default function BanterPreview() {
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.container}>
      {/*
        The same bar as the Pulse and the Scene. Frame `1141:5345` is the
        identical component — 64pt, `rgba(15,14,14,0.8)`, 12pt blur, the accent
        wordmark — differing only in what it holds. That is exactly what the
        `leading` / `actions` slots were added for.
      */}
      <PulseTopBar
        title="The Banter"
        leading={<BarButton icon="menu" label="Menu" />}
        actions={
          <>
            <BarButton icon="search" label="Search" />
            <NotificationBell />
          </>
        }
      />

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
        <BanterSearch />

        <View style={styles.section}>
          <BanterHeading title="Live now" trailingIcon="sensors" />
          {/*
            Horizontal, and it bleeds the page gutter for the same reason the
            Pulse's Featured row does: a rail that stops inside the margin
            reads as a clipped list rather than one that runs off the edge.
          */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.railBleed}
            contentContainerStyle={styles.rail}
          >
            {PINNED.map((p) => (
              <BanterPinned key={p.id} item={p} />
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <BanterHeading title="Recent" action="Mark all read" />
          <View>
            {CONVERSATIONS.map((c) => (
              <BanterConversation key={c.id} item={c} />
            ))}
          </View>
        </View>
      </ScrollView>

    </View>
  )
}

/** A 36pt glyph in a 44pt hit area — the top bar's control, as the Scene has it. */
function BarButton({
  icon,
  label,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  label: string
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [styles.barButton, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name={icon} size={18} color={EMBER.textPrimary} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  content: {
    paddingHorizontal: BANTER_PADDING_HORIZONTAL,
    gap: BANTER_SECTION_GAP,
  },
  // Frame `1141:5255`: the heading and its rail are 16 apart, not 32.
  section: { gap: 16 },
  railBleed: { marginHorizontal: -BANTER_PADDING_HORIZONTAL },
  // Frame `1141:5261`: gap 24, `pb-[8px]`.
  rail: { gap: 24, paddingBottom: 8, paddingHorizontal: BANTER_PADDING_HORIZONTAL },
  barButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
})
