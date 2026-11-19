import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

import { COLOR, ICON as GLYPH, RADIUS, SPACE } from "../../lib/design/tokens";
import { locateRide } from "../../lib/homeMap";
import { MAP_THEME } from "../../lib/mapTheme";
import { OPACITY } from "../../lib/theme";
import ScalePress from "../motion/ScalePress";
import { MapGlass } from "../ds/Banner";
import { Icon } from "../ui/Icon";
import { Text } from "../ui/Text";

/**
 * "My location", riding a gap above the drawer as it moves (`locateRide`):
 * fading out as the drawer rises past half, untouchable and unread at full.
 * Following you: the glyph bright, its stroke stepped up; moved away: dimmer
 * and lighter (the icon set is outlined only). Asking for a fix: dimmed and
 * busy until the ask settles, so a second tap is not lost in silence.
 * Once the map has left a fix you have, it is "Back to you" (pulse-map 05, 07): glass, your violet dot, one tap back
 * and following again. Your touch ended every automatic move; this is the way to have them back.
 */
export function LocateButton({
  visible,
  following,
  back = false,
  pending,
  drawerTop,
  drawer,
  lift,
  onPress,
}: {
  /** False at full: still drawn while its fade finishes, but neither tapped nor read. */
  visible: boolean;
  following: boolean;
  /** The map has left a fix you have: the pill "Back to you" instead of the glyph. */
  back?: boolean;
  /** Asking the phone for a fix. */
  pending: boolean;
  /** The drawer's top edge, as it animates. */
  drawerTop: SharedValue<number>;
  /** The drawer's top edge at half and at full. */
  drawer: { half: number; full: number };
  /** How far a banner on the map pushes it up (the banner's height and its gap; 0 with none). */
  lift?: SharedValue<number>;
  onPress: () => void;
}) {
  const ride = useAnimatedStyle(() => {
    const { translateY, opacity } = locateRide(
      drawerTop.get(),
      drawer,
      lift ? lift.get() : 0,
    );
    return { transform: [{ translateY }], opacity };
  });
  return (
    <Animated.View
      style={[styles.rider, ride]}
      pointerEvents={visible ? "box-none" : "none"}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
    >
      {back && !pending ? (
        <ScalePress
          onPress={onPress}
          style={styles.pill}
          accessibilityRole="button"
          accessibilityLabel="Back to you"
          testID="map-back-to-you"
        >
          <MapGlass radius={RADIUS.capsule} />
          <View style={styles.youDot} />
          <Text variant="caption" color={COLOR.textPrimary} numberOfLines={1}>
            Back to you
          </Text>
        </ScalePress>
      ) : (
        <ScalePress
          onPress={onPress}
          disabled={pending}
          style={[styles.button, pending && styles.pending]}
          accessibilityRole="button"
          accessibilityLabel="Show my location"
          accessibilityState={{
            selected: following,
            busy: pending,
            disabled: pending,
          }}
        >
          <Icon
            name="navigation"
            size={GLYPH.control}
            color={following ? COLOR.textPrimary : COLOR.textSecondary}
            active={following}
          />
        </ScalePress>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  rider: { position: "absolute", top: 0, right: SPACE.lg },
  // The weight of the app's other floating controls: the page colour at 60%, no border.
  button: {
    width: MAP_THEME.locate.sizePx,
    height: MAP_THEME.locate.sizePx,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.scrim,
  },
  pending: { opacity: OPACITY.disabled },
  // Board 05/07: content-wide glass, the target kept at the button's 44 pt.
  pill: {
    minHeight: MAP_THEME.locate.sizePx,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.xs + SPACE.xxs,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.capsule,
  },
  youDot: {
    width: MAP_THEME.you.radiusPx,
    height: MAP_THEME.you.radiusPx,
    borderRadius: RADIUS.capsule,
    backgroundColor: MAP_THEME.you.dot,
    borderWidth: 1,
    borderColor: MAP_THEME.you.ring,
  },
});
