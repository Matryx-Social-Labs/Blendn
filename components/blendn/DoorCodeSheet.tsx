import { useEffect, useState } from 'react'
import { AccessibilityInfo, Platform, StyleSheet, Text, TextInput, View } from 'react-native'

import { COLOR, FONT_FAMILY, ICON, MAX_FONT_SCALE, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { OPACITY } from '../../lib/theme'
import { DOOR_CODE_LENGTH, type DoorCodeSheetModel } from '../../lib/useCheckInFlow'
import { FieldBorder, FieldLabel } from '../ds/TextField'
import { Sheet } from '../ds/Sheet'
import { font, useBoldText, useIncreaseContrast } from '../ds/shared'
import { Icon } from '../ui/Icon'

const HINT = 'Six letters and numbers from the host’s screen. It changes every 30 seconds.'
/** Half the code, as the host's screen groups it (3 + 3). */
const GROUP = DOOR_CODE_LENGTH / 2
/** gA-entry: the field is 70 pt tall, its code in the numeric-display role. */
const FIELD_HEIGHT = SIZE.input + SPACE.md + SPACE.xxs

/** The sheet's second line (gA-entry: "Neon Nights at Toit · Toit, Indiranagar"): the event, then where, as far as known. */
export function doorCodeEventLine(title?: string | null, venue?: string | null, area?: string | null): string {
  const where = [venue, area && area !== venue ? area : null].filter(Boolean).join(', ')
  return [title, where].filter(Boolean).join(' · ')
}

/** What was typed, as it is sent: capitals, no spaces or dashes, six at most (the server folds 8/B, 5/S, 2/Z itself). */
export const cleanCode = (typed: string): string => typed.replace(/[^0-9a-z]/gi, '').toUpperCase().slice(0, DOOR_CODE_LENGTH)

/** The code as the host's screen shows it, "7KQ M4P": the space is the mask's, not the value's. */
export function displayCode(code: string): string {
  return code.length > GROUP ? `${code.slice(0, GROUP)} ${code.slice(GROUP)}` : code
}

/**
 * The host's door code, typed by a guest GPS could not place (gate 13; design/02a guest A: gA-entry, gA-wrong, gA-locked,
 * gA-far; SPEC §4 and §8). One field, Check in and Try GPS again; the server's answers under the field, in its words.
 * DS parts: the Sheet, its Buttons, the field's label and border.
 */
export function DoorCodeSheet({ door, eventLine, testID }: { door: DoorCodeSheetModel | null; eventLine?: string; testID: string }) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const [typed, setTyped] = useState('')
  const [focused, setFocused] = useState(false)
  // Each opening starts empty, or with the code its answer is about; an answer keeps what was typed (§8).
  const open = door !== null
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setTyped(door?.code ?? '')
  }
  // The last answer stays drawn while the sheet slides away, so a closing sheet never flips back to its hint.
  const [shown, setShown] = useState({ error: undefined as string | undefined, locked: false, tries: 0 })
  if (door && (door.error !== shown.error || door.locked !== shown.locked || door.tries !== shown.tries)) {
    setShown({ error: door.error, locked: door.locked, tries: door.tries })
  }
  const { error, locked, tries } = shown
  // §8: each answer said once, starting "Error.", on both platforms. Not a live region: one mounted already filled is not read.
  useEffect(() => {
    if (error) AccessibilityInfo.announceForAccessibility(`Error. ${error}`)
  }, [error, tries])
  const submit = () => door?.submit(typed)

  return (
    <Sheet
      visible={open}
      onClose={() => door?.close()}
      title="Door code"
      body={eventLine}
      actions={[
        { label: 'Check in', kind: 'lit', onPress: submit, loading: door?.busy, disabled: locked, testID: `${testID}-check-in` },
        { label: 'Try GPS again', kind: 'tertiary', onPress: () => door?.tryGps(), disabled: door?.busy, testID: `${testID}-gps` },
      ]}
      testID={testID}
    >
      <View style={styles.field}>
        {/* The field's name is its accessibilityLabel: the visual label is not read twice. */}
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.label}>
          <FieldLabel text="Door code" bold={bold} contrast={contrast} />
        </View>
        <View style={[styles.box, locked && styles.locked]}>
          <TextInput
            testID={`${testID}-input`}
            // ponytail: the mask's space puts the caret at the end after an edit mid-code; at the end, where typing happens, it is exact.
            value={displayCode(typed)}
            onChangeText={(text) => {
              setTyped(cleanCode(text))
              if (error) door?.clearError()
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={submit}
            editable={!locked}
            autoFocus
            // §4: digits reachable beside letters (Android's number row; iOS's 123 key), forgiving of case, no corrections.
            keyboardType={Platform.OS === 'android' ? 'visible-password' : 'ascii-capable'}
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            returnKeyType="go"
            placeholder="••• •••"
            placeholderTextColor={COLOR.textTertiary}
            selectionColor={COLOR.textPrimary}
            cursorColor={COLOR.textPrimary}
            maxFontSizeMultiplier={MAX_FONT_SCALE.numericDisplay}
            accessibilityLabel="Door code"
            accessibilityHint={error ?? HINT}
            accessibilityState={{ disabled: locked }}
            style={[font('numericDisplay', bold, FONT_FAMILY.mono[700]), styles.input]}
          />
          <FieldBorder focused={focused} error={!!error} contrast={contrast} radius={RADIUS.capsule} />
        </View>
        {error ? (
          <View style={styles.note}>
            <Icon name="triangle-alert" size={ICON.inline} color={COLOR.destructive} />
            <Text
              accessibilityLabel={`Error. ${error}`}
              maxFontSizeMultiplier={MAX_FONT_SCALE.meta}
              style={[font('meta', bold), styles.noteText, styles.error]}
            >
              {error}
            </Text>
          </View>
        ) : (
          <Text accessibilityElementsHidden importantForAccessibility="no" maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.hint]}>
            {HINT}
          </Text>
        )}
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  field: { gap: SPACE.sm },
  label: { paddingLeft: SPACE.xs },
  box: { minHeight: FIELD_HEIGHT, borderRadius: RADIUS.capsule, backgroundColor: COLOR.surface, justifyContent: 'center', paddingHorizontal: SPACE.xl },
  locked: { opacity: OPACITY.disabled },
  input: { color: COLOR.textPrimary, textAlign: 'center', padding: 0 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm, paddingLeft: SPACE.xs },
  noteText: { flex: 1 },
  error: { color: COLOR.destructive },
  hint: { color: COLOR.textTertiary, paddingLeft: SPACE.xs },
})
