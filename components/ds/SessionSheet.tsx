import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { Icon } from '../ui/Icon'
import { COLOR, FONT_FAMILY, ICON, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { PresenceDot } from './MonoFamily'
import { Sheet, type SheetAction } from './Sheet'
import { announceOutcome, font, useBoldText, useIncreaseContrast } from './shared'

/** Where live time stands: minutes left (updated once a minute), the last 5 minutes in mm:ss, or Stay. */
export type SessionTime =
  | { kind: 'minutes'; left: number; /** "21:50". */ until: string }
  | { kind: 'ending'; /** "4:59". */ clock: string; /** The new end an Extend gives, "22:10". */ extendUntil: string }
  | { kind: 'stay'; /** 4 hours from the start, cut at 06:00: "00:40". Left out until the server says it. */ endsBy?: string }

/**
 * `H.success` and the announcement once, as an extension lands while the
 * sheet was already open; never for a sheet that opens extended (even in the
 * same commit) or is closed.
 */
function useExtendedOutcome(extended: boolean, visible: boolean, line: string) {
  const was = useRef({ extended, visible })
  useEffect(() => {
    if (extended && !was.current.extended && visible && was.current.visible) {
      H.success()
      announceOutcome(line)
    }
    was.current = { extended, visible }
    // `line` is read as it stood when the extension landed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extended, visible])
}

/** The live dot beside the count, a step up from the row's 8. */
const DOT = SPACE.sm + SPACE.xxs

/**
 * While you are live at a venue (guidelines/components/SessionSheet.html,
 * Flow 11 · 11.3), opened from the live pill: the time left, Extend in the
 * last 5 minutes (labelled with the new end; going live again extends, never
 * shortens), and End, which confirms (check-out always confirms). Stay reads
 * "Staying" with its 4-hour cap and how each ping inside carries it.
 *
 * One sheet: End turns it into the confirm (iOS will not present a second
 * modal while the first is still leaving), and Keep going turns it back.
 *
 * `H.primary` on Extend's press-in and `H.success` when the extension lands
 * (`extended` turning on: the server's OK), announced; none on End or on the
 * sheet; the confirm's End is the destructive button (`H.destructive`). Flow
 * 11's annotations overrule the page's `H.select`. The count is read as one
 * line, "32 minutes left, live until 21:50". Nothing ticks: the caller updates
 * the minutes once a minute, the clock each second only in the last 5.
 */
export function SessionSheet({
  visible,
  onClose,
  venue,
  time,
  extended = false,
  extending = false,
  onExtend,
  onEnd,
  ending = false,
  startConfirming = false,
}: {
  visible: boolean
  onClose: () => void
  venue: string
  /** Null: the server sent no end to count to (and no stay); the sheet says only that you are live. */
  time: SessionTime | null
  /** Just extended: says until when. */
  extended?: boolean
  /** Extend is on its way to the server. */
  extending?: boolean
  onExtend: () => void
  onEnd: () => void
  /** End is on its way to the server. */
  ending?: boolean
  /**
   * Opens on the confirm (the dock's Leave, R4 R12: "Stop being live at ‹place›?" · Stay · Stop, then
   * "Stopping…"); Stay, or a swipe, then closes the sheet. The pill opens on the session, whose End
   * confirms in the same sheet and goes back to it on Keep going. Read as the sheet opens.
   */
  startConfirming?: boolean
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const [confirming, setConfirming] = useState(visible && startConfirming)
  // Each open starts where it was asked to (the session, or the confirm); a close resets (state adjusted in render).
  const [wasVisible, setWasVisible] = useState(visible)
  if (visible !== wasVisible) {
    setWasVisible(visible)
    setConfirming(visible && startConfirming)
  }
  const extendedLine = time?.kind === 'minutes' ? `Extended · Live until ${time.until}` : ''
  useExtendedOutcome(extended, visible, extendedLine)
  const detail = contrast ? COLOR.textPrimary : COLOR.textSecondary

  if (confirming) {
    const stop = startConfirming
    // Leaving from the dock closes the sheet on Stay; ending from the session goes back to it.
    const cancel = stop ? onClose : () => setConfirming(false)
    return (
      <Sheet
        visible={visible}
        onClose={cancel}
        icon="log-out"
        title={stop ? `Stop being live at ${venue}?` : `End your live time at ${venue}?`}
        body="You leave today’s room at that second. Go live again any time you’re here."
        actions={[
          { label: stop ? (ending ? 'Stopping…' : 'Stop') : 'End', kind: 'destructive', onPress: onEnd, loading: ending },
          { label: stop ? 'Stay' : 'Keep going', kind: 'tertiary', onPress: cancel },
        ]}
      />
    )
  }

  const spoken =
    !time
      ? 'Live'
      : time.kind === 'minutes'
      ? `${time.left} minutes left, live until ${time.until}${extended ? ', extended' : ''}`
      : time.kind === 'ending'
        ? `${time.clock} left, ending soon`
        : `Staying${time.endsBy ? `, ends ${time.endsBy} at the latest` : ''}`
  const sub =
    !time
      ? null
      : time.kind === 'minutes'
      ? `Live until ${time.until}`
      : time.kind === 'ending'
        ? 'Ending soon'
        : `As long as you’re at ${venue} · up to 4 hours${time.endsBy ? ` · ends ${time.endsBy} at the latest` : ''}`
  const actions: SheetAction[] = [{ label: 'End', kind: 'secondary', onPress: () => setConfirming(true) }]
  if (time?.kind === 'ending')
    actions.unshift({ label: `Extend · Live until ${time.extendUntil}`, kind: 'strong', onPress: onExtend, loading: extending, pressHaptic: H.primary })

  return (
    <Sheet visible={visible} onClose={onClose} title={`Live at ${venue}`} actions={actions}>
      <View accessible accessibilityLabel={spoken} style={styles.big}>
        <View style={styles.count}>
          <PresenceDot kind="live" size={DOT} />
          {!time ? (
            <Text style={[font('display', bold), styles.ink]}>Live</Text>
          ) : time.kind === 'stay' ? (
            <Text style={[font('display', bold), styles.ink]}>Staying</Text>
          ) : (
            <Text style={[font('numericDisplay', bold, FONT_FAMILY.mono[700]), styles.ink, styles.tabular]}>
              {time.kind === 'minutes' ? String(time.left) : time.clock}
            </Text>
          )}
          {time?.kind === 'minutes' ? <Text style={[font('title', bold), { color: COLOR.textSecondary }]}>min</Text> : null}
        </View>
        {sub ? <Text style={[font('meta', bold), styles.centre, { color: detail }]}>{sub}</Text> : null}
        {extended && extendedLine ? (
          <View accessibilityLiveRegion="polite" style={styles.extended}>
            <Icon name="check" size={ICON.inline} active />
            <Text style={[font('meta', bold), styles.ink]}>{extendedLine}</Text>
          </View>
        ) : null}
      </View>
      {time?.kind === 'stay' ? (
        <View style={styles.info}>
          <Icon name="info" size={ICON.inline} color={COLOR.textSecondary} />
          <Text style={[font('meta', bold), styles.fill, { color: detail }]}>
            {`Each time your phone sees you inside ${venue}, your time carries 20 minutes further.`}
          </Text>
        </View>
      ) : null}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  big: { alignItems: 'center', gap: SPACE.xs, paddingVertical: SPACE.sm },
  count: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  ink: { color: COLOR.textPrimary },
  tabular: { fontVariant: ['tabular-nums'] },
  centre: { textAlign: 'center' },
  extended: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm },
  fill: { flex: 1 },
})
