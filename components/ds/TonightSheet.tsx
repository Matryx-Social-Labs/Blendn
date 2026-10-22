import { useRef, type ComponentRef } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import { Icon } from '../ui/Icon'
import { COLOR, ICON, RADIUS, SIZE, SPACE, TYPE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { Button, type ButtonKind } from './Button'
import { Spinner } from './Loader'
import { NightPassRow, PlanCard, PlanList } from './PlanCard'
import { Sheet } from './Sheet'
import { tint } from '../../lib/theme'
import { font, useBoldText, useIncreaseContrast } from './shared'

/** The header's level glyph (Flow 12 `tonight`): a 44 ring at 22%, a 20 disc in a 1.5 white edge, filled to 45%. */
const GLYPH = SIZE.circleButton
const GLYPH_EDGE = 0.22
const LEVEL = SPACE.xl - SPACE.xs
const LEVEL_EDGE = 1.5
const LEVEL_FILL = '45%'
/** The legal links are one line of meta text; slop takes each to the 44 / 48 target. */
const LINK_SLOP = (SIZE.targetAndroid - TYPE.meta.lineHeight) / 2

export type TonightTrigger = 'stay' | 'perk' | 'night' | 'crew' | 'expiry'
export type TonightPick = 'night' | 'monthly'

/**
 * What prompted the sheet, in one sentence, and the free path beside the paid
 * one (Flow 12 `TRIG`, with ROUND3 G1/G2: the free extend is 45 min, the free
 * time is no longer "20 minutes"). `perk` and `crew` sell what G2 lists as
 * Coming soon: don't open them until SCRUM-584 builds the perks and the crew
 * extras.
 */
function triggerCopy(trigger: TonightTrigger, venue: string, crew: string): { title: string; line: string; free: string; freeKind: ButtonKind } {
  switch (trigger) {
    case 'stay':
      return { title: 'Stay live while you’re here', line: `Up to 4 hours at ${venue} tonight, carried on while your phone sees you inside.`, free: 'Go live for 1 hour — free', freeKind: 'lit' }
    case 'expiry':
      return { title: 'Stay while you’re here', line: `Your free time at ${venue} is up. Stay keeps you live for up to 4 hours.`, free: 'Extend 45 min — free', freeKind: 'lit' }
    case 'perk':
      return { title: 'Tonight’s partner perk', line: `${venue} runs a perk for Blend’n+ people tonight. Show it at the bar.`, free: 'Not now', freeKind: 'secondary' }
    case 'night':
      return { title: 'Your earlier nights', line: 'Everything before your last 3 nights, back to your first one.', free: 'Not now', freeKind: 'secondary' }
    case 'crew':
      return { title: `A crew photo for ${crew}`, line: 'Seen only inside the crew — never on a card or anywhere a stranger sees it.', free: 'Not now', freeKind: 'secondary' }
  }
}

/**
 * Blend'n+ offered where it would help tonight (guidelines/components/TonightSheet.html,
 * Flow 12 · 12.1, ROUND3 G2): the trigger's title beside the level glyph, one
 * trigger sentence, the Night Pass (24 hours,
 * doesn't renew) first and preselected, Monthly second, Continue with the
 * price, the free path, and "See all plans". The store's sheet is the
 * store's; the prices are its own strings. Nothing on it is a dark pattern:
 * one line, two prices, a free way out.
 *
 * The outcome comes back as `status`: cancelled and failed say nothing was
 * charged (failed offers Try again); pending waits for the store and steps
 * Continue back; the plans wait with it. Terms, Privacy and Restore
 * purchases in the last line are links. Success and the launch season are the caller's toast (a
 * success toast plays `H.success`); during launch the sheet never opens.
 *
 * `H.primary` on Continue and on the full-weight free path (Flow 12's "free
 * path · full-weight button · H.primary"); `H.select` on a pick; none on Not
 * now, cancelled or failed.
 */
export function TonightSheet({
  visible,
  onClose,
  trigger,
  venue,
  crew = '',
  prices,
  pick,
  onPick,
  onContinue,
  onFree,
  onSeeAll,
  onTerms,
  onPrivacy,
  onRestore,
  status = 'idle',
  store,
}: {
  visible: boolean
  onClose: () => void
  trigger: TonightTrigger
  venue: string
  /** The crew's name, for the `crew` trigger. */
  crew?: string
  /** The store's own price strings. */
  prices: { night: string; monthly: string }
  pick: TonightPick
  onPick: (pick: TonightPick) => void
  onContinue: () => void
  onFree: () => void
  onSeeAll: () => void
  onTerms: () => void
  onPrivacy: () => void
  /** Restore purchases (the store's own restore). */
  onRestore: () => void
  status?: 'idle' | 'pending' | 'cancelled' | 'failed'
  store: 'ios' | 'android'
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const copy = triggerCopy(trigger, venue, crew)
  const price = pick === 'night' ? prices.night : prices.monthly
  const detail = contrast ? COLOR.textPrimary : COLOR.textSecondary
  const pending = status === 'pending'
  const quiet = contrast ? COLOR.textSecondary : COLOR.textTertiary
  const links: [string, () => void][] = [
    ['Terms', onTerms],
    ['Privacy', onPrivacy],
    ['Restore purchases', onRestore],
  ]
  const header = useRef<ComponentRef<typeof View>>(null)

  return (
    <Sheet visible={visible} onClose={onClose} focusRef={header}>
      <View style={styles.head}>
        <View ref={header} accessible accessibilityRole="header" accessibilityLabel={copy.title} style={styles.fill}>
          <Text style={[font('title', bold), styles.ink]}>{copy.title}</Text>
        </View>
        <View style={styles.glyph} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={styles.level}>
            <View style={styles.levelFill} />
          </View>
        </View>
      </View>
      <Text style={[font('body', bold), { color: detail }]}>{copy.line}</Text>
      <PlanList onSheet>
        <NightPassRow price={prices.night} selected={pick === 'night'} disabled={pending} onPress={() => onPick('night')} />
        <PlanCard name="Blend’n+ monthly" price={prices.monthly} per="/ month" selected={pick === 'monthly'} disabled={pending} onPress={() => onPick('monthly')} />
      </PlanList>
      {status === 'cancelled' ? <Text style={[font('meta', bold), styles.centre, { color: detail }]}>Nothing was charged.</Text> : null}
      {status === 'failed' ? (
        <View style={styles.line}>
          <Icon name="circle-alert" size={ICON.inline} color={COLOR.destructive} />
          <Text style={[font('meta', bold), styles.shrink, { color: COLOR.destructive }]}>The store couldn’t complete it. Nothing was charged.</Text>
        </View>
      ) : null}
      {pending ? (
        <View style={styles.line}>
          <Spinner size={16} />
          <Text style={[font('meta', bold), styles.shrink, styles.ink]}>
            {`Waiting for ${store === 'android' ? 'Google Play' : 'the App Store'} to confirm. You can keep using Blend’n.`}
          </Text>
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button
          kind={pending ? 'secondary' : 'primary'}
          onGlass={pending && Platform.OS === 'ios'}
          label={`${status === 'failed' ? 'Try again' : 'Continue'} — ${price}`}
          disabled={pending}
          onPress={onContinue}
        />
        <Button
          kind={copy.freeKind}
          size={copy.freeKind === 'lit' ? 'md' : undefined}
          onGlass={copy.freeKind === 'secondary' && Platform.OS === 'ios'}
          label={copy.free}
          pressHaptic={copy.freeKind === 'lit' ? H.primary : false}
          onPress={onFree}
        />
      </View>
      <View style={styles.foot}>
        <Button kind="tertiary" size="sm" label="See all plans" onPress={onSeeAll} style={styles.centred} />
        <View style={styles.legal}>
          <Text style={[font('meta', bold), { color: quiet }]}>Prices include GST.</Text>
          {links.map(([label, onPress], i) => (
            <View key={label} style={styles.legal}>
              {i ? (
                <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[font('meta', bold), { color: quiet }]}>
                  ·
                </Text>
              ) : null}
              <Pressable onPress={onPress} hitSlop={LINK_SLOP} accessibilityRole="link" accessibilityLabel={label}>
                <Text style={[font('meta', bold), { color: quiet }]}>{label}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.lg },
  fill: { flex: 1 },
  glyph: {
    width: GLYPH,
    height: GLYPH,
    borderRadius: RADIUS.capsule,
    borderWidth: LEVEL_EDGE,
    borderColor: tint(COLOR.textPrimary, GLYPH_EDGE),
    alignItems: 'center',
    justifyContent: 'center',
  },
  level: { width: LEVEL, height: LEVEL, borderRadius: RADIUS.capsule, borderWidth: LEVEL_EDGE, borderColor: COLOR.textPrimary, overflow: 'hidden' },
  levelFill: { position: 'absolute', left: 0, right: 0, bottom: 0, height: LEVEL_FILL, backgroundColor: COLOR.textPrimary },
  centre: { textAlign: 'center' },
  legal: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', columnGap: SPACE.xs },
  centred: { alignSelf: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm },
  shrink: { flexShrink: 1 },
  ink: { color: COLOR.textPrimary },
  actions: { gap: SPACE.sm },
  foot: { alignItems: 'center', gap: SPACE.xs },
})
