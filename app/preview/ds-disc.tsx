import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Disc } from '../../components/ds/Disc'
import ScalePress from '../../components/motion/ScalePress'
import { Material } from '../../components/ui/Material'
import { COLOR, RADIUS, SIZE, SPACE, TYPE } from '../../lib/design/tokens'
import type { RoomButtonTarget } from '../../lib/roomButton'

/**
 * The centre disc in every state, and the night played one step at a time.
 *
 * Deep-link `exp+blendn:///preview/ds-disc`.
 *
 * The real disc needs a geofence, a clock, a check-in and a busy room to move
 * through its states; this fakes the target. Reduce Motion follows the
 * system setting (read once, at launch).
 */
const STILLS: { id: string; caption: string; target: RoomButtonTarget }[] = [
  { id: 'a', caption: '(a) idle', target: { state: 'idle', eventId: null, badge: 0 } },
  { id: 'b', caption: '(b) today', target: { state: 'today', eventId: 'e', badge: 0 } },
  { id: 'c', caption: '(c) check-in', target: { state: 'checkin', eventId: 'e', badge: 0 } },
  { id: 'd', caption: '(d) live', target: { state: 'live', eventId: 'e', badge: 0 } },
  { id: 'dn', caption: '(d) 3 unread', target: { state: 'live', eventId: 'e', badge: 3 } },
  { id: 'dn-9', caption: '(d) 12 unread', target: { state: 'live', eventId: 'e', badge: 12 } },
]
const [IDLE, TODAY, CHECK_IN, LIVE, UNREAD] = STILLS

/** transitions.js's "Play the whole night": a → b → c → d → unread → read → a. */
const NIGHT = [IDLE, TODAY, CHECK_IN, LIVE, UNREAD, LIVE, IDLE]

export default function DsDiscPreview() {
  const insets = useSafeAreaInsets()
  const [at, setAt] = useState(0)
  const now = NIGHT[at]
  const next = NIGHT[(at + 1) % NIGHT.length]

  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACE.xl }]}>
      <Text style={styles.title}>The centre disc</Text>
      <Text style={styles.meta}>Variant A, “the disc fills”. Each state as a still.</Text>

      <View style={styles.grid}>
        {STILLS.map(({ id, caption, target }) => (
          <View key={id} style={styles.cell}>
            <Disc target={target} venue="Toit" onPress={() => {}} testID={`ds-disc-still-${id}`} />
            <Text style={styles.caption}>{caption}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.meta}>The night, one transition at a time.</Text>
      <View style={styles.stage}>
        <Material role="bar" style={styles.bar} />
        <Disc target={now.target} venue="Toit" onPress={() => {}} testID="ds-disc-stepper" />
      </View>
      <Text style={styles.caption} testID="ds-disc-step-caption">
        {now.caption}
      </Text>
      <ScalePress
        onPress={() => setAt((i) => (i + 1) % NIGHT.length)}
        accessibilityRole="button"
        style={styles.next}
        testID="ds-disc-next"
      >
        <Text style={styles.nextText}>Next: {next.caption}</Text>
      </ScalePress>
    </ScrollView>
  )
}

/** Room above each disc for (c)'s label. */
const LABEL_ROOM = SPACE.xxxl

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLOR.ink },
  content: { paddingHorizontal: SPACE.gutter, paddingBottom: SPACE.xxxl, gap: SPACE.lg },
  title: { ...TYPE.title, color: COLOR.textPrimary },
  meta: { ...TYPE.meta, color: COLOR.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: SPACE.xl },
  cell: { width: '33.3%', alignItems: 'center', gap: SPACE.sm, paddingTop: LABEL_ROOM },
  caption: { ...TYPE.label, color: COLOR.textTertiary, textAlign: 'center' },
  stage: { height: SIZE.tabBar, marginTop: LABEL_ROOM, alignItems: 'center', justifyContent: 'center' },
  bar: { ...StyleSheet.absoluteFill, borderRadius: RADIUS.tabBar },
  next: {
    alignSelf: 'center',
    paddingHorizontal: SPACE.xl,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.surface,
  },
  nextText: { ...TYPE.button, color: COLOR.textPrimary },
})
