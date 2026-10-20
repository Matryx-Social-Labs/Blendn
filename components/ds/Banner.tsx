import { useEffect } from 'react'
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'

import { Icon, type IconName } from '../ui/Icon'
import { COLOR, FONT_FAMILY, ICON, RADIUS, SPACE, TYPE } from '../../lib/design/tokens'
import { OPACITY } from '../../lib/theme'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, minTarget, useBoldText, useIncreaseContrast } from './shared'

export type BannerKind = 'offline' | 'paused' | 'info' | 'visibility'

const LOOK: Record<BannerKind, { fill: string; icon: IconName }> = {
  offline: { fill: COLOR.destructiveTint, icon: 'cloud-off' },
  paused: { fill: COLOR.warningTint, icon: 'circle-pause' },
  info: { fill: COLOR.surface, icon: 'info' },
  visibility: { fill: COLOR.surface, icon: 'eye' },
}

export type BannerProps = {
  kind: BannerKind
  text: string
  /** Drawn in Geist Mono right after `text` (a time: "since 9:41"). */
  mono?: string
  /** The kind's own glyph unless given. */
  icon?: IconName
  action?: { label: string; onPress: () => void }
  /** The action is in flight: dimmed and held. */
  busy?: boolean
  testID?: string
}

/**
 * A persistent status strip (guidelines/components/Banner.html): always solid,
 * never translucent over content. Banners differ in greyscale: their own icon
 * and lead word carry the meaning; the two tints (destructive for offline,
 * warning for paused) support it.
 *
 * No haptic: a banner arrives unsolicited, and its action's haptic belongs to
 * the action. A system banner is announced politely when it appears; the
 * VisibilityBanner is read in place. Text scales freely; past 1.3× the action
 * wraps under the sentence. Increase Contrast adds the 50% hairline.
 */
export function Banner({ kind, text, mono, icon, action, busy = false, testID }: BannerProps) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const { fontScale } = useWindowDimensions()
  const announced = kind !== 'visibility'
  const wrapped = fontScale > CONTROL_FONT_CAP

  useEffect(() => {
    if (announced && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(mono ? `${text} ${mono}` : text)
  }, [announced, text, mono])

  return (
    <View
      testID={testID}
      style={[styles.banner, { backgroundColor: LOOK[kind].fill }, contrast && IC_HAIRLINE, wrapped && styles.wrapped]}
    >
      <Icon name={icon ?? LOOK[kind].icon} size={ICON.control} />
      <Text accessibilityLiveRegion={announced ? 'polite' : 'none'} style={[font('meta', bold), styles.text]}>
        {mono ? (
          <>
            {text}
            <Text style={font('meta', bold, FONT_FAMILY.mono[500])}>{` ${mono}`}</Text>
          </>
        ) : (
          text
        )}
      </Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy }}
          disabled={busy}
          hitSlop={(minTarget() - TYPE.meta.lineHeight) / 2}
          onPress={action.onPress}
          style={[busy && { opacity: OPACITY.disabled }, wrapped && styles.under]}
        >
          <Text numberOfLines={1} style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.action]}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export type Visibility = 'named' | 'anon' | 'hidden' | 'blocked'

/** §12: each state its own icon and sentence. Revealing is gated on a name and photo; going anonymous never is. */
/** "as Night Cat", or plainly anonymous when the room's pseudonym for you isn't known on this phone. */
const asName = (name?: string) => (name ? `in this room as ${name}` : 'anonymous in this room')

const VISIBILITY: Record<Visibility, { icon: IconName; text: (name: string | undefined, missing: string) => string; action: (missing: string) => string }> = {
  named: {
    icon: 'eye',
    text: (name) => `You’re in this room as ${name}, with your photo. People here can see you.`,
    action: () => 'Go anonymous',
  },
  anon: { icon: 'eye-off', text: (name) => `You’re ${asName(name)}. Nobody here sees your name or photo.`, action: () => 'Show who I am' },
  hidden: { icon: 'cloud-off', text: () => 'You’re not listed here. Show online status is off.', action: () => 'Turn it on' },
  blocked: {
    icon: 'eye-off',
    text: (name, missing) => `You’re ${asName(name)}. Add ${missing} to your profile first; that’s what other people would see.`,
    action: (missing) => `Add ${missing}`,
  },
}

/**
 * The always-on statement of how the room sees you (§12). It never collapses.
 */
export function VisibilityBanner({
  state,
  name,
  missing = 'a photo',
  onAction,
  busy,
  testID,
}: {
  state: Visibility
  /** The name the room shows: yours when named, the pseudonym otherwise (omit when it isn't known). */
  name?: string
  /** Blocked: what a reveal still needs ("a photo", "a name", "a name and a photo"; `revealReadiness`). */
  missing?: string
  onAction: () => void
  busy?: boolean
  testID?: string
}) {
  const v = VISIBILITY[state]
  return (
    <Banner kind="visibility" icon={v.icon} text={v.text(name, missing)} action={{ label: v.action(missing), onPress: onAction }} busy={busy} testID={testID} />
  )
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: RADIUS.rowInCard,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  wrapped: { flexWrap: 'wrap' },
  text: { flex: 1, color: COLOR.textPrimary },
  under: { flexBasis: '100%', paddingLeft: ICON.control + SPACE.md },
  action: { color: COLOR.textPrimary },
})
