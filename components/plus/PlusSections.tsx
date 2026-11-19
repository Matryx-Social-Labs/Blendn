import { barHeight, barTop } from '../../lib/barGeometry'
import { useState, type ReactNode } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button } from '../ds/Button'
import { IconButton } from '../ds/IconButton'
import { Spinner } from '../ds/Loader'
import { PlusMark } from '../ds/ManageStatusRow'
import { SettingsGroup, SettingsRow } from '../ds/SettingsRow'
import { Title } from '../ds/Title'
import { font, useAnnounced, useBoldText, useIncreaseContrast, useLargeText } from '../ds/shared'
import { Material } from '../ui/Material'
import { useToastDock } from '../toastDock'
import { COLOR, FONT_FAMILY, MATERIAL, MAX_FONT_SCALE, SIZE, SPACE, TYPE } from '../../lib/design/tokens'
import { OPACITY } from '../../lib/theme'
import { Swap } from '../motion/Swap'
import { NEVER_FOR_SALE, type ctaParts, type PlusFeature } from '../../lib/plus'

/** The dock's links are one line of meta text; slop takes each to the 44 / 48 target. */
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
  const contrast = useIncreaseContrast()
  const android = Platform.OS === 'android'
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
        {/* Leaving the page is neutral (buttons board C): the DS secondary, 8% white once the bar's glass is under it. */}
        <Button kind="secondary" size="md" label={label} onGlass={state === 'scrolled'} onPress={onClose} testID="plus-header-close" />
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
  useAnnounced(text)
  return (
    <View accessibilityLiveRegion="polite" style={styles.dockLine}>
      {spinning ? <Spinner size={16} /> : null}
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font(strong ? 'bodyStrong' : 'meta', bold), strong ? styles.ink : styles.secondary, styles.centre, styles.fill]}>{text}</Text>
    </View>
  )
}

const PENDING_LINE =
  "Your payment is pending. Blend’n+ unlocks once your bank or the store confirms it — that can take a while. You can close this; we’ll pick it up when it does."

export type DockAction = 'buy' | 'manage' | 'launch' | 'restore' | 'none'

/**
 * What the dock says and does (remaining-screens 01 A / 02 A). While the store
 * is answered the wait is a line (restoring, confirming, taking longer,
 * pending, "You're in.") and the button steps away — the header reads Done;
 * otherwise the one button: "Start Yearly · {store price} / year", Manage
 * Blend'n+ for somebody who already has it, Restore purchases where the store
 * has nothing to sell, or nothing to buy in a launch season. Under it the
 * store's renew line where something is sold, then Restore · Terms · Privacy,
 * never greyed.
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
  disclosure,
  storeBusy = false,
  onBuy,
  onManage,
  onRestore,
  onTerms,
  onPrivacy,
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
  /** The store's renew line (`disclosureLine`), drawn only under a buy button. */
  disclosure?: string | null
  /** A purchase is with the store: Restore waits for it. */
  storeBusy?: boolean
  onBuy: () => void
  onManage: () => void
  onRestore: () => void
  onTerms: () => void
  onPrivacy: () => void
}) {
  const bold = useBoldText()
  // At the accessibility sizes the dock keeps the button and one short line; the rest is at the page's end (`PlusTerms`).
  const large = useLargeText()
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
  // Each line is its own part, so one answer fades into the next (motion audit M27).
  const lineId = restoring ? 'restoring' : phase !== 'idle' ? phase : 'notice'
  const idle = phase === 'idle'
  // Where Restore is the button it is not a link as well.
  const restoreLink = !(idle && action === 'restore')
  return (
    <PlusDock onHeight={onHeight}>
      <Swap id={lineId}>{line}</Swap>
      <Swap id={action}>
        {!idle ? null : action === 'launch' ? (
          <Button kind="secondary" label="Unlocked during launch · nothing to buy" disabled onGlass={onGlass} />
        ) : action === 'manage' ? (
          <Button kind="secondary" label="Manage Blend’n+" onGlass={onGlass} onPress={onManage} />
        ) : action === 'restore' ? (
          <Button kind="lit" size="md" icon="rotate-ccw" label="Restore purchases" loading={restoring} onPress={onRestore} />
        ) : action === 'buy' ? (
          <Button label={cta.lead} price={cta.price} accessibilityLabel={cta.spoken} disabled={disabled} loading={buying} onPress={onBuy} />
        ) : null}
      </Swap>
      {idle && action === 'buy' && disclosure ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} testID="plus-disclosure" style={[font('meta', bold), styles.tertiary]}>
          {large ? SHORT_LEGAL[Platform.OS === 'android' ? 'android' : 'ios'] : disclosure}
        </Text>
      ) : null}
      {large ? null : <DockLinks restore={restoreLink} restoring={restoring} storeBusy={storeBusy} onRestore={onRestore} onTerms={onTerms} onPrivacy={onPrivacy} />}
    </PlusDock>
  )
}

/**
 * The compact hero (remaining-screens 01 A): the mark, “Blend’n+” and the one line, so the plans sit above the fold.
 * At the largest text sizes only the wordmark stays (02 A, AX): the plans come first.
 */
export function PlusHero() {
  const bold = useBoldText()
  const large = useLargeText()
  return (
    <View style={[styles.hero, large && styles.heroLarge]}>
      {large ? null : <PlusMark />}
      {/* One line, shrunk to fit: a wordmark never breaks "Blend’ / n+" (D-M10). */}
      <Title accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit style={[styles.ink, !large && styles.centre]} testID="plus-wordmark">
        Blend’n+
      </Title>
      {large ? null : <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.secondary, styles.centre]}>More of the night, none of the creepy stuff.</Text>}
    </View>
  )
}

/** A quiet line under a list (meta, `textTertiary`). */
export function PlusNote({ text }: { text: string }) {
  const bold = useBoldText()
  return <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.tertiary, styles.note]}>{text}</Text>
}

/**
 * "What you get" (Flow 12 `GETS`, R3-G, D22; remaining-screens 01 A): settings rows, what the server serves today and
 * nothing else (App Review 3.1.2: sell what exists). What is promised but not built is not named at all, not even as
 * "on the way" (2.1).
 */
export function WhatYouGet({ features }: { features: readonly PlusFeature[] }) {
  return (
    <SettingsGroup title="What you get" sentence testID="plus-gets">
      {features.map((row) => (
        <SettingsRow key={row.title} icon={row.icon} title={row.title} hint={row.detail} trail="none" />
      ))}
    </SettingsGroup>
  )
}

/**
 * What no plan buys, as one row that opens its list in place (remaining-screens 01 A; it was a five-line card above
 * the plans). The product's promise, one tap from the first screen.
 */
export function NeverForSaleRow() {
  const [open, setOpen] = useState(false)
  return (
    <SettingsGroup testID="plus-never">
      <SettingsRow
        icon="eye-off"
        title="Never for sale, on any plan"
        hint={open ? NEVER_FOR_SALE.join(' · ') : `${NEVER_FOR_SALE.length} things no plan buys. See the list`}
        trail={open ? 'none' : 'chevron'}
        onPress={open ? undefined : () => setOpen(true)}
        testID="plus-never-row"
      />
    </SettingsGroup>
  )
}

type LinksProps = { restore: boolean; restoring: boolean; storeBusy: boolean; onRestore: () => void; onTerms: () => void; onPrivacy: () => void }

/** Restore · Terms · Privacy, never greyed (Restore waits while the store is being asked). */
function DockLinks({ restore, restoring, storeBusy, onRestore, onTerms, onPrivacy }: LinksProps) {
  return (
    <View style={styles.links}>
      {restore ? <DockLink label="Restore purchases" role="button" busy={restoring} disabled={storeBusy} onPress={onRestore} /> : null}
      <DockLink label="Terms" role="link" onPress={onTerms} />
      <DockLink label="Privacy" role="link" onPress={onPrivacy} />
    </View>
  )
}

/**
 * At the accessibility sizes only (remaining-screens 02 A, AX): the store's full renew line and Restore · Terms · Privacy
 * at the end of the page, since the dock keeps just the button and `SHORT_LEGAL`. Nothing at other sizes.
 */
export function PlusTerms({ disclosure, ...links }: LinksProps & { disclosure: string | null }) {
  const bold = useBoldText()
  if (!useLargeText()) return null
  return (
    <View testID="plus-terms" style={styles.terms}>
      {disclosure ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.tertiary]}>{disclosure}</Text> : null}
      <DockLinks {...links} />
    </View>
  )
}

/** One dock link: meta text on a 44 / 48 target. `link` opens a page; `button` does something. Greyed only while the store is already being asked. */
function DockLink({ label, role, onPress, busy = false, disabled = false }: { label: string; role: 'link' | 'button'; onPress: () => void; busy?: boolean; disabled?: boolean }) {
  const bold = useBoldText()
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      hitSlop={LINK_SLOP}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled: busy || disabled }}
      style={({ pressed }) => (disabled ? styles.dimmed : pressed && styles.pressed)}
    >
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.secondary]}>
        {label}
      </Text>
    </Pressable>
  )
}

/**
 * The store's renew line beside the buy button (App Store 3.1.2 / Play, remaining-screens 01 A): in the platform's
 * own words, the Night Pass sentence only where a Night Pass is sold, and GST only when every price is in rupees.
 */
export function disclosureLine(platform: 'ios' | 'android', nightPass: boolean, tax: string | null): string {
  return [LEGAL[platform], nightPass ? 'Night Pass is a one-off.' : null, tax].filter(Boolean).join(' ')
}

/** The dock's renew line at the accessibility sizes (the board's AX frame); the full line is at the page's end. */
const SHORT_LEGAL = {
  ios: 'Renews automatically. Cancel in Settings › Apple Account.',
  android: 'Renews automatically. Cancel in Google Play › Payments & subscriptions.',
} as const

const LEGAL = {
  ios: 'Charged to your Apple Account. Renews automatically unless cancelled at least 24 hours before the period ends; cancel in Settings › Apple Account › Subscriptions.',
  android: 'Charged to your Google Play account. Renews automatically until you cancel in Google Play › Payments & subscriptions.',
} as const

const styles = StyleSheet.create({
  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, paddingHorizontal: SPACE.lg },
  barContrast: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, backgroundColor: MATERIAL.hairlineIncreaseContrast },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2, paddingTop: SPACE.lg, paddingHorizontal: SPACE.xl, gap: SPACE.md },
  dockContrast: { position: 'absolute', left: 0, right: 0, top: 0, height: 1, backgroundColor: MATERIAL.hairlineIncreaseContrast },
  dockLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm },
  hero: { alignItems: 'center', gap: SPACE.xs },
  heroLarge: { alignItems: 'flex-start' },
  note: { paddingHorizontal: SPACE.xs },
  fill: { flex: 1 },
  terms: { gap: SPACE.md },
  // design-exception: the board spaces the dock's links 14 apart (`gap:14px`), between SPACE.md and SPACE.lg.
  links: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 14 },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  tertiary: { color: COLOR.textTertiary },
  centre: { textAlign: 'center' },
  pressed: { opacity: OPACITY.pressed },
  dimmed: { opacity: OPACITY.disabled },
})
