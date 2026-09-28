import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, TextInput } from 'react-native'

import { closeSheet, showSheet, useSheet, type Sheet, type SheetAction, type SheetOutcome } from '../lib/sheet'
import { CONTROL, EMBER, EMBER_RADIUS, OPACITY, SPACE, TYPE } from '../lib/theme'
import ActionTray, { type ActionTrayButton } from './ActionTray'
import { useToast } from './Toast'
import { Text } from './ui/Text'

/** Long enough for "what happened", short of an essay. The leave route caps at 2000. */
const NOTE_MAX = 500

/**
 * Draws whatever `lib/sheet.ts` holds. Mounted once, inside `ToastProvider`,
 * so a finished step can say what it did.
 *
 * One `ActionTray` for every step, never remounted: a step that remounted the
 * tray would close one `Modal` and open another, which is the chaining this
 * exists to avoid. Only the step's own state resets when the step changes.
 */
export function SheetHost() {
  const { sheet, key } = useSheet()
  const { showToast } = useToast()
  /*
   * The last sheet stays drawn while the Modal fades out, so closing does not
   * blank the tray for its final frames.
   */
  const [shown, setShown] = useState<Sheet | null>(null)
  const [stepKey, setStepKey] = useState(key)
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<{ index: number; text: string } | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const [note, setNote] = useState('')

  // A new step starts clean: no choice, note, error or spinner carried over.
  // Adjusted in render, on the same change the store makes.
  if (stepKey !== key) {
    setStepKey(key)
    setBusy(null)
    setError(null)
    setReason(null)
    setNote('')
  }
  if (sheet && sheet !== shown) setShown(sheet)

  const current = sheet ?? shown
  if (!current) return null

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
    if ('cancel' in action) return closeSheet()
    if ('next' in action) return showSheet(action.next())
    if ('then' in action) {
      closeSheet()
      return action.then()
    }
    begin(index, action.run)
  }

  if (current.kind === 'actions') {
    const buttons: ActionTrayButton[] = current.actions.map((action, index) => ({
      // A failed step keeps its place and says what to do about it.
      label: error?.index === index ? 'Try again' : action.label,
      variant: action.variant,
      loading: busy === index,
      disabled: busy !== null && busy !== index,
      onPress: () => perform(action, index),
    }))
    return (
      <ActionTray
        visible={sheet !== null}
        title={current.title}
        message={current.message}
        buttons={buttons}
        layout="stack"
        onClose={closeSheet}
      >
        {current.content}
        {error ? <ErrorLine text={error.text} /> : null}
      </ActionTray>
    )
  }

  const reasonSheet = current
  const submit = () => {
    if (!reason) return
    const trimmed = note.trim()
    begin(0, () => reasonSheet.run(reason, trimmed ? trimmed : undefined))
  }

  return (
    <ActionTray
      visible={sheet !== null}
      title={current.title}
      message={current.message}
      size="expanded"
      onClose={closeSheet}
      buttons={[
        { label: 'Cancel', onPress: closeSheet, disabled: busy !== null },
        {
          label: error ? 'Try again' : current.submitLabel,
          // The sheet's one primary action, so its one accent.
          variant: 'primary',
          loading: busy !== null,
          disabled: !reason,
          onPress: submit,
        },
      ]}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.reasons}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {current.reasons.map((option) => {
          const selected = option.value === reason
          return (
            <Pressable
              key={option.value}
              onPress={() => setReason(option.value)}
              disabled={busy !== null}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ selected, disabled: busy !== null }}
              style={({ pressed }) => [
                styles.reason,
                selected && styles.reasonSelected,
                pressed && !selected && styles.pressed,
              ]}
            >
              <Text variant="bodyStrong" color={selected ? EMBER.bg : EMBER.textPrimary}>
                {option.label}
              </Text>
            </Pressable>
          )
        })}
        <TextInput
          value={note}
          onChangeText={setNote}
          editable={busy === null}
          placeholder="Add details (optional)"
          placeholderTextColor={EMBER.textPlaceholder}
          accessibilityLabel="Add details, optional"
          multiline
          maxLength={NOTE_MAX}
          style={styles.note}
        />
      </ScrollView>
      {error ? <ErrorLine text={error.text} /> : null}
    </ActionTray>
  )
}

/** What failed, in the server's words where it gave some. */
function ErrorLine({ text }: { text: string }) {
  return (
    <Text variant="meta" color={EMBER.destructive} accessibilityLiveRegion="polite">
      {text}
    </Text>
  )
}

const styles = StyleSheet.create({
  scroll: { flexShrink: 1 },
  reasons: { gap: SPACE.sm },
  // One row, one height: every reason is a 48pt row on `surface`.
  reason: {
    minHeight: CONTROL.md,
    justifyContent: 'center',
    paddingHorizontal: SPACE.lg,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surface,
  },
  // Selected option: `textPrimary` fill, `bg` text (docs/DESIGN_SYSTEM.md).
  reasonSelected: { backgroundColor: EMBER.textPrimary },
  pressed: { opacity: OPACITY.pressed },
  note: {
    ...TYPE.body,
    minHeight: CONTROL.lg + CONTROL.sm,
    marginTop: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surface,
    textAlignVertical: 'top',
  },
})
