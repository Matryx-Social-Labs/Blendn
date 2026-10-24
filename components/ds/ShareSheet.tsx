import { useEffect, useState } from 'react'
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'

import ScalePress from '../motion/ScalePress'
import { Icon, type IconName } from '../ui/Icon'
import { COLOR, FONT_FAMILY, ICON, RADIUS, SIZE, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { joinParts, LinkPreviewCard, type LinkPreview, type ShareEvent } from './LinkPreviewCard'
import { monoCaption } from './MonoFamily'
import { Sheet } from './Sheet'
import { announceOutcome, CONTROL_FONT_CAP, font, IC_HAIRLINE, useBoldText, useIncreaseContrast, useSelection } from './shared'

export type ShareTarget =
  | { kind: 'event'; event: ShareEvent }
  | { kind: 'venue'; name: string; typeLabel: string; area: string; url: string }
  | { kind: 'invite'; url: string }

/** #46: Copy reads "Copied" for 2 s; Android 13+ shows its own clipboard confirmation, so we skip ours. */
const COPIED_MS = 2000
const ANDROID_CLIPBOARD_TOAST_API = 33
const DISC = SIZE.primary

function previewOf(share: ShareTarget): LinkPreview {
  if (share.kind === 'event') return { template: 'event', event: share.event }
  if (share.kind === 'venue') return { template: 'venue', name: share.name, typeLabel: share.typeLabel, area: share.area }
  return { template: 'invite' }
}

const placeOf = (e: ShareEvent) => (e.unlisted ? e.area : joinParts([e.venue, e.area], ', '))

/**
 * Sharing shows you the card before anyone else sees it
 * (guidelines/components/ShareSheet.html, Flow 16 · 16.1): the real preview
 * ("This is what they'll see"), the title and date, then WhatsApp (the white
 * disc, first), Instagram Story, Copy link, More…. An event adds the message
 * that goes with the link. Unlisted shows the area only, never the venue or
 * street. With no WhatsApp installed, three actions.
 *
 * The tray rises with the card already drawn (#46). No haptic on open or on
 * Copy (C20); `H.primary` on the press-in of WhatsApp and Story, `H.select`
 * on More… (Flow 16's annotations), which hands over to the system's sheet. Copy's glyph turns to
 * a check over `base` and reads "Copied" for 2 s (at once under Reduce Motion).
 * The card is read as one line: "This is what they'll see: {title}, {date},
 * {venue}".
 */
export function ShareSheet({
  visible,
  onClose,
  share,
  whatsApp = true,
  onWhatsApp,
  onStory,
  onCopy,
  onMore,
  onDismissed,
  testID,
}: {
  visible: boolean
  onClose: () => void
  share: ShareTarget
  /** Installed? Without it the tray drops it (More… covers it). */
  whatsApp?: boolean
  onWhatsApp: () => void
  /** Copies the link first ("Link copied — add it with the Link sticker"), then opens Instagram. */
  onStory: () => void
  onCopy: () => void
  onMore: () => void
  /** Once the tray has left the screen: a sheet that follows it (the Story options) waits for this. */
  onDismissed?: () => void
  testID?: string
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const { width } = useWindowDimensions()
  /** Each copy restarts the 2 s; 0 is "Copy link". */
  const [copied, setCopied] = useState(0)
  const systemConfirms = Platform.OS === 'android' && Number(Platform.Version) >= ANDROID_CLIPBOARD_TOAST_API

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(0), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const detail = contrast ? COLOR.textPrimary : COLOR.textSecondary
  const title = share.kind === 'event' ? share.event.title : share.kind === 'venue' ? share.name : 'Your invite to Blend’n'
  const spoken =
    share.kind === 'event'
      ? [share.event.title, share.event.dateText, placeOf(share.event)].filter(Boolean).join(', ')
      : share.kind === 'venue'
        ? joinParts([share.name, share.typeLabel, share.area], ', ')
        : 'Your invite to Blend’n'

  const actions: { id: string; label: string; icon: IconName; onPress: () => void; haptic?: () => void; strong?: boolean; live?: boolean }[] = [
    ...(whatsApp ? [{ id: 'whatsapp', label: 'WhatsApp', icon: 'message-circle' as const, onPress: onWhatsApp, haptic: H.primary, strong: true }] : []),
    { id: 'story', label: 'Instagram Story', icon: 'camera', onPress: onStory, haptic: H.primary },
    {
      id: 'copy',
      label: copied ? 'Copied' : 'Copy link',
      icon: copied ? 'check' : 'link',
      strong: !!copied,
      live: true,
      onPress: () => {
        onCopy()
        if (systemConfirms) return
        setCopied((n) => n + 1)
        announceOutcome('Copied')
      },
    },
    { id: 'more', label: 'More…', icon: 'share', onPress: onMore, haptic: H.select },
  ]

  return (
    <Sheet visible={visible} onClose={onClose} onDismissed={onDismissed} title="Share" testID={testID}>
      <View accessible accessibilityLabel={`This is what they’ll see: ${spoken}`} style={styles.preview}>
        <View style={[styles.cardEdge, contrast && IC_HAIRLINE]}>
          <LinkPreviewCard preview={previewOf(share)} width={width - 2 * SPACE.gutter} radius={RADIUS.rowInCard} />
        </View>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} style={[font('caption', bold, FONT_FAMILY.brand[400]), styles.centre, { color: COLOR.textTertiary }]}>This is what they’ll see</Text>
      </View>
      <View style={styles.titleBlock}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.heading} style={[font('heading', bold), styles.ink]}>{title}</Text>
        {share.kind === 'event' ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), { color: detail }]}>
            {share.event.dateText ? <Text style={[monoCaption(bold), styles.ink]}>{share.event.dateText}</Text> : null}
            {` · ${placeOf(share.event)}`}
          </Text>
        ) : (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), { color: detail }]}>
            {share.kind === 'venue' ? joinParts([share.typeLabel, share.area], ' · ') : 'A link only you can send · no name on the card'}
          </Text>
        )}
      </View>
      <View style={styles.actions}>
        {actions.map(({ id, ...a }) => (
          <ShareAction key={id} {...a} testID={testID && `${testID}-${id}`} />
        ))}
      </View>
      {share.kind === 'event' && share.event.url ? (
        <View style={styles.message}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.label} style={[font('label', bold), { color: COLOR.textTertiary }]}>MESSAGE SENT WITH THE LINK</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), { color: detail }]}>{`${share.event.title}${share.event.dateText ? ` · ${share.event.dateText}` : ''}\n${placeOf(share.event)}`}</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} style={[monoCaption(bold), styles.ink]}>{share.event.url}</Text>
        </View>
      ) : null}
    </Sheet>
  )
}

function ShareAction({
  label,
  icon,
  onPress,
  haptic,
  strong = false,
  live = false,
  testID,
}: {
  label: string
  icon: IconName
  onPress: () => void
  haptic?: () => void
  strong?: boolean
  /** Its label changes to say an outcome ("Copied"): read when it does, on Android too. */
  live?: boolean
  testID?: string
}) {
  const bold = useBoldText()
  const reduceMotion = useReducedMotion()
  // The positive one (WhatsApp) and the outcome (Copied) are lit in the share's world, never the white disc (direction C).
  const sel = useSelection()
  return (
    <ScalePress testID={testID} onPress={onPress} haptic={haptic} accessibilityRole="button" accessibilityLabel={label} style={styles.action}>
      <View testID={testID && `${testID}-disc`} style={[styles.disc, strong ? [styles.litDisc, { backgroundColor: sel.fill, borderColor: sel.edge }] : styles.plainDisc]}>
        <Animated.View key={icon} entering={reduceMotion ? undefined : FadeIn.duration(motionTokens(reduceMotion).duration.base)}>
          <Icon name={icon} size={ICON.nav} color={strong ? sel.glyph : COLOR.textPrimary} />
        </Animated.View>
      </View>
      <Text
        numberOfLines={2}
        accessibilityLiveRegion={live ? 'polite' : undefined}
        maxFontSizeMultiplier={CONTROL_FONT_CAP}
        style={[font('caption', bold), styles.actionLabel]}
      >
        {label}
      </Text>
    </ScalePress>
  )
}

const styles = StyleSheet.create({
  preview: { gap: SPACE.sm },
  cardEdge: { borderRadius: RADIUS.rowInCard, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: COLOR.hairline },
  centre: { textAlign: 'center' },
  titleBlock: { gap: SPACE.xxs },
  ink: { color: COLOR.textPrimary },
  actions: { flexDirection: 'row', gap: SPACE.sm },
  action: { flex: 1, alignItems: 'center', gap: SPACE.sm },
  disc: { width: DISC, height: DISC, borderRadius: RADIUS.capsule, alignItems: 'center', justifyContent: 'center' },
  litDisc: { borderWidth: 1 },
  plainDisc: { backgroundColor: COLOR.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: COLOR.hairline },
  actionLabel: { color: COLOR.textSecondary, textAlign: 'center' },
  message: { borderRadius: RADIUS.thumb, backgroundColor: COLOR.surfaceSunken, padding: SPACE.md, gap: SPACE.xs },
})
