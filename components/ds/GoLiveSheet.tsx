import { Fragment, useEffect, useRef } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import { GradientFill } from '../ui/GradientFill'
import { COLOR, FONT_FAMILY, MATERIAL, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { tint } from '../../lib/theme'
import { HoldToConfirm } from './HoldToConfirm'
import { RadioRing } from './PlanCard'
import { Sheet, type SheetAction } from './Sheet'
import { CONTROL_FONT_CAP, font, PRESSED_WASH, useBoldText, useIncreaseContrast } from './shared'

export type GoLiveChoice = 20 | 45 | 60 | 'stay'
export type GoLiveRefusal = 'notHere' | 'eventOn' | 'noArea' | 'age' | 'closed'

const CHOICES: { value: GoLiveChoice; label: string; spoken: string }[] = [
  { value: 20, label: '20 min', spoken: '20 minutes' },
  { value: 45, label: '45 min', spoken: '45 minutes' },
  { value: 60, label: '1 hour', spoken: '1 hour' },
  { value: 'stay', label: 'Stay while I’m here', spoken: 'as long as you’re here' },
]
/** The server's sentences (admin `lib/go-live.ts`, Flow 11 `SRV`). */
const SERVER = {
  notHere: (venue: string) => `You’re not at ${venue} yet.`,
  eventOn: 'An event is on here.',
  noArea: 'You can’t go live here yet.',
  plus: 'Staying live is part of Blendn+.',
}
/** The dial's rows: 56 pt; the chips at their end, 24 pt (Flow 11 `goLive`). */
const ROW_HEIGHT = SIZE.primary
const CHIP = SIZE.control / 2
const CHIP_EDGE = 0.22
const noop = () => {}
/** The locked Stay row dims to 70% (Delta R2-D7: the Plus mark, not a locked row). */
const LOCKED_OPACITY = 0.7

/** Each refusal (Flow 11 · 11.2 `goLive`): its glyph, title, the server's sentence and what follows, its one way on. */
function refusalSheet(refusal: GoLiveRefusal, venue: string, event: string, hours: string, act: () => void, close: () => void) {
  const then = (label: string, kind: SheetAction['kind'] = 'strong'): SheetAction[] => [{ label, kind, onPress: act }]
  /** Nothing to do but read it: OK closes the sheet. */
  const ok: SheetAction[] = [{ label: 'OK', kind: 'strong', onPress: close }]
  switch (refusal) {
    case 'notHere':
      return { icon: 'map-pin' as const, title: 'Not here yet', body: `${SERVER.notHere(venue)} Go live once you’re inside.`, actions: [...then('Open Maps'), { label: 'Close', kind: 'tertiary' as const, onPress: close }] }
    case 'eventOn':
      return {
        icon: 'calendar' as const,
        title: `${event} is on here`,
        body: `${SERVER.eventOn} While it’s on, ${venue}’s room is the event’s room. Check in to ${event} instead.`,
        actions: [...then(`Check in to ${event}`, 'primary'), { label: 'Not now', kind: 'tertiary' as const, onPress: close }],
      }
    case 'noArea':
      return { icon: 'map-pin-off' as const, title: 'Not yet', body: `${SERVER.noArea} ${venue} hasn’t set its check-in area. You can still save it and see tonight’s events.`, actions: ok }
    case 'age':
      return {
        icon: 'id-card' as const,
        title: 'Not yet',
        body: 'Going live is for people 18 and over who have finished setting up.',
        actions: [...then('Finish setting up'), { label: 'Not now', kind: 'tertiary' as const, onPress: close }],
      }
    case 'closed':
      return { icon: 'door-closed' as const, title: `${venue} is closed right now`, body: `Its room opens with the venue. Tonight’s hours: ${hours}.`, actions: ok }
  }
}

/** `H.success` once, as the server says you're live to a sheet already open; never for one that opens live. */
function useLiveHaptic(live: boolean, visible: boolean) {
  const was = useRef({ live, visible })
  useEffect(() => {
    if (live && !was.current.live && visible && was.current.visible) H.success()
    was.current = { live, visible }
  }, [live, visible])
}

/**
 * Go Live: dial, then hold (guidelines/components/GoLiveSheet.html, Flow 11 ·
 * 11.2, Delta R2-D7). "Go live at Toit", what the room sees, then 20 min ·
 * 45 min · 1 hour · Stay while I'm here (20 the first time, then the last one
 * used: the caller's). With Plus gating on, Stay carries the server's sentence
 * and the Plus mark, and a tap opens the Tonight sheet instead. Then the one
 * hold (`HoldToConfirm`, 900 ms) and "You can end it anytime."
 *
 * A refusal replaces the dial with the server's sentence and one way on, with
 * no haptic (a refusal about the place, not about you). `H.select` as the dial
 * changes; the hold plays `H.tick` ×3 and `H.commit`; `H.success` when the
 * server says you're live (`live`). A screen reader hears "Go live at Toit for
 * 45 minutes as Night Cat" and confirms with a double-tap.
 */
export function GoLiveSheet({
  visible,
  onClose,
  venue,
  pseudonym,
  choice,
  onChoice,
  stay = 'free',
  onStayLocked,
  onGoLive,
  busy = false,
  live = false,
  refusal = null,
  event = '',
  hours = '',
  onRefusalAction,
  testID,
}: {
  visible: boolean
  onClose: () => void
  venue: string
  /** Your nickname for today in this room. */
  pseudonym: string
  choice: GoLiveChoice
  onChoice: (choice: GoLiveChoice) => void
  /** `locked` while Stay needs Blend'n+ (the server's PLUS_REQUIRED). */
  stay?: 'free' | 'locked'
  onStayLocked?: () => void
  onGoLive: () => void
  /** The hold is done and the server is answering. */
  busy?: boolean
  /** The server said yes. */
  live?: boolean
  refusal?: GoLiveRefusal | null
  /** The event on here (`eventOn`). */
  event?: string
  /** Tonight's hours (`closed`), "12 PM – 1 AM". */
  hours?: string
  onRefusalAction?: () => void
  testID?: string
}) {
  const ios = Platform.OS === 'ios'
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  useLiveHaptic(live, visible)

  if (refusal) {
    return <Sheet visible={visible} onClose={onClose} testID={testID} {...refusalSheet(refusal, venue, event, hours, () => onRefusalAction?.(), onClose)} />
  }

  const picked = CHOICES.find((c) => c.value === choice) ?? CHOICES[0]
  const locked = stay === 'locked'
  return (
    // While the server answers, the sheet holds and the dial waits (its children are outside `<Sheet>`'s own busy lock).
    <Sheet
      visible={visible}
      onClose={busy ? noop : onClose}
      title={`Go live at ${venue}`}
      body={`People in ${venue}’s room tonight see you by your nickname for today. Outside the room, ${venue} only shows how busy it is — never who.`}
      testID={testID}
    >
      <View accessibilityRole="radiogroup" style={[styles.dial, { backgroundColor: ios ? MATERIAL.fillOnGlass : COLOR.surfaceSunken }]}>
        {CHOICES.map((c, i) => {
          const isStay = c.value === 'stay'
          const rowLocked = isStay && locked
          const sub = isStay ? (rowLocked ? SERVER.plus : `Keeps you live as long as you’re at ${venue}, up to 4 hours`) : null
          const chip = isStay ? (rowLocked ? 'Blend’n+' : 'free today') : null
          const selected = choice === c.value
          return (
            <Fragment key={c.label}>
              {i ? <View style={styles.hairline} /> : null}
              <Pressable
                testID={testID && `${testID}-${c.value}`}
                disabled={busy}
                onPress={() => {
                  if (rowLocked) return onStayLocked?.()
                  if (selected) return
                  H.select()
                  onChoice(c.value)
                }}
                android_ripple={{ color: PRESSED_WASH.android }}
                accessibilityRole="radio"
                accessibilityLabel={[c.label, sub, chip].filter(Boolean).join(', ')}
                accessibilityHint={rowLocked ? 'Opens Blend’n+' : undefined}
                accessibilityState={{ checked: selected, disabled: busy }}
                style={({ pressed }) => [styles.row, rowLocked && { opacity: LOCKED_OPACITY }, pressed && ios ? { backgroundColor: PRESSED_WASH.ios } : null]}
              >
                <RadioRing selected={selected} />
                <View style={styles.text}>
                  <Text style={[font('bodyStrong', bold), { color: rowLocked ? COLOR.textSecondary : COLOR.textPrimary }]}>{c.label}</Text>
                  {sub ? <Text style={[font('meta', bold), { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>{sub}</Text> : null}
                </View>
                {rowLocked ? (
                  <View style={styles.plus} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <GradientFill style={StyleSheet.absoluteFill} />
                    <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('caption', bold, FONT_FAMILY.brand[700]), styles.ink]}>
                      Plus
                    </Text>
                  </View>
                ) : chip ? (
                  <View style={styles.free} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('caption', bold), { color: COLOR.textSecondary }]}>
                      {chip}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            </Fragment>
          )
        })}
      </View>
      <HoldToConfirm
        label="Hold to go live"
        busyLabel="Going live…"
        busy={busy}
        icon="radio"
        srLabel={`Go live at ${venue} for ${picked.spoken} as ${pseudonym}`}
        onConfirm={onGoLive}
        testID={testID && `${testID}-hold`}
      />
      <Text style={[font('meta', bold), styles.centre, { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>You can end it anytime.</Text>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  dial: { borderRadius: RADIUS.sheet, overflow: 'hidden' },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: COLOR.hairline },
  row: { minHeight: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm },
  text: { flex: 1 },
  ink: { color: COLOR.textPrimary },
  plus: { height: CHIP, paddingHorizontal: SPACE.sm, borderRadius: RADIUS.capsule, overflow: 'hidden', justifyContent: 'center' },
  free: { height: CHIP, paddingHorizontal: SPACE.sm, borderRadius: RADIUS.capsule, borderWidth: 1, borderColor: tint(COLOR.textPrimary, CHIP_EDGE), justifyContent: 'center' },
  centre: { textAlign: 'center' },
})
