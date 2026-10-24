import { StyleSheet, Text, View } from 'react-native'

import { GradientFill } from '../ui/GradientFill'
import { COLOR, RADIUS, SIZE, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { Button } from './Button'
import { DiscMark } from './DiscMark'
import { font, IC_HAIRLINE, useBoldText, useIncreaseContrast } from './shared'

export type PlusStatus = 'launch' | 'trial' | 'active' | 'cancelled' | 'grace' | 'hold' | 'paused' | 'expired' | 'refunded' | 'night' | 'referral'
type Tone = 'ok' | 'warn' | 'info'

/** Flow 12 `STATUS`, with ROUND3 G2's Night Pass (24 hours, never "tonight · until 6 am"). */
const STATUS: Record<PlusStatus, { title: string; tone: Tone }> = {
  launch: { title: 'Free during launch', tone: 'info' },
  trial: { title: 'Free trial', tone: 'ok' },
  active: { title: 'Blend’n+ · active', tone: 'ok' },
  cancelled: { title: 'Cancelled · still active', tone: 'info' },
  grace: { title: 'Payment didn’t go through', tone: 'warn' },
  hold: { title: 'On hold', tone: 'warn' },
  paused: { title: 'Paused', tone: 'info' },
  expired: { title: 'Blend’n+ ended', tone: 'info' },
  refunded: { title: 'Refunded', tone: 'info' },
  night: { title: 'Night Pass · 24 hours', tone: 'ok' },
  referral: { title: 'A month on us', tone: 'ok' },
}

/** Green while entitled, the warning colour while a payment needs fixing, quiet otherwise. */
const DOT: Record<Tone, string> = { ok: COLOR.live, warn: COLOR.warning, info: COLOR.textTertiary }
const DOT_SIZE = SPACE.sm
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
 * Flow 12 Manage): the Plus mark, the status, one sentence with the date and
 * the store, a dot in the status colour. Cancelled says you keep it until the
 * date; expired says what you lost and nothing else; a trial renews nothing
 * (G2). The store manages the subscription: a payment problem gets the one
 * button, "Fix it in" that store.
 *
 * Read as one element: "Blend'n+ · active. Renews 3 Nov · ₹199 · Google Play",
 * then the button. No haptic. Increase Contrast: the 50% hairline.
 */
export function ManageStatusRow({
  status,
  sentence,
  store,
  onFix,
  testID,
}: {
  status: PlusStatus
  /** One sentence with the date and the store, from the entitlement. */
  sentence: string
  store: 'ios' | 'android'
  onFix?: () => void
  testID?: string
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const { title, tone } = STATUS[status]
  return (
    <View testID={testID} style={[styles.card, contrast && IC_HAIRLINE]}>
      <View accessible accessibilityLabel={`${title}. ${sentence}`} style={styles.gap}>
        <View style={styles.head}>
          <PlusMark />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.heading} style={[font('heading', bold), styles.title]}>{title}</Text>
          <View testID={testID && `${testID}-dot`} style={[styles.dot, { backgroundColor: DOT[tone] }]} />
        </View>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>{sentence}</Text>
      </View>
      {tone === 'warn' ? (
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
  title: { flex: 1, color: COLOR.textPrimary },
  dot: { width: DOT_SIZE, height: DOT_SIZE, borderRadius: RADIUS.capsule },
})
