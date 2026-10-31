import { Fragment, useEffect, useRef } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import { GradientFill } from '../ui/GradientFill'
import { COLOR, FONT_FAMILY, MATERIAL, MAX_FONT_SCALE, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { tint } from '../../lib/theme'
import { HoldToConfirm } from './HoldToConfirm'
import { RadioRing } from './PlanCard'
import { Sheet, type SheetAction } from './Sheet'
import { CONTROL_FONT_CAP, font, PRESSED_WASH, useBoldText, useIncreaseContrast, useSelection } from './shared'

export type GoLiveChoice = 20 | 45 | 60 | 'stay'
export type GoLiveRefusal = 'notHere' | 'eventOn' | 'noArea' | 'age' | 'closed' | 'gps' | 'timeout' | 'rate' | 'notFound' | 'stay' | 'other'

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
  plus: 'Staying live is part of Blend’n+.',
}
/** The dial's rows: 56 pt; the chips at their end, 24 pt (Flow 11 `goLive`). */
const ROW_HEIGHT = SIZE.primary
const CHIP = SIZE.control / 2
const CHIP_EDGE = 0.22
const noop = () => {}
/** The locked Stay row dims to 70% (Delta R2-D7: the Plus mark, not a locked row). */
const LOCKED_OPACITY = 0.7

/** What each refusal sheet needs to say; `message` is the server's sentence, verbatim, where there is one. */
type RefusalWords = { venue: string; event: string; hours: string; message?: string; title?: string }

/**
 * Each refusal (Flow 11 · 11.2 `goLive`, R4-D11 11-1): its glyph, title, the
 * server's sentence and what follows, its one way on. The buttons are named
 * with the verb, never "OK" (A50). `act` is the way on, `alt` the second one
 * (the paywall, on "Staying live is part of Blend'n+"). No haptic, in any.
 */
function refusalSheet(refusal: GoLiveRefusal, w: RefusalWords, act: () => void, alt: () => void, close: () => void) {
  const then = (label: string, kind: SheetAction['kind'] = 'lit'): SheetAction[] => [{ label, kind, onPress: act }]
  const tertiary = (label: string): SheetAction => ({ label, kind: 'tertiary', onPress: close })
  /** Nothing to do but read it. */
  const read: SheetAction[] = [{ label: 'Close', kind: 'secondary', onPress: close }]
  switch (refusal) {
    case 'notHere':
      return { icon: 'map-pin' as const, title: 'Not here yet', body: `${w.message ?? SERVER.notHere(w.venue)} Go live once you’re inside.`, actions: [...then('Open Maps'), tertiary('Close')] }
    case 'eventOn': {
      const name = w.event || 'the event'
      return {
        icon: 'calendar' as const,
        title: w.event ? `${w.event} is on here` : 'An event is on here',
        body: `${SERVER.eventOn} While it’s on, ${w.venue}’s room is the event’s room. Check in to ${name} instead.`,
        actions: [...then(`Check in to ${name}`, 'primary'), tertiary('Not now')],
      }
    }
    case 'noArea':
      return { icon: 'map-pin-off' as const, title: 'Not yet', body: `${SERVER.noArea} ${w.venue} hasn’t set its check-in area. You can still save it and see tonight’s events.`, actions: read }
    case 'age':
      return {
        icon: 'id-card' as const,
        title: 'Not yet',
        body: 'Going live is for people 18 and over who have finished setting up.',
        actions: [...then('Finish setting up'), tertiary('Not now')],
      }
    case 'closed':
      return { icon: 'door-closed' as const, title: `${w.venue} is closed right now`, body: `Its room opens with the venue. Tonight’s hours: ${w.hours}.`, actions: read }
    case 'gps':
      return { icon: 'locate-off' as const, title: 'GPS signal too weak', body: w.message ?? 'Move somewhere with a clearer view of the sky and try again.', actions: [...then('Try again'), tertiary('Cancel')] }
    case 'timeout':
      return { icon: 'wifi-off' as const, title: 'Couldn’t go live', body: w.message ?? 'Check your connection and try again.', actions: [...then('Try again'), tertiary('Cancel')] }
    case 'rate':
      return { icon: 'timer' as const, title: 'Too many tries', body: w.message ?? 'Try again in a moment.', actions: read }
    case 'notFound':
      return { icon: 'map-pin-off' as const, title: 'This place isn’t available', body: w.message ?? 'It may have been taken off Blend’n.', actions: [...then('Go back')] }
    case 'stay':
      return {
        icon: 'hourglass' as const,
        title: 'Staying live is part of Blend’n+',
        body: 'Pick a time instead — you can extend it for free before it ends.',
        actions: [...then('Pick a time'), { label: 'See Blend’n+', kind: 'secondary' as const, onPress: alt }],
      }
    case 'other':
      return { icon: 'circle-alert' as const, title: w.title ?? 'Couldn’t go live', body: w.message ?? 'We couldn’t make you live here. Please try again.', actions: read }
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
  refusalMessage,
  refusalTitle,
  onRefusalAction,
  onRefusalAlt,
  onDismissed,
  leaving = null,
  testID,
}: {
  /** The room you are in somewhere else: going live here leaves it (SCRUM-635), said before the hold. */
  leaving?: string | null
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
  /** The server's sentence for the refusal, shown verbatim where the design shows "(server copy)". */
  refusalMessage?: string
  /** The title of a refusal that has no sheet of its own (`other`). */
  refusalTitle?: string
  /** The refusal's way on: Open Maps, Check in, Finish setting up, Try again, Pick a time, Go back. */
  onRefusalAction?: () => void
  /** Its second way on: See Blend’n+. */
  onRefusalAlt?: () => void
  /** Once the sheet has left the screen: what must wait for it (a refusal's sheet, the paywall) starts here. */
  onDismissed?: () => void
  testID?: string
}) {
  const ios = Platform.OS === 'ios'
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const sel = useSelection()
  useLiveHaptic(live, visible)

  if (refusal) {
    return <Sheet visible={visible} onClose={onClose} onDismissed={onDismissed} testID={testID} {...refusalSheet(refusal, { venue, event, hours, message: refusalMessage, title: refusalTitle }, () => onRefusalAction?.(), () => onRefusalAlt?.(), onClose)} />
  }

  const picked = CHOICES.find((c) => c.value === choice) ?? CHOICES[0]
  const locked = stay === 'locked'
  return (
    // While the server answers, the sheet holds and the dial waits (its children are outside `<Sheet>`'s own busy lock).
    <Sheet
      visible={visible}
      onClose={busy ? noop : onClose}
      onDismissed={onDismissed}
      // The venue is named once, in the title; the body and the dial say "here" and "this place" (B-T1: three times).
      title={`Go live at ${venue}`}
      body="People in the room here tonight see you by your nickname for today. Outside the room, this place only shows how busy it is — never who."
      testID={testID}
    >
      <View accessibilityRole="radiogroup" style={[styles.dial, { backgroundColor: ios ? MATERIAL.fillOnGlass : COLOR.surfaceSunken }]}>
        {CHOICES.map((c, i) => {
          const isStay = c.value === 'stay'
          const rowLocked = isStay && locked
          const sub = isStay ? (rowLocked ? SERVER.plus : 'Keeps you live while you’re here, up to 4 hours') : null
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
                // The pick is lit (B-T2: a bare radio ring said it alone): the hue's fill behind the row, as a picked RadioCard's.
                style={({ pressed }) => [
                  styles.row,
                  rowLocked && { opacity: LOCKED_OPACITY },
                  selected ? { backgroundColor: sel.fill } : pressed && ios ? { backgroundColor: PRESSED_WASH.ios } : null,
                ]}
              >
                <RadioRing selected={selected} testID={testID && `${testID}-${c.value}-ring`} />
                <View style={styles.text}>
                  <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('bodyStrong', bold), { color: rowLocked ? COLOR.textSecondary : COLOR.textPrimary }]}>
                    {c.label}
                  </Text>
                  {sub ? (
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>
                      {sub}
                    </Text>
                  ) : null}
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
        kind="lit"
        srLabel={`Go live at ${venue} for ${picked.spoken} as ${pseudonym}`}
        consequence={leaving ? `Leaves ${leaving}.` : undefined}
        onConfirm={onGoLive}
        testID={testID && `${testID}-hold`}
      />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.centre, { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>
        {leaving ? `Leaves ${leaving}. You can end it anytime.` : 'You can end it anytime.'}
      </Text>
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
