import { barTop } from '../../lib/barGeometry'
import type { ReactNode } from 'react'
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { COLOR, FONT_FAMILY, ICON, RADIUS, SIZE, SPACE, TYPE } from '../../lib/design/tokens'
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
  moreIcon: 22,
  mutedIcon: 14,
} as const

/** The two-line name over the one-line subtitle, at the builder's line heights: what the capsule's text needs at the default size. */
/** The Flow 5 name: the button role's 16/20 in Satoshi Medium (SCRUM-865: it was a raw 16/20 beside the roles). The line under it is caption. */
const TITLE_TYPE = (bold: boolean) => font('button', bold, TYPE.bodyStrong.fontFamily)
const TEXT_BLOCK = 2 * TYPE.button.lineHeight + TYPE.caption.lineHeight

/**
 * The capsule's height on this platform: the builder's 56 (iOS) or 60 (Android) at the default text size, and taller by
 * the text block's growth as the text size grows (the header stops growing with it at `CONTROL_FONT_CAP`), so a name
 * that wraps to two lines keeps its subtitle. `fontScale`: the window's (`useWindowDimensions`); the screens that place
 * things under the capsule pass the same one, so the feed starts where the capsule ends.
 */
export function chatCapsuleHeight(fontScale = 1) {
  const base = Platform.OS === 'android' ? CHAT_CAPSULE.heightAndroid : SIZE.input
  return base + Math.round((Math.min(Math.max(fontScale, 1), CONTROL_FONT_CAP) - 1) * TEXT_BLOCK)
}

/** The capsule's top edge: a step under the status bar (Flow 5 frames: 56 on a 402 pt iPhone, 52 on Android). */
const capsuleTop = (insetTop: number) => barTop(insetTop)

/** Where a screen's content starts under the capsule: its bottom edge, then 12 (the frames' 124). */
export function chatHeaderBottom(insetTop: number, fontScale = 1) {
  return capsuleTop(insetTop) + chatCapsuleHeight(fontScale) + SPACE.md
}

/**
 * The feed's frame: its window starts at the capsule's bottom edge, as the
 * Flow 5 room and DM frames draw it (the feed at 124 under a capsule ending at
 * 112) — nothing passes behind the status bar or in the strip around the
 * capsule (drive 2: a sender's name read between the clock and the header).
 * The first message sits the frames' 12 below it. `extra`: a strip pinned
 * under the capsule (the DM's reveal bar, a Blend's sides), at
 * `chatHeaderBottom`, measured: the window starts under it, so nothing the
 * feed holds is ever behind it (TG-04). As the content's top padding it was
 * only room at rest, and a feed that follows its end scrolled the match card
 * and the empty state up behind the opaque strip (RC audit C3, C6).
 */
export function chatFeedFrame(insetTop: number, extra = 0, fontScale = 1) {
  const strip = extra > 0 ? SPACE.md + extra : 0
  return { style: { marginTop: capsuleTop(insetTop) + chatCapsuleHeight(fontScale) + strip }, paddingTop: SPACE.md }
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
  const { fontScale } = useWindowDimensions()
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const android = Platform.OS === 'android'

  const identity = (
    <>
      {leading}
      <View style={styles.titles}>
        <View style={styles.titleRow}>
          <Text numberOfLines={2} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[TITLE_TYPE(bold), styles.title]}>
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
      <Material testID={testID && `${testID}-capsule`} role="bar" style={[styles.capsule, { height: chatCapsuleHeight(fontScale) }, contrast && IC_HAIRLINE]}>
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
    <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('caption', bold), styles.secondary]}>
      {children}
    </Text>
  )
}

/**
 * The pre-event room's line (Flow 15 #8): a clock, "Opens in" and the time in Geist Mono, then the people already in
 * it when there are five or more. It stands where the live count does, and gives it back when the room opens.
 */
export function OpensLine({ label, spoken, count }: { label: string; spoken: string; count: number | null }) {
  const bold = useBoldText()
  return (
    <>
      <Icon name="clock" size={CHAT_CAPSULE.mutedIcon} color={COLOR.textSecondary} />
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={CONTROL_FONT_CAP}
        accessibilityLabel={`Opens in ${spoken}${count ? `, ${count} in the room` : ''}`}
        style={[font('caption', bold), styles.secondary]}
      >
        Opens in <Text style={[font('caption', bold, FONT_FAMILY.mono[500]), styles.primary, styles.tabular]}>{label}</Text>
        {count ? ` · ${count} in the room` : ''}
      </Text>
    </>
  )
}

const styles = StyleSheet.create({
  place: { position: 'absolute', left: SPACE.lg, right: SPACE.lg },
  primary: { color: COLOR.textPrimary },
  tabular: { fontVariant: ['tabular-nums'] },
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
