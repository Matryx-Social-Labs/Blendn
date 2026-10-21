import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated'

import { type IconName } from '../ui/Icon'
import { COLOR, DURATION, REDUCE_MOTION, SIZE, SPACE, SPRING, STAGGER } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { Chip } from './Chip'
import { monoCaption } from './MonoFamily'
import { RollingNumber } from './RollingNumber'
import { CONTROL_FONT_CAP, minTarget, useBoldText, useIncreaseContrast } from './shared'
import { FieldLabel, FieldNotes } from './TextField'

export type ChipItem = {
  key: string
  label: string
  icon?: IconName
  count?: number | string
  accessibilityLabel?: string
  /** The caller's own cap rule (a chip that does not count toward `max`): overrides the set's. */
  dimmed?: boolean
}

/**
 * The chips a collapsed set shows: the first `n`, and any chosen one beyond them (a pick is never hidden). The rest are
 * `hidden`; with none hidden there is nothing to fold.
 */
export function foldedItems(items: readonly ChipItem[], selected: readonly string[], n: number) {
  const shown = items.filter((item, i) => i < n || selected.includes(item.key))
  return { shown, hidden: items.filter((item) => !shown.includes(item)) }
}

type SetChipProps = {
  itemKey: string
  label: string
  icon?: IconName
  count?: number | string
  accessibilityLabel?: string
  selection: 'single' | 'multi'
  on: boolean
  dimmed: boolean
  capHint?: string
  onToggle: (key: string) => void
  testID?: string
}

/**
 * A chip of the set, taking only primitives and a stable callback: a tap re-renders the chips whose state changed and no
 * other, so a set of thirty never animates (or even renders) as one.
 */
const SetChip = memo(function SetChip({ itemKey, onToggle, on, ...rest }: SetChipProps) {
  return <Chip {...rest} selected={on} onPress={() => onToggle(itemKey)} />
})

export type ChipSetProps = {
  /** The field label (Geist Mono, uppercase). Omit where a control above already heads the set. */
  label?: string
  items: readonly ChipItem[]
  selection: 'single' | 'multi'
  /** Keys: `single` holds none or one. */
  selected: readonly string[]
  /** The caller owns the state (and the rule that tapping the chosen one clears it). */
  onToggle: (key: string) => void
  /** `multi`: a counter "n of max", and the rest dim at the cap, saying `capHint`. */
  max?: number
  capHint?: string
  /** Replaces the counter ("Any", "2 chosen"). */
  counter?: string
  /** Fold everything past this many into a "+n more" chip; a chosen one beyond it stays drawn. */
  foldAfter?: number
  /** Read by a screen reader as "18 more home states". */
  foldNoun?: string
  hint?: string
  /** The one sentence under the set, assertive. */
  error?: string
  testID?: string
}

/**
 * One labelled set of chips (the sweep's chips.html): a header with the label and its counter, a wrapping row of chips, then
 * the hint or the error. `multi` draws the + / ✓ slot and caps at `max`; `single` is a plain pick. A long set folds behind a
 * "+n more" chip, which opens in place (the revealed chips stagger in; the set glides down). Reduce Motion fades them
 * and moves nothing.
 */
export function ChipSet({
  label,
  items,
  selection,
  selected,
  onToggle,
  max,
  capHint,
  counter,
  foldAfter,
  foldNoun = 'more',
  hint,
  error,
  testID,
}: ChipSetProps) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(false)
  const multi = selection === 'multi'
  const atCap = multi && max !== undefined && selected.length >= max
  // "n of max": n rolls (DS #26); a caller's own counter ("Any", "2 chosen") is a word and stays one.
  const rolling = counter === undefined && multi && max !== undefined
  const text = counter ?? (rolling ? `${selected.length} of ${max}` : undefined)
  const { shown, hidden } = foldAfter === undefined ? { shown: items, hidden: [] } : foldedItems(items, selected, foldAfter)
  const visible = open ? items : shown
  const revealed = open ? hidden : []

  // The caller's `onToggle` is usually an inline arrow: the chips hold this stable one, which calls the latest.
  const latestToggle = useRef(onToggle)
  useEffect(() => {
    latestToggle.current = onToggle
  })
  const toggle = useCallback((key: string) => latestToggle.current(key), [])

  const chip = (item: ChipItem) => {
    const on = selected.includes(item.key)
    return (
      <SetChip
        key={item.key}
        itemKey={item.key}
        label={item.label}
        icon={item.icon}
        count={item.count}
        selection={selection}
        on={on}
        dimmed={item.dimmed ?? (atCap && !on)}
        capHint={capHint}
        accessibilityLabel={item.accessibilityLabel}
        onToggle={toggle}
        testID={testID && `${testID}-${item.key}`}
      />
    )
  }
  // The chips glide to their new places as the fold opens and closes; Reduce Motion moves nothing.
  const glide = reduceMotion ? undefined : LinearTransition.springify().stiffness(SPRING.settle.stiffness).damping(SPRING.settle.damping)
  const reveal = (item: ChipItem) => {
    const i = revealed.indexOf(item)
    return (
      <Animated.View
        key={item.key}
        layout={glide}
        entering={FadeIn.duration(reduceMotion ? REDUCE_MOTION.duration.base : DURATION.quick).delay(
          reduceMotion ? 0 : Math.min(i, STAGGER.itemsMax) * STAGGER.tight
        )}
        style={styles.item}
      >
        {chip(item)}
      </Animated.View>
    )
  }

  return (
    <View testID={testID} style={styles.set}>
      {label || text ? (
        <View style={styles.header}>
          {label ? <FieldLabel text={label} bold={bold} contrast={contrast} /> : <View />}
          {rolling ? (
            <View testID={testID && `${testID}-counter`} accessible accessibilityLabel={text} style={styles.counter}>
              <RollingNumber value={selected.length} role="counter" color={COLOR.textSecondary} testID={testID && `${testID}-counter-n`} />
              <Text style={[monoCaption(bold), { color: COLOR.textSecondary }]} maxFontSizeMultiplier={CONTROL_FONT_CAP}>
                {` of ${max}`}
              </Text>
            </View>
          ) : text ? (
            <Text testID={testID && `${testID}-counter`} style={[monoCaption(bold), { color: COLOR.textSecondary }]}>
              {text}
            </Text>
          ) : null}
        </View>
      ) : null}
      <Animated.View layout={glide} testID={testID && `${testID}-wrap`} style={[styles.wrap, { rowGap: minTarget() - SIZE.tag }]}>
        {visible.map((item) =>
          revealed.includes(item) ? (
            reveal(item)
          ) : (
            <Animated.View key={item.key} layout={glide} style={styles.item}>
              {chip(item)}
            </Animated.View>
          )
        )}
        {hidden.length ? (
          <Animated.View layout={glide} style={styles.item}>
            <Chip
              kind="more"
              expanded={open}
              label={open ? 'Show fewer' : `+${hidden.length} more`}
              accessibilityLabel={open ? 'Show fewer' : `${hidden.length} more ${foldNoun}`}
              onPress={() => setOpen((o) => !o)}
              testID={testID && `${testID}-more`}
            />
          </Animated.View>
        ) : null}
      </Animated.View>
      <FieldNotes error={error} hint={hint} bold={bold} />
    </View>
  )
}

const styles = StyleSheet.create({
  set: { gap: SPACE.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  counter: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  item: { maxWidth: '100%' },
})
