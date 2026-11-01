import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { COLOR, DURATION, RADIUS, SPACE } from "../../lib/design/tokens";
import { Grain } from "../ds/Grain";
import { Orbs } from "../ds/Orbs";
import { useSelection } from "../ds/shared";
import { StateScreen } from "../ds/StateScreen";

/** The card sits 30% down, as the frame draws it (260 pt on an 874 pt screen). */
const CARD_TOP = 0.3;

/**
 * The event was cancelled while you were inside (Flow 4 R4.1 4.6, #25): the
 * Room crossfades to a calm solid card on the brand orbs. The server has
 * already checked you out, so the card says so and offers the one useful
 * thing, what else is on tonight; Close leaves. No haptic: it is unsolicited,
 * like the auto-checkout notice. Screen readers hear it once, as it arrives.
 *
 * Motion: a crossfade over `base`, and nothing else (Reduce Motion is the same).
 */
export function RoomCancelled({
  title,
  onSeeTonight,
  onClose,
  testID,
}: {
  title: string;
  onSeeTonight: () => void;
  onClose: () => void;
  testID?: string;
}) {
  const { height } = useWindowDimensions();
  const sel = useSelection();
  const said = `${title} was cancelled`;
  // Heard once, politely, as it arrives: the StateScreen says itself, queued (M4).
  return (
    <Animated.View
      testID={testID}
      style={styles.page}
      accessibilityViewIsModal
      entering={FadeIn.duration(DURATION.base)}
      exiting={FadeOut.duration(DURATION.quick)}
    >
      {/* The overlay's hue, not the brand set's ember and violet (D31): one hue per screen. */}
      <Orbs set="brand" tint={sel.edge} testID={testID && `${testID}-orbs`} />
      <Grain />
      {/* A scroll, so a long title at the largest type never clips the actions: the card still sits where the frame puts it. */}
      <ScrollView
        testID={testID && `${testID}-scroll`}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: Math.round(height * CARD_TOP) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <StateScreen
            icon="calendar-x"
            title={said}
            body="The organizer called it off. You’re checked out."
            actions={[
              {
                label: "See what’s on tonight",
                kind: "lit",
                onPress: onSeeTonight,
              },
              { label: "Close", kind: "tertiary", onPress: onClose },
            ]}
            testID={testID && `${testID}-state`}
          />
        </View>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  page: { ...StyleSheet.absoluteFill, backgroundColor: COLOR.ink },
  scroll: { flexGrow: 1, paddingBottom: SPACE.xxxl },
  card: {
    marginHorizontal: SPACE.gutter,
    padding: SPACE.xl,
    borderRadius: RADIUS.card,
    backgroundColor: COLOR.surface,
  },
});
