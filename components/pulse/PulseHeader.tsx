import { useEffect, useRef, useState } from 'react'
import { Dimensions, Keyboard, Platform, StyleSheet, TextInput, View } from 'react-native'

import { Button } from '../ds/Button'
import { SearchField } from '../ds/SearchField'
import { SIZE, SPACE } from '../../lib/design/tokens'
import { keyboardLeft } from '../../lib/home'

/**
 * The Pulse's search, opened in place (Flow 3 · Pulse, Option C): the search icon beside the city chip becomes this row
 * over Events | Places, focused, and the keyboard takes the drawer full (`snapOnKeyboard`). Cancel clears it and puts the
 * tabs back. The field is the DS `SearchField`; the text is the shell's, so the list below reads the same value.
 */
export function PulseSearchRow({ query, onChangeQuery, onCancel }: { query: string; onChangeQuery: (next: string) => void; onCancel: () => void }) {
  const [focused, setFocused] = useState(false)
  const input = useRef<TextInput>(null)
  /*
   * Android only: Back closes the keyboard and leaves the field focused, so a tap on it opened no keyboard. A keyboard
   * that actually left blurs it, and the next tap is a fresh focus. Never on iOS: there a hide can arrive while you type
   * (a frame change), and blurring on it closed the keyboard after every character (drive 3).
   */
  useEffect(() => {
    if (!focused || Platform.OS !== 'android') return
    const sub = Keyboard.addListener('keyboardDidHide', (e) => {
      if (keyboardLeft(e, Dimensions.get('screen').height)) input.current?.blur()
    })
    return () => sub.remove()
  }, [focused])
  return (
    <View style={styles.row}>
      <View style={styles.field}>
        <SearchField
          value={query}
          onChangeText={onChangeQuery}
          placeholder="Search events…"
          inputRef={input}
          autoFocus
          returnKeyType="search"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          testID="pulse-search"
        />
      </View>
      <Button kind="tertiary" size="sm" label="Cancel" onPress={onCancel} testID="pulse-search-cancel" />
    </View>
  )
}

const styles = StyleSheet.create({
  row: { height: SIZE.control, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  field: { flex: 1 },
})
