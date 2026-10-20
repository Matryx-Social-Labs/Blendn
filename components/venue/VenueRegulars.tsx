import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { Button } from '../ds/Button'
import { SettingsRow } from '../ds/SettingsRow'
import { font, minTarget, useBoldText } from '../ds/shared'
import { Icon, type IconName } from '../ui/Icon'
import { useToast } from '../Toast'
import { COLOR, FONT_FAMILY, ICON, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { Logger } from '../../lib/logger'
import { offersApi, type RegularPrefs } from '../../lib/offers'

/** Where the page stands on "regular": offered, on, or just turned off (stays for this visit, then the offer returns). */
export type RegularState = 'offer' | 'on' | 'off' | 'later'

/**
 * Who will see a yes, in the page's words: the organisation that runs the
 * place on Blendn now, and the place. The server names it (`ownerName`); null
 * while nobody does, and the page then names the place alone.
 */
export function whoSees(prefs: Pick<RegularPrefs, 'ownerName'>, venueName: string): string {
  return prefs.ownerName ? `${prefs.ownerName}, who runs ${venueName} on Blendn,` : venueName
}

/**
 * What the page shows after a read of your choice. A visit keeps its Done line
 * and its Not now; a yes made elsewhere (the offer screen) turns the offer into
 * the row, and a no made elsewhere turns the row back into the offer.
 */
export function regularState(current: RegularState | null, known: boolean): RegularState {
  if (known) return 'on'
  return current === null || current === 'on' ? 'offer' : current
}

const ROWS = (who: string): { icon: IconName; key: string; value: string }[] => [
  { icon: 'eye', key: `${who} will see`, value: 'your first name and how many nights you’ve been in the last 30 days' },
  { icon: 'eye-off', key: `${who} won’t see`, value: 'your chats, who you met, or anywhere else you go' },
  { icon: 'hand-heart', key: 'Why', value: 'so the staff can say hi or look after you' },
]

/**
 * Your two choices about this place (Flow 13 · 13.4, 13-4): be known here as
 * a regular, and no offers from it. Only where somebody runs the place on
 * Blendn: there is nobody to tell at an unclaimed one (step 12).
 *
 * - **The offer** is an itemised notice and two buttons, never pre-ticked;
 *   Not now hides it for this visit and sends nothing.
 * - **On** is one row with Turn off, one tap and no sheet; the Done line
 *   follows and stays for this visit, then the offer returns.
 * - **No offers from ‹place›** is a switch that shows what the server saved,
 *   never what was tapped; a refusal is an error toast.
 *
 * ponytail: the server does not say who qualifies (3+ nights in 30 days), so
 * the offer shows for everyone on a claimed place and a refusal is the toast;
 * `eligible` on the prefs (docs/PLACES.md) lets the page draw nothing instead.
 */
export function VenueRegulars({ venueId, venueName }: { venueId: string; venueName: string }) {
  const bold = useBoldText()
  const { showToast } = useToast()
  const [prefs, setPrefs] = useState<RegularPrefs | null>(null)
  const [state, setState] = useState<RegularState | null>(null)
  const [saving, setSaving] = useState<'known' | 'offersMuted' | null>(null)

  const read = useCallback(() => {
    offersApi
      .prefs(venueId)
      .then((res) => {
        if (!res.success || !res.data) return
        setPrefs(res.data)
        setState((s) => regularState(s, res.data?.known === true))
      })
      .catch((error) => Logger.warn('events', 'Could not read the regular choices', { error: String(error) }))
  }, [venueId])
  useFocusEffect(read)

  const save = async (change: { known?: boolean; offersMuted?: boolean }, after?: (saved: RegularPrefs) => void) => {
    if (saving) return
    const key = 'known' in change ? 'known' : 'offersMuted'
    setSaving(key)
    try {
      const res = await offersApi.setPrefs(venueId, change)
      if (res.success && res.data) {
        setPrefs(res.data)
        after?.(res.data)
      } else {
        showToast(res.error || "That didn't save. Try again.", 'error')
      }
    } catch {
      showToast("That didn't save. Try again.", 'error')
    } finally {
      setSaving(null)
    }
  }

  // Deferred (owner ruling): nothing at all unless the venue has activated regulars.
  if (!prefs || !state || prefs.regulars?.active !== true) return null
  const who = whoSees(prefs, venueName)

  return (
    <View style={styles.wrap} testID="venue-regulars">
      {state === 'offer' ? (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={[font('heading', bold), styles.ink]}>{`Let ${venueName} know you’re a regular`}</Text>
          {ROWS(who).map((r) => (
            <View key={r.key} style={styles.item}>
              <View style={styles.itemIcon}>
                <Icon name={r.icon} size={ICON.control} />
              </View>
              <View style={styles.fill}>
                <Text style={[font('bodyStrong', bold), styles.ink]}>{r.key}</Text>
                <Text style={[font('meta', bold), styles.secondary]}>{r.value}</Text>
              </View>
            </View>
          ))}
          <View style={styles.actions}>
            <Button
              kind="strong"
              size="md"
              label={`Let ${venueName} know`}
              accessibilityLabel={`Let ${venueName} know I’m a regular`}
              loading={saving === 'known'}
              onPress={() => void save({ known: true }, () => setState('on'))}
              style={styles.fill}
              testID="venue-regular-yes"
            />
            <Button kind="secondary" size="md" label="Not now" onPress={() => setState('later')} style={styles.fill} testID="venue-regular-later" />
          </View>
        </View>
      ) : null}

      {state === 'on' ? (
        <View style={styles.knows} testID="venue-regular-on">
          <Icon name="badge-check" size={ICON.control} />
          <Text numberOfLines={2} style={[font('bodyStrong', bold), styles.ink, styles.fill]}>{`${venueName} knows you’re a regular`}</Text>
          <Pressable
            onPress={() => void save({ known: false }, () => setState('off'))}
            disabled={saving === 'known'}
            accessibilityRole="button"
            accessibilityLabel={`Turn off. ${venueName} stops seeing you as a regular.`}
            accessibilityState={{ busy: saving === 'known' }}
            hitSlop={(minTarget() - SPACE.xl) / 2}
            style={styles.turnOff}
            testID="venue-regular-off"
          >
            <Text style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.ink, styles.underline]}>Turn off</Text>
          </Pressable>
        </View>
      ) : null}

      {state === 'off' ? (
        <View style={styles.done} accessibilityLiveRegion="polite" testID="venue-regular-done">
          <Icon name="check" size={ICON.control} />
          <Text style={[font('meta', bold), styles.ink, styles.fill]}>
            {`Done — ${venueName} no longer sees you as a regular. Offers to regulars still reach you without your name.`}
          </Text>
        </View>
      ) : null}

      <SettingsRow
        icon="bell-off"
        title={`No offers from ${venueName}`}
        hint="Offers go to people who come here often. You can stop them."
        trail="switch"
        value={prefs.offersMuted}
        busy={saving === 'offersMuted'}
        disabled={saving !== null}
        onValueChange={(next) => void save({ offersMuted: next })}
        testID="venue-offers-muted"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: SPACE.sm },
  card: { borderRadius: RADIUS.mediaInCard, backgroundColor: COLOR.surface, padding: SPACE.lg, gap: SPACE.md },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md },
  itemIcon: { marginTop: SPACE.xxs },
  actions: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.xs },
  knows: {
    minHeight: SIZE.primary,
    borderRadius: RADIUS.rowInCard,
    backgroundColor: COLOR.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
  },
  turnOff: { justifyContent: 'center' },
  done: { borderRadius: RADIUS.rowInCard, backgroundColor: COLOR.surface, flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md, padding: SPACE.lg },
  fill: { flex: 1 },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  underline: { textDecorationLine: 'underline' },
})
