import type { ReactNode } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { COLOR, ICON, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, minTarget, useBoldText, useIncreaseContrast } from '../ds/shared'
import ScalePress from '../motion/ScalePress'
import { Icon } from '../ui/Icon'
import { Material } from '../ui/Material'

/**
 * The Flow 5 builder's header capsule (flow5.js, room and DM alike): 56 tall on
 * iOS and 60 on Android, 28 round, padding 0 8 0 4, 10 between its pieces;
 * 44 pt back and ⋮ wells (back 24, ⋮ 22); the name in Satoshi Medium 16/20,
 * the line under it 13/16, each row's pieces 6 apart, the bell-slash 14.
 */
export const CHAT_CAPSULE = {
  heightAndroid: 60,
  radius: RADIUS.button,
  // design-exception: the Flow 5 builder's header gap, off the SPACE scale
  gap: 10,
  // design-exception: the Flow 5 builder's row gap, off the SPACE scale
  innerGap: 6,
  // design-exception: the Flow 5 builder's name, Satoshi Medium 16/20 (no TYPE role)
  title: { fontSize: 16, lineHeight: 20 },
  // design-exception: the Flow 5 builder's line under it, 13/16 (no TYPE role)
  subtitle: { fontSize: 13, lineHeight: 16 },
  moreIcon: 22,
  mutedIcon: 14,
} as const

/** The capsule's height on this platform: the builder's 56 (iOS) or 60 (Android). */
export const chatCapsuleHeight = () => (Platform.OS === 'android' ? CHAT_CAPSULE.heightAndroid : SIZE.input)

/** The capsule's top edge: a step under the status bar (Flow 5 frames: 56 on a 402 pt iPhone, 52 on Android). */
const capsuleTop = (insetTop: number) => insetTop + SPACE.xs

/** Where a screen's content starts under the capsule: its bottom edge, then 12 (the frames' 124). */
export function chatHeaderBottom(insetTop: number) {
  return capsuleTop(insetTop) + chatCapsuleHeight() + SPACE.md
}

/**
 * The feed's frame: its window starts at the capsule's bottom edge, as the
 * Flow 5 room and DM frames draw it (the feed at 124 under a capsule ending at
 * 112) — nothing passes behind the status bar or in the strip around the
 * capsule (drive 2: a sender's name read between the clock and the header).
 * The first message sits the frames' 12 below it. `extra`: what sits under the
 * capsule before the first message (the DM's reveal bar).
 */
export function chatFeedFrame(insetTop: number, extra = 0) {
  return { style: { marginTop: capsuleTop(insetTop) + chatCapsuleHeight() }, paddingTop: SPACE.md + extra }
}

/**
 * The room's and the DM's header (Flow 5 room and DM frames): a floating
 * bar-glass capsule (`CHAT_CAPSULE`), 16 in from the edges, that the
 * feed scrolls under. Back · the room's square cover or the person's round
 * face · the name (a still bell-slash when you muted the room) and one line
 * under it · ⋮.
 *
 * `onIdentity`: the face and the name are one button (the DM, once they are
 * a name to you); otherwise they are the header's text. Back and ⋮ are bare
 * 44 pt targets on the glass. No haptic on any of them.
 */
export function ChatHeader({
  title,
  muted = false,
  leading,
  subtitle,
  onBack,
  onMore,
  moreLabel,
  onIdentity,
  identityHint,
  testID,
}: {
  title: string
  /** You muted the room's notifications: a still bell-slash, never the word. */
  muted?: boolean
  /** The 36 pt square cover (a room) or round face (a person). */
  leading: ReactNode
  /** The line under the name: the live count, or the reveal state with its eye. */
  subtitle?: ReactNode
  onBack: () => void
  onMore: () => void
  moreLabel: string
  onIdentity?: () => void
  identityHint?: string
  testID?: string
}) {
  const insets = useSafeAreaInsets()
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const android = Platform.OS === 'android'

  const identity = (
    <>
      {leading}
      <View style={styles.titles}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('bodyStrong', bold), CHAT_CAPSULE.title, styles.title]}>
            {title}
          </Text>
          {muted ? (
            <View accessible accessibilityLabel="Notifications muted">
              <Icon name="bell-off" size={CHAT_CAPSULE.mutedIcon} color={COLOR.textSecondary} />
            </View>
          ) : null}
        </View>
        {subtitle ? <View style={styles.subtitle}>{subtitle}</View> : null}
      </View>
    </>
  )

  return (
    <View testID={testID} pointerEvents="box-none" style={[styles.place, { top: capsuleTop(insets.top) }]}>
      <Material testID={testID && `${testID}-capsule`} role="bar" style={[styles.capsule, { height: chatCapsuleHeight() }, contrast && IC_HAIRLINE]}>
        <ScalePress
          testID={testID && `${testID}-back`}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={(minTarget() - SIZE.circleButton) / 2}
          style={styles.circle}
        >
          <Icon name={android ? 'arrow-left' : 'chevron-left'} size={ICON.nav} />
        </ScalePress>
        {onIdentity ? (
          <ScalePress
            testID={testID && `${testID}-identity`}
            onPress={onIdentity}
            pressedScale={1}
            accessibilityRole="button"
            accessibilityLabel={title}
            accessibilityHint={identityHint}
            style={styles.identity}
          >
            {identity}
          </ScalePress>
        ) : (
          <View accessible accessibilityRole="header" style={styles.identity}>
            {identity}
          </View>
        )}
        <ScalePress
          testID={testID && `${testID}-more`}
          onPress={onMore}
          accessibilityRole="button"
          accessibilityLabel={moreLabel}
          hitSlop={(minTarget() - SIZE.circleButton) / 2}
          style={styles.circle}
        >
          <Icon name="ellipsis-vertical" size={CHAT_CAPSULE.moreIcon} />
        </ScalePress>
      </Material>
    </View>
  )
}

/** The live dot, a Geist Mono count and "in the room": the room header's line. */
export function SubtitleText({ children }: { children: ReactNode }) {
  const bold = useBoldText()
  return (
    <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold), CHAT_CAPSULE.subtitle, styles.secondary]}>
      {children}
    </Text>
  )
}

const styles = StyleSheet.create({
  place: { position: 'absolute', left: SPACE.lg, right: SPACE.lg },
  capsule: {
    borderRadius: CHAT_CAPSULE.radius,
    flexDirection: 'row',
    alignItems: 'center',
    gap: CHAT_CAPSULE.gap,
    paddingLeft: SPACE.xs,
    paddingRight: SPACE.sm,
    overflow: 'hidden',
  },
  circle: { width: SIZE.circleButton, height: SIZE.circleButton, borderRadius: RADIUS.circleButton, alignItems: 'center', justifyContent: 'center' },
  identity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: CHAT_CAPSULE.gap },
  titles: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: CHAT_CAPSULE.innerGap },
  title: { color: COLOR.textPrimary, flexShrink: 1 },
  subtitle: { flexDirection: 'row', alignItems: 'center', gap: CHAT_CAPSULE.innerGap },
  secondary: { color: COLOR.textSecondary, flexShrink: 1 },
})
