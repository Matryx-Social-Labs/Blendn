import type { ReactNode } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { COLOR, ICON, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, minTarget, useBoldText, useIncreaseContrast } from '../ds/shared'
import ScalePress from '../motion/ScalePress'
import { Icon } from '../ui/Icon'
import { Material } from '../ui/Material'

/** The capsule's top edge: a step under the status bar (Flow 5 frames: 56 on a 402 pt iPhone). */
const capsuleTop = (insetTop: number) => insetTop + SPACE.xs

/** Where a screen's content starts under the capsule: its bottom edge, then 12 (the frames' 124). */
export function chatHeaderBottom(insetTop: number) {
  return capsuleTop(insetTop) + SIZE.input + SPACE.md
}

/**
 * The room's and the DM's header (Flow 5 room and DM frames): a floating
 * bar-glass capsule, 56 tall and 28 round, 16 in from the edges, that the
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
          <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('bodyStrong', bold), styles.title]}>
            {title}
          </Text>
          {muted ? (
            <View accessible accessibilityLabel="Notifications muted">
              <Icon name="bell-off" size={ICON.inline} color={COLOR.textSecondary} />
            </View>
          ) : null}
        </View>
        {subtitle ? <View style={styles.subtitle}>{subtitle}</View> : null}
      </View>
    </>
  )

  return (
    <View testID={testID} pointerEvents="box-none" style={[styles.place, { top: capsuleTop(insets.top) }]}>
      <Material role="bar" style={[styles.capsule, contrast && IC_HAIRLINE]}>
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
          <Icon name="ellipsis-vertical" size={ICON.nav} />
        </ScalePress>
      </Material>
    </View>
  )
}

/** The live dot, a Geist Mono count and "in the room": the room header's line. */
export function SubtitleText({ children }: { children: ReactNode }) {
  const bold = useBoldText()
  return (
    <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold), styles.secondary]}>
      {children}
    </Text>
  )
}

const styles = StyleSheet.create({
  place: { position: 'absolute', left: SPACE.lg, right: SPACE.lg },
  capsule: {
    minHeight: SIZE.input,
    borderRadius: RADIUS.button,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingLeft: SPACE.xs,
    paddingRight: SPACE.sm,
    overflow: 'hidden',
  },
  circle: { width: SIZE.circleButton, height: SIZE.circleButton, alignItems: 'center', justifyContent: 'center' },
  identity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  titles: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  title: { color: COLOR.textPrimary, flexShrink: 1 },
  subtitle: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  secondary: { color: COLOR.textSecondary, flexShrink: 1 },
})
