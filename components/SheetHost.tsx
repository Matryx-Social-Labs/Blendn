import { useState, type ReactNode } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import { closeSheet, dismissSheet, showSheet, useSheet, type Sheet, type SheetAction, type SheetOutcome } from '../lib/sheet'
import { COLOR, ICON, MATERIAL, SIZE, SPACE } from '../lib/design/tokens'
import { OPACITY } from '../lib/theme'
import type { ButtonKind } from './ds/Button'
import { Spinner } from './ds/Loader'
import { Sheet as DsSheet, type SheetAction as DsAction } from './ds/Sheet'
import { font, HueProvider, PRESSED_WASH, useBoldText, useIncreaseContrast, useSelection } from './ds/shared'
import { TextArea } from './ds/TextField'
import { Icon, type IconName } from './ui/Icon'
import { useToast } from './Toast'

/** Long enough for "what happened", short of an essay. The leave route caps at 2000. */
const NOTE_MAX = 500

/** lib/sheet's variants as the DS Sheet's kinds: an affirmative in a sheet is lit in the caller's world, never the gradient. */
const KIND: Record<NonNullable<SheetAction['variant']>, ButtonKind> = {
  primary: 'lit',
  secondary: 'secondary',
  destructive: 'destructive',
}
const kindOf = (action: SheetAction): ButtonKind => ('cancel' in action ? 'tertiary' : KIND[action.variant ?? 'secondary'])

/**
 * Draws whatever `lib/sheet.ts` holds, on the DS Sheet (guidelines/components/Sheet.html).
 * Mounted once, inside `ToastProvider`, so a finished step can say what it did.
 *
 * One Sheet for every step, never remounted: a step that remounted it would
 * close one `Modal` and open another, which is the chaining this exists to
 * avoid. Only the step's own state resets when the step changes.
 *
 * A reason step is the design's list (Flow 5 #17, Room info #05): a tap on a
 * reason sends the report; "Something else" asks for a note first (R3-D5
 * 5.7). A failed step keeps its place and says why.
 */
export function SheetHost() {
  const { sheet, key } = useSheet()
  const { showToast } = useToast()
  /*
   * The last sheet stays drawn while the Sheet slides out, so closing does not
   * blank it for its final frames.
   */
  const [shown, setShown] = useState<Sheet | null>(null)
  const [stepKey, setStepKey] = useState(key)
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<{ index: number; text: string } | null>(null)
  /** "Something else": the reason waiting for its note. */
  const [noting, setNoting] = useState<string | null>(null)
  const [note, setNote] = useState('')

  // A new step starts clean: no note, error or spinner carried over.
  // Adjusted in render, on the same change the store makes.
  if (stepKey !== key) {
    setStepKey(key)
    setBusy(null)
    setError(null)
    setNoting(null)
    setNote('')
  }
  if (sheet && sheet !== shown) setShown(sheet)

  const current = sheet ?? shown
  if (!current) return null
  // Outside every screen's world: the caller names its hue (`lib/sheet`). One provider around every step, so a step never remounts the Sheet.
  const inWorld = (node: ReactNode) => <HueProvider value={current.hue ?? 'ember'}>{node}</HueProvider>

  const settle = (index: number, outcome: SheetOutcome) => {
    setBusy(null)
    if (outcome.ok) {
      closeSheet()
      if (outcome.toast) showToast(outcome.toast, 'success')
    } else {
      setError({ index, text: outcome.error })
    }
  }

  const begin = (index: number, work: () => Promise<SheetOutcome>) => {
    setBusy(index)
    setError(null)
    work()
      .then((outcome) => settle(index, outcome))
      .catch(() => settle(index, { ok: false, error: 'Something went wrong.' }))
  }

  const perform = (action: SheetAction, index: number) => {
    if ('cancel' in action) return dismissSheet()
    if ('next' in action) return showSheet(action.next())
    if ('then' in action) {
      closeSheet()
      return action.then()
    }
    begin(index, action.run)
  }

  if (current.kind === 'actions') {
    const rows = current.layout === 'rows'
    const asButton = (action: SheetAction, index: number): DsAction => ({
      // A failed step keeps its place and says what to do about it.
      label: error?.index === index ? 'Try again' : action.label,
      kind: kindOf(action),
      loading: busy === index,
      disabled: busy !== null && busy !== index,
      // The confirm plays H.destructive; a step that only leads to one does not.
      pressHaptic: action.pressHaptic ?? !('next' in action),
      onPress: () => perform(action, index),
    })
    return inWorld(
      <DsSheet
        visible={sheet !== null}
        onClose={dismissSheet}
        title={current.title}
        body={current.message}
        icon={current.icon}
        actions={current.actions.flatMap((a, i) => (rows && !('cancel' in a) ? [] : [asButton(a, i)]))}
        testID="sheet-host"
      >
        {current.content}
        {rows ? (
          <OptionRows
            rows={current.actions.flatMap((a, i) =>
              'cancel' in a
                ? []
                : [
                    {
                      key: a.label,
                      label: a.label,
                      accessibilityLabel: a.accessibilityLabel,
                      icon: a.icon,
                      destructive: a.variant === 'destructive',
                      lit: a.variant === 'primary',
                      chevron: 'next' in a,
                      busy: busy === i,
                      disabled: !!a.disabled || (busy !== null && busy !== i),
                      onPress: () => perform(a, i),
                    },
                  ]
            )}
          />
        ) : null}
        {error ? <ErrorLine text={error.text} /> : null}
      </DsSheet>
    )
  }

  const reasonSheet = current
  const send = (reason: string, index: number, text?: string) => {
    const trimmed = text?.trim()
    begin(index, () => reasonSheet.run(reason, trimmed ? trimmed : undefined))
  }

  if (noting !== null) {
    return inWorld(
      <DsSheet
        visible={sheet !== null}
        onClose={closeSheet}
        title="Something else"
        body={
          reasonSheet.about
            ? `Tell us what happened. ${reasonSheet.about} isn’t told who sent this.`
            : 'Tell us what happened. Nobody is told who sent it.'
        }
        actions={[
          {
            label: error ? 'Try again' : 'Send report',
            kind: 'lit',
            loading: busy !== null,
            disabled: !note.trim(),
            onPress: () => send(noting, 0, note),
          },
          { label: 'Cancel', kind: 'tertiary', onPress: closeSheet },
        ]}
        testID="sheet-host"
      >
        <TextArea value={note} onChangeText={setNote} placeholder="What happened?" limit={NOTE_MAX} disabled={busy !== null} />
        {error ? <ErrorLine text={error.text} /> : null}
      </DsSheet>
    )
  }

  return inWorld(
    <DsSheet
      visible={sheet !== null}
      onClose={closeSheet}
      title={current.title}
      body={current.message}
      actions={[{ label: 'Cancel', kind: 'tertiary', onPress: closeSheet, disabled: busy !== null }]}
      testID="sheet-host"
    >
      <OptionRows
        rows={current.reasons.map((option, i) => ({
          key: option.value,
          label: option.label,
          chevron: true,
          busy: busy === i,
          disabled: busy !== null && busy !== i,
          onPress: () => (option.value === 'other' ? setNoting(option.value) : send(option.value, i)),
        }))}
      />
      {error ? <ErrorLine text={error.text} /> : null}
    </DsSheet>
  )
}

type OptionRow = {
  key: string
  label: string
  accessibilityLabel?: string
  icon?: IconName
  destructive?: boolean
  /** The row's glyph and label light in the sheet's world (a positive action, `Button kind="lit"`'s colour). */
  lit?: boolean
  /** It opens another step. */
  chevron?: boolean
  busy?: boolean
  disabled?: boolean
  onPress: () => void
}

/** The design's sheet list: 48 pt rows, a hairline between, a chevron on a row that goes further. */
export function OptionRows({ rows }: { rows: OptionRow[] }) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const sel = useSelection()
  return (
    <View>
      {rows.map((row, i) => {
        const color = row.destructive ? COLOR.destructive : row.lit ? sel.glyph : COLOR.textPrimary
        return (
          <Pressable
            key={row.key}
            onPress={row.onPress}
            disabled={row.disabled || row.busy}
            accessibilityRole="button"
            accessibilityLabel={row.accessibilityLabel ?? row.label}
            accessibilityState={{ disabled: !!row.disabled, busy: !!row.busy }}
            android_ripple={{ color: PRESSED_WASH.android }}
            style={({ pressed }) => [
              styles.row,
              i > 0 && (contrast ? styles.hairlineContrast : styles.hairline),
              pressed && Platform.OS === 'ios' && styles.pressed,
              row.disabled && styles.dim,
            ]}
          >
            {row.icon ? <Icon name={row.icon} size={ICON.inline} color={color} /> : null}
            <Text style={[font('body', bold), styles.label, { color }]}>{row.label}</Text>
            {row.busy ? <Spinner size={16} color={color} /> : row.chevron ? <Icon name="chevron-right" size={ICON.inline} color={COLOR.textSecondary} /> : null}
          </Pressable>
        )
      })}
    </View>
  )
}

/** What failed, in the server's words where it gave some. */
function ErrorLine({ text }: { text: string }) {
  const bold = useBoldText()
  return (
    <Text accessibilityLiveRegion="polite" style={[font('meta', bold), styles.error]}>
      {text}
    </Text>
  )
}

const styles = StyleSheet.create({
  row: { minHeight: SIZE.control, flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  hairline: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLOR.hairline },
  hairlineContrast: { borderTopWidth: 1, borderTopColor: MATERIAL.hairlineIncreaseContrast },
  pressed: { backgroundColor: PRESSED_WASH.ios },
  dim: { opacity: OPACITY.disabled },
  label: { flex: 1 },
  error: { color: COLOR.destructive },
})
