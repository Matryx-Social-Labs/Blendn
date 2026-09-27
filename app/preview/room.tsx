import { Ionicons } from '@expo/vector-icons'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { NotificationBell } from '../../components/pulse/NotificationBell'
import { PulseTopBar, TOP_BAR_HEIGHT } from '../../components/pulse/PulseTopBar'
import { RoomVisibilityBanner } from '../../components/RoomVisibilityBanner'
import { EMBER, GUTTER, ICON, SPACE, TYPE } from '../../lib/theme'

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
        leading={<Ionicons name="chevron-down" size={ICON.lg} color={EMBER.textPrimary} />}
        actions={
          <>
            <Text style={styles.checkOut}>Check out</Text>
            <Ionicons name="options-outline" size={ICON.lg} color={EMBER.textPrimary} />
            <NotificationBell />
          </>
        }
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: TOP_BAR_HEIGHT + SPACE.lg, paddingBottom: insets.bottom + SPACE.xxl },
        ]}
      >
        <Case label="WORST CASE — LONG PSEUDONYM, BOTH FIELDS MISSING">
          <RoomVisibilityBanner
            revealed={false}
            pseudonym={LONG_PSEUDONYM}
            onToggle={noop}
            canReveal={false}
            missing="a name and a photo"
          />
        </Case>

        <Case label="BLOCKED ON ONE FIELD">
          <RoomVisibilityBanner
            revealed={false}
            pseudonym="Quiet Otter"
            onToggle={noop}
            canReveal={false}
            missing="a photo"
          />
        </Case>

        <Case label="ANONYMOUS, LONG PSEUDONYM — THE ACTION MUST NOT CLIP">
          <RoomVisibilityBanner revealed={false} pseudonym={LONG_PSEUDONYM} onToggle={noop} />
        </Case>

        <Case label="ANONYMOUS, NO PSEUDONYM YET">
          <RoomVisibilityBanner revealed={false} onToggle={noop} />
        </Case>

        <Case label="NAMED — THE WARM BORDER IS THE ONE WORTH NOTICING">
          <RoomVisibilityBanner revealed onToggle={noop} />
        </Case>

        <Case label="SAFETY — NAMED AND BLOCKED: LEAVING IS STILL OFFERED">
          <RoomVisibilityBanner revealed onToggle={noop} canReveal={false} missing="a photo" />
        </Case>

        <Case label="BUSY">
          <RoomVisibilityBanner revealed={false} pseudonym="Quiet Otter" onToggle={noop} busy />
        </Case>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  content: { paddingHorizontal: GUTTER, gap: SPACE.xl },
  case: { gap: SPACE.sm },
  caseLabel: { ...TYPE.label, color: EMBER.textTertiary },
  checkOut: { ...TYPE.button, color: EMBER.textSecondary },
})
