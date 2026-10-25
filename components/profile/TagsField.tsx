import { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { Chip } from '../ds/Chip'
import { Sheet } from '../ds/Sheet'
import { TextField } from '../ds/TextField'
import { SPACE } from '../../lib/design/tokens'

/** The same cap as before: a tag is a short phrase. */
export const TAG_MAX = 60
/** Between wrapped rows the chips' 44 pt reach would overlap at 8, so rows sit a gutter apart (ChipSet, U-M13). */
const ROW_GAP = SPACE.lg

/**
 * A few free-text phrases a person writes themselves — Goals, Looking for (audit §3 item 4: the frame draws neither, and whether
 * they stay is still the owner's question, so they are restyled, not removed). Each phrase is a removable DS chip lit in the
 * screen's hue; the last chip, Add, opens a Sheet with one `TextField` (60 characters, the counter in Geist Mono). Adding the same
 * phrase twice adds it once. Nothing here saves: the host form owns the list and the Save.
 */
export function TagsField({
  items,
  onChange,
  addLabel,
  sheetTitle,
  placeholder,
  testID,
}: {
  items: readonly string[]
  onChange: (next: string[]) => void
  /** The chip that opens the sheet ("Add goal"). */
  addLabel: string
  sheetTitle: string
  placeholder: string
  testID?: string
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const value = text.trim()

  const close = () => {
    setOpen(false)
    setText('')
  }
  const add = () => {
    if (!value) return
    if (!items.includes(value)) onChange([...items, value])
    close()
  }

  return (
    <View testID={testID}>
      <View style={styles.wrap}>
        {items.map((item) => (
          // The item is the key: add is guarded against duplicates, and an index key hands the next chip the removed one's identity.
          <Chip key={item} label={item} selected onRemove={() => onChange(items.filter((i) => i !== item))} />
        ))}
        <Chip label={addLabel} icon="plus" onPress={() => setOpen(true)} testID={testID && `${testID}-add`} />
      </View>
      <Sheet
        visible={open}
        onClose={close}
        title={sheetTitle}
        actions={[
          { label: 'Add', kind: 'primary', onPress: add, disabled: !value },
          { label: 'Cancel', kind: 'tertiary', onPress: close },
        ]}
        testID={testID && `${testID}-sheet`}
      >
        <TextField
          value={text}
          onChangeText={(next) => setText([...next].slice(0, TAG_MAX).join(''))}
          placeholder={placeholder}
          limit={TAG_MAX}
          returnKeyType="done"
          onSubmitEditing={add}
          autoFocus
          testID={testID && `${testID}-input`}
        />
      </Sheet>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', columnGap: SPACE.sm, rowGap: ROW_GAP },
})
