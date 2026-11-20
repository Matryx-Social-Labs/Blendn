import { StyleSheet, Text, View } from 'react-native'

import type { PlusPlan } from '../../lib/plusManage'
import { GradientFill } from '../ui/GradientFill'
import { Icon } from '../ui/Icon'
import { COLOR, ICON, MATERIAL, RADIUS, SIZE, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { Button } from './Button'
import { DiscMark } from './DiscMark'
import { font, IC_HAIRLINE, useBoldText, useIncreaseContrast, useSelection } from './shared'

export type PlusStatus = 'launch' | 'trial' | 'gift' | 'active' | 'cancelled' | 'grace' | 'hold' | 'paused' | 'expired' | 'refunded' | 'night' | 'referral'
/** Flow 12 `STATUS`, with ROUND3 G2's Night Pass (24 hours, never "tonight · until 6 am") and remaining-screens 03 A's gift. */
const STATUS: Record<PlusStatus, { title: string; fix?: true }> = {
  launch: { title: 'Free during launch' },
  trial: { title: 'Free trial' },
  gift: { title: 'Blend’n+ · a gift from Blend’n' },
  active: { title: 'Blend’n+ · active' },
  cancelled: { title: 'Cancelled · still active' },
  grace: { title: 'Payment didn’t go through', fix: true },
  hold: { title: 'On hold', fix: true },
  paused: { title: 'Paused' },
  expired: { title: 'Blend’n+ ended' },
  refunded: { title: 'Refunded' },
  night: { title: 'Night Pass · 24 hours' },
  referral: { title: 'A month on us' },
}
/** "Blend’n+ Yearly" for an active subscription whose plan the server names (remaining-screens 03 A). */
const PLAN_TITLE: Record<PlusPlan, string> = { monthly: 'Blend’n+ Monthly', quarterly: 'Blend’n+ Quarterly', yearly: 'Blend’n+ Yearly' }

/** The Plus mark: the monogram in white on the brand gradient, 40 pt, the mark at half. */
const MARK = SIZE.control - SPACE.sm

/** The Plus mark: the monogram in white on the brand gradient; `size` is the disc, the mark at half. */
export function PlusMark({ size = MARK }: { size?: number }) {
  return (
    <View style={[styles.mark, { width: size, height: size }]}>
      <GradientFill gradient="brand" style={StyleSheet.absoluteFill} />
      <DiscMark height={size / 2} fill="white" />
    </View>
  )
}

/**
 * What is true about Blend'n+, in one card (guidelines/components/ManageStatusRow.html,
 * Flow 12 Manage, remaining-screens 03 A): the Plus mark, the status, one
 * sentence with the date and the store; `features`, what it includes, as a
 * checklist under a hairline. No dot: the words say how it stands. Cancelled
 * says you keep it until the date; expired says what you lost and nothing else;
 * a trial renews nothing (G2). The store manages the subscription: a payment
 * problem gets the one button, "Fix it in" that store.
 *
 * Read as one element: "Blend'n+ · active. Renews 3 Nov · Google Play", then
 * "Includes: …", then the button. No haptic. Increase Contrast: the 50% hairline.
 */
export function ManageStatusRow({
  status,
  plan,
  sentence,
  store,
  features,
  onFix,
  testID,
}: {
  status: PlusStatus
  /** The store plan, named in the title of an active subscription; without one it reads "Blend’n+ · active". */
  plan?: PlusPlan | null
  /** One sentence with the date and the store, from the entitlement. */
  sentence: string
  store: 'ios' | 'android'
  /** What Blend'n+ includes, ticked in the hue (Manage, a store plan). */
  features?: readonly string[]
  onFix?: () => void
  testID?: string
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const sel = useSelection()
  const { fix } = STATUS[status]
  const title = status === 'active' && plan ? PLAN_TITLE[plan] : STATUS[status].title
  return (
    <View testID={testID} style={[styles.card, contrast && IC_HAIRLINE]}>
      <View accessible accessibilityLabel={`${title}. ${sentence}`} style={styles.gap}>
        <View style={styles.head}>
          <PlusMark />
          <View style={styles.title}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.ink]}>{title}</Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>{sentence}</Text>
          </View>
        </View>
      </View>
      {features?.length ? (
        <View testID={testID && `${testID}-features`} accessible accessibilityLabel={`Includes: ${features.join(', ')}`} style={[styles.features, contrast && styles.featuresContrast]}>
          {features.map((line) => (
            <View key={line} style={styles.feature}>
              <Icon name="check" size={ICON.inline} color={sel.glyph} active />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.ink, styles.fill]}>{line}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {fix ? (
        <Button kind="lit" size="md" label={store === 'android' ? 'Fix it in Google Play' : 'Fix it in the App Store'} onPress={onFix} />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.sheet, backgroundColor: COLOR.surface, padding: SPACE.lg, gap: SPACE.md },
  gap: { gap: SPACE.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  mark: { borderRadius: RADIUS.capsule, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1 },
  ink: { color: COLOR.textPrimary },
  fill: { flex: 1 },
  // The hairline reaches the card's edges (the board's `margin: 12px -16px 0`).
  features: { marginHorizontal: -SPACE.lg, paddingHorizontal: SPACE.lg, paddingTop: SPACE.md, gap: SPACE.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLOR.hairline },
  featuresContrast: { borderTopColor: MATERIAL.hairlineIncreaseContrast },
  feature: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
})
