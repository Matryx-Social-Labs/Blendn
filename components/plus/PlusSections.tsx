import { barHeight, barTop } from '../../lib/barGeometry'
import { Fragment, useState, type ReactNode } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import ScalePress from '../motion/ScalePress'
import { Button } from '../ds/Button'
import { IconButton } from '../ds/IconButton'
import { Spinner } from '../ds/Loader'
import { PlusMark } from '../ds/ManageStatusRow'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, useBoldText, useIncreaseContrast } from '../ds/shared'
import { Icon } from '../ui/Icon'
import { Material } from '../ui/Material'
import { useToastDock } from '../toastDock'
import { COLOR, MATERIAL, MAX_FONT_SCALE, RADIUS, SIZE, SPACE, TYPE } from '../../lib/design/tokens'
import { OPACITY } from '../../lib/theme'
import type { ctaParts, PlusFeature } from '../../lib/plus'

/** The hero's mark (Flow 12 `plusMark(hero, 64)`). */
const HERO_MARK = SIZE.primary + SPACE.sm
/** A feature row is at least 60 pt (the page's `min-height:60px`). */
const FEATURE_MIN_HEIGHT = SIZE.primary + SPACE.xs
// design-exception: the page draws its feature glyphs at 22 and gaps them 14 (flow12.js `GETS`); neither is on the scale.
const FEATURE_ICON = 22
// design-exception: see FEATURE_ICON.
const FEATURE_GAP = 14
/** The footer links are one line of meta text; slop takes each to the 44 / 48 target. */
const LINK_SLOP = (SIZE.targetAndroid - TYPE.meta.lineHeight) / 2

/** The bar under the header: the top inset, the circle, and the 10 pt the glass reaches under it. */
export function useHeaderHeight() {
  const insets = useSafeAreaInsets()
  return barHeight(insets.top, Platform.OS === 'android')
}

/**
 * Flow 12 `page` header: a glass bar over the scroll, the back circle on the
 * left and "Not now" (or "Done" once something happened) in a glass pill on
 * the right. Always there, no delay timer, no guilt. Both ways out close.
 *
 * Scroll-edge chrome (motion #30, TopBar): at rest there is no bar, the circle and
 * the pill sit straight on the page; once the content has moved under it the bar's
 * glass is mounted, never faded (glass fades wrong, §5.2 rule 6).
 */
export function PlusHeader({ done, onClose, state = 'rest' }: { done: boolean; onClose: () => void; state?: 'rest' | 'scrolled' }) {
  const insets = useSafeAreaInsets()
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const android = Platform.OS === 'android'
  const circle = android ? SIZE.circleButtonAndroid : SIZE.circleButton
  const label = done ? 'Done' : 'Not now'
  const height = useHeaderHeight()
  return (
    <View testID="plus-header" style={[styles.header, { paddingTop: barTop(insets.top), height }]}>
      {state === 'scrolled' ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="plus-header-bar">
          <Material role="bar" style={StyleSheet.absoluteFill} />
          {contrast ? <View style={styles.barContrast} /> : null}
        </View>
      ) : null}
      <View style={styles.headerRow}>
        <IconButton icon={android ? 'arrow-left' : 'chevron-left'} accessibilityLabel="Back" onPress={onClose} />
        <ScalePress
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={[styles.pill, { height: circle }]}
        >
          <Material role="control" style={[StyleSheet.absoluteFill, styles.pillFill]} />
          {contrast ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, IC_HAIRLINE, styles.pillFill]} /> : null}
          <Text style={[font('button', bold), styles.ink]} maxFontSizeMultiplier={CONTROL_FONT_CAP} numberOfLines={1}>
            {label}
          </Text>
        </ScalePress>
      </View>
    </View>
  )
}

/**
 * The dock (Flow 12 `page`): a glass bar at the bottom that stays while the page
 * scrolls — one line of what is happening, then the button. It sits over the
 * scroll, which pads itself by `onHeight`.
 */
export function PlusDock({ onHeight, children }: { onHeight: (height: number) => void; children: ReactNode }) {
  const insets = useSafeAreaInsets()
  const contrast = useIncreaseContrast()
  // The Android snackbar stands above the dock (its own bottom inset is the toast's already).
  const [height, setHeight] = useState(0)
  useToastDock(Math.max(0, height - insets.bottom))
  return (
    <View
      testID="plus-dock"
      onLayout={(e) => {
        onHeight(e.nativeEvent.layout.height)
        setHeight(e.nativeEvent.layout.height)
      }}
      style={[styles.dock, { paddingBottom: insets.bottom + SPACE.lg }]}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Material role="bar" style={StyleSheet.absoluteFill} />
        {contrast ? <View style={styles.dockContrast} /> : null}
      </View>
      {children}
    </View>
  )
}

/** The dock's line: a spinner (while something is being asked) or just words, centred, announced politely. */
export function DockLine({ text, spinning = false, strong = false }: { text: string; spinning?: boolean; strong?: boolean }) {
  const bold = useBoldText()
  return (
    <View accessibilityLiveRegion="polite" style={styles.dockLine}>
      {spinning ? <Spinner size={16} /> : null}
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font(strong ? 'bodyStrong' : 'meta', bold), strong ? styles.ink : styles.secondary, styles.centre, styles.fill]}>{text}</Text>
    </View>
  )
}

const PENDING_LINE =
  "Your payment is pending. Blend’n+ unlocks once your bank or the store confirms it — that can take a while. You can close this; we’ll pick it up when it does."

export type DockAction = 'buy' | 'manage' | 'launch' | 'none'

/**
 * What the dock says and does. While the store is answered the wait is a line
 * (restoring, confirming, taking longer, pending, "You're in.") and the button
 * steps away — the header reads Done; otherwise the one button: Start (carrying
 * the price), Manage for a subscription the store runs, or nothing to buy in a
 * launch season.
 */
export function PlusActions({
  onHeight,
  phase,
  restoring,
  notice,
  action,
  cta,
  disabled,
  buying,
  onBuy,
  onManage,
}: {
  onHeight: (height: number) => void
  phase: 'idle' | 'confirming' | 'pending' | 'slow' | 'done'
  restoring: boolean
  /** What Restore found when it found nothing or failed: said in the dock until the next tap. */
  notice?: string | null
  action: DockAction
  cta: ReturnType<typeof ctaParts>
  disabled: boolean
  buying: boolean
  onBuy: () => void
  onManage: () => void
}) {
  const onGlass = Platform.OS === 'ios'
  const line = restoring ? (
    <DockLine text="Restoring…" spinning />
  ) : phase === 'confirming' ? (
    <DockLine text="Confirming with the store…" spinning />
  ) : phase === 'slow' ? (
    <DockLine text="Taking longer than usual — it’ll unlock as soon as the store confirms." />
  ) : phase === 'pending' ? (
    <DockLine text={PENDING_LINE} />
  ) : phase === 'done' ? (
    <DockLine text="You’re in." strong />
  ) : notice ? (
    <DockLine text={notice} strong />
  ) : null
  return (
    <PlusDock onHeight={onHeight}>
      {line}
      {phase !== 'idle' ? null : action === 'launch' ? (
        <Button kind="secondary" label="Unlocked during launch · nothing to buy" disabled onGlass={onGlass} />
      ) : action === 'manage' ? (
        <Button kind="lit" size="md" label="Manage Blend’n+" onPress={onManage} />
      ) : action === 'buy' ? (
        <Button label={cta.lead} price={cta.price} accessibilityLabel={cta.spoken} disabled={disabled} loading={buying} onPress={onBuy} />
      ) : null}
    </PlusDock>
  )
}

/** The mark, "Blend’n+" and the one line (Flow 12 `page` hero). */
export function PlusHero() {
  const bold = useBoldText()
  return (
    <View style={styles.hero}>
      <PlusMark size={HERO_MARK} />
      {/* One line, shrunk to fit: a wordmark never breaks "Blend’ / n+" (D-M10). */}
      <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE.display} numberOfLines={1} adjustsFontSizeToFit style={[font('display', bold), styles.ink, styles.centre]} testID="plus-wordmark">
        Blend’n+
      </Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.secondary, styles.centre]}>More of the night, none of the creepy stuff.</Text>
    </View>
  )
}

/** A quiet line under a list (meta, `textTertiary`). */
export function PlusNote({ text }: { text: string }) {
  const bold = useBoldText()
  return <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.tertiary, styles.note]}>{text}</Text>
}

/** A section's heading (`heading`, 20/26). */
export function PlusHeading({ children }: { children: string }) {
  const bold = useBoldText()
  return (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE.heading} accessibilityRole="header" style={[font('heading', bold), styles.ink]}>
      {children}
    </Text>
  )
}

/**
 * "What you get" (Flow 12 `GETS`, R3-G, D22): outlined rows on `surface`, what the server serves today and nothing else (App
 * Review 3.1.2: sell what exists). What is promised but not built is not named at all, not even as "on the way" (2.1).
 */
export function WhatYouGet({ features }: { features: readonly PlusFeature[] }) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  return (
    <View style={styles.section}>
      <PlusHeading>What you get</PlusHeading>
      <View testID="plus-gets" style={[styles.list, contrast && IC_HAIRLINE]}>
        {features.map((row, i) => (
          <Fragment key={row.title}>
            {i ? <View style={styles.hairline} /> : null}
            <View accessible accessibilityLabel={`${row.title}. ${row.detail}`} style={styles.feature}>
              <Icon name={row.icon} size={FEATURE_ICON} color={COLOR.textPrimary} />
              <View style={styles.fill}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.ink]}>{row.title}</Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>{row.detail}</Text>
              </View>
            </View>
          </Fragment>
        ))}
      </View>
    </View>
  )
}

/** One footer link: meta text on a 44 / 48 target. `link` opens a page; `button` does something. */
function FooterLink({ label, role, onPress, disabled = false, busy = false }: { label: string; role: 'link' | 'button'; onPress: () => void; disabled?: boolean; busy?: boolean }) {
  const bold = useBoldText()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={LINK_SLOP}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      style={disabled && styles.dimmed}
    >
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.tertiary]}>{label}</Text>
    </Pressable>
  )
}

/**
 * The store's legal wording (App Store 3.1.2 / Play: what renews, how to
 * cancel) beside the buttons, then Terms · Privacy · Restore purchases ·
 * Manage subscription. The wording is the platform's own (Flow 12 `legal`); it
 * is shown only where something is for sale.
 */
export function PlusFooter({
  forSale,
  tax = null,
  restoreDisabled,
  restoring,
  onTerms,
  onPrivacy,
  onRestore,
  onManage,
}: {
  forSale: boolean
  /** "Prices include GST." when every price is in rupees (`taxLine`, D2); null states no tax. */
  tax?: string | null
  restoreDisabled: boolean
  restoring: boolean
  onTerms: () => void
  onPrivacy: () => void
  onRestore: () => void
  onManage: () => void
}) {
  const bold = useBoldText()
  const links = [
    { label: 'Terms', role: 'link', onPress: onTerms },
    { label: 'Privacy', role: 'link', onPress: onPrivacy },
    { label: 'Restore purchases', role: 'button', onPress: onRestore, disabled: restoreDisabled, busy: restoring },
    { label: 'Manage subscription', role: 'button', onPress: onManage },
  ] as const
  return (
    <View style={styles.footer}>
      {forSale ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.tertiary]}>{[LEGAL[Platform.OS === 'android' ? 'android' : 'ios'], tax].filter(Boolean).join(' ')}</Text> : null}
      <View style={styles.links}>
        {links.map((link, i) => (
          <Fragment key={link.label}>
            {i ? (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[font('meta', bold), styles.tertiary]}>
                ·
              </Text>
            ) : null}
            <FooterLink {...link} />
          </Fragment>
        ))}
      </View>
    </View>
  )
}

export const LEGAL = {
  ios: 'Payment is charged to your Apple Account at confirmation. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period; manage or cancel in Settings › Apple Account › Subscriptions. Night Pass is a one-off.',
  android:
    'Payment is charged to your Google Play account at confirmation. Subscriptions renew automatically unless cancelled before the end of the current period; cancel anytime in Google Play › Payments & subscriptions. Night Pass is a one-off.',
} as const

const styles = StyleSheet.create({
  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, paddingHorizontal: SPACE.lg },
  barContrast: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, backgroundColor: MATERIAL.hairlineIncreaseContrast },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: { overflow: 'hidden', justifyContent: 'center', paddingHorizontal: SPACE.lg, borderRadius: RADIUS.capsule },
  pillFill: { borderRadius: RADIUS.capsule },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2, paddingTop: SPACE.lg, paddingHorizontal: SPACE.xl, gap: SPACE.md },
  dockContrast: { position: 'absolute', left: 0, right: 0, top: 0, height: 1, backgroundColor: MATERIAL.hairlineIncreaseContrast },
  dockLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm },
  hero: { alignItems: 'center', gap: SPACE.sm, paddingTop: SPACE.sm },
  section: { gap: SPACE.md },
  note: { paddingHorizontal: SPACE.xs },
  list: { borderRadius: RADIUS.sheet, backgroundColor: COLOR.surface, overflow: 'hidden' },
  feature: { flexDirection: 'row', alignItems: 'center', gap: FEATURE_GAP, minHeight: FEATURE_MIN_HEIGHT, paddingVertical: SPACE.md, paddingHorizontal: SPACE.lg },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: COLOR.hairline },
  fill: { flex: 1 },
  footer: { gap: SPACE.md },
  links: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: SPACE.sm },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  tertiary: { color: COLOR.textTertiary },
  centre: { textAlign: 'center' },
  dimmed: { opacity: OPACITY.disabled },
})
