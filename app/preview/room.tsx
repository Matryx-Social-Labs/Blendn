import { Ionicons } from '@expo/vector-icons'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { NotificationBell } from '../../components/pulse/NotificationBell'
import { PulseTopBar, TOP_BAR_HEIGHT } from '../../components/pulse/PulseTopBar'
import { RoomVisibilityBanner } from '../../components/RoomVisibilityBanner'
import { EMBER, EMBER_TYPE } from '../../lib/theme'

/**
 * The room's visibility banner, in every state it can be drawn in.
 *
 * Deep-link `exp+blendn:///preview/room`.
 *
 * The real banner needs a check-in, a room and a profile in a particular shape.
 * None of that decides whether the blocked reason wraps, or whether a long
 * pseudonym pushes "Show who I am" off the right edge — which is what this is
 * for.
 *
 * **Worst case first**, as the Grid harness does. The banner was a flat row
 * until the capability gate needed a second line under the title, so it is now
 * a row containing a column, and the arrangement most likely to be drawn wrong
 * is the longest pseudonym beside the longest missing-field sentence.
 *
 * The last fixture is the one that matters most: **named, and blocked.**
 * Leaving must never be gated — a gate that could trap somebody in the named
 * state turns a safety control into the thing they need protecting from — so
 * "Go anonymous" has to render enabled there. That is a property you can see.
 */
const LONG_PSEUDONYM = 'Constellation Wanderer'

function Case({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.case}>
      <Text style={styles.caseLabel}>{label}</Text>
      {children}
    </View>
  )
}

export default function RoomPreview() {
  const insets = useSafeAreaInsets()
  const noop = () => {}

  return (
    <View style={styles.container}>
      {/*
        The bar as the room draws it, so the settings control can be looked at
        beside Check out and the bell rather than only in a diff. Three items is
        the most this slot ever holds.
      */}
      <PulseTopBar
        title="The Grid"
        leading={<Ionicons name="chevron-down" size={20} color={EMBER.textPrimary} />}
        actions={
          <>
            <Text style={styles.checkOut}>Check out</Text>
            <Ionicons name="options-outline" size={20} color={EMBER.textPrimary} />
            <NotificationBell />
          </>
        }
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: TOP_BAR_HEIGHT + 16, paddingBottom: insets.bottom + 32 },
        ]}
      >
        <Case label="WORST CASE — long pseudonym, both fields missing">
          <RoomVisibilityBanner
            revealed={false}
            pseudonym={LONG_PSEUDONYM}
            onToggle={noop}
            canReveal={false}
            missing="a name and a photo"
          />
        </Case>

        <Case label="Blocked on one field">
          <RoomVisibilityBanner
            revealed={false}
            pseudonym="Quiet Otter"
            onToggle={noop}
            canReveal={false}
            missing="a photo"
          />
        </Case>

        <Case label="Anonymous, long pseudonym — the action must not clip">
          <RoomVisibilityBanner revealed={false} pseudonym={LONG_PSEUDONYM} onToggle={noop} />
        </Case>

        <Case label="Anonymous, no pseudonym yet">
          <RoomVisibilityBanner revealed={false} onToggle={noop} />
        </Case>

        <Case label="Named — the warm border is the one worth noticing">
          <RoomVisibilityBanner revealed onToggle={noop} />
        </Case>

        <Case label="SAFETY — named AND blocked: leaving is still offered">
          <RoomVisibilityBanner revealed onToggle={noop} canReveal={false} missing="a photo" />
        </Case>

        <Case label="Busy">
          <RoomVisibilityBanner revealed={false} pseudonym="Quiet Otter" onToggle={noop} busy />
        </Case>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  content: { paddingHorizontal: 16, gap: 20 },
  case: { gap: 8 },
  caseLabel: { ...EMBER_TYPE.helper, color: EMBER.textTertiary, fontSize: 11, letterSpacing: 0.6 },
  checkOut: { ...EMBER_TYPE.helper, color: EMBER.textSecondary, fontSize: 13 },
})
