/*
 * <SettingsRow> and <SettingsGroup> (guidelines/components/SettingsRow.html):
 * switch, chevron, external and plain trails; pressed, focused, disabled,
 * busy, error (a rollback, #39) and destructive; one element per row for a
 * screen reader; the grouped card with hairlines from the text edge.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, StyleSheet } from 'react-native'

import { SettingsGroup, SettingsRow } from '../components/ds/SettingsRow'
import { PRESSED_WASH } from '../components/ds/shared'
import { COLOR, ICON, MATERIAL, SPACE } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { OPACITY } from '../lib/theme'

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const text = (t: string) => StyleSheet.flatten(screen.getByText(t).props.style)

let toggle: jest.SpyInstance
let error: jest.SpyInstance
beforeEach(() => {
  toggle = jest.spyOn(H, 'toggle').mockImplementation(() => {})
  error = jest.spyOn(H, 'error').mockImplementation(() => {})
})

const push = (props: Partial<React.ComponentProps<typeof SettingsRow>> = {}) => (
  <SettingsRow
    icon="bell"
    title="Push notifications"
    hint="Matches, messages and reminders"
    trail="switch"
    value
    onValueChange={jest.fn()}
    testID="r"
    {...props}
  />
)

describe('<SettingsRow>', () => {
  it('is at least 56 pt tall', async () => {
    await render(push())
    expect(flat('r').minHeight).toBe(56)
  })

  it('a switch row is one switch element: “{title}, {hint}, switch, on”', async () => {
    await render(push())
    const row = screen.getByRole('switch', { name: 'Push notifications, Matches, messages and reminders' })
    expect(row.props.accessibilityState).toMatchObject({ checked: true })
  })

  it('tapping the row flips the switch and plays H.toggle', async () => {
    const onValueChange = jest.fn()
    await render(push({ value: false, onValueChange }))
    await fireEvent.press(screen.getByTestId('r'))
    expect(onValueChange).toHaveBeenCalledWith(true)
    expect(toggle).toHaveBeenCalledWith(true)
  })

  it('draws the P1 Toggle: on is the white track with the ink thumb (F1)', async () => {
    await render(push())
    expect(flat('r-toggle-on').backgroundColor).toBe(COLOR.selectionFill)
    expect(flat('r-toggle-thumb-ink').backgroundColor).toBe(COLOR.selectionInk)
  })

  it('the row’s press reaches the toggle: its thumb widens under the finger', async () => {
    await render(push())
    await fireEvent(screen.getByTestId('r'), 'pressIn')
    expect(flat('r-toggle-thumb').width).toBe(32)
    await fireEvent(screen.getByTestId('r'), 'pressOut')
    expect(flat('r-toggle-thumb').width).toBe(27)
  })

  it('busy dims the toggle, not the row', async () => {
    await render(push({ busy: true }))
    expect(flat('r-toggle').opacity).toBe(OPACITY.disabled)
    expect(flat('r').opacity).toBeUndefined()
  })

  it('a chevron row is a silent button; an external row is a link that says where it goes', async () => {
    const onPress = jest.fn()
    await render(<SettingsRow icon="shield" title="Blocked users" hint="3" trail="chevron" onPress={onPress} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Blocked users, 3' }))
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(toggle).not.toHaveBeenCalled()

    await render(<SettingsRow icon="file-text" title="Privacy policy" trail="external" onPress={onPress} />)
    expect(screen.getByRole('link', { name: 'Privacy policy, opens in browser' })).toBeTruthy()
  })

  it('disabled: 45%, announced, not pressable', async () => {
    const onValueChange = jest.fn()
    await render(push({ disabled: true, onValueChange }))
    expect(flat('r').opacity).toBe(OPACITY.disabled)
    expect(screen.getByTestId('r').props.accessibilityState).toMatchObject({ disabled: true })
    await fireEvent.press(screen.getByTestId('r'))
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('busy: a spinner beside the switch, which holds still', async () => {
    const onValueChange = jest.fn()
    await render(push({ busy: true, hint: 'Saving…', onValueChange }))
    expect(screen.getByTestId('r-spinner', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByTestId('r').props.accessibilityState).toMatchObject({ busy: true })
    await fireEvent.press(screen.getByTestId('r'))
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('a rollback (#39): the hint in red, and H.error once, when the error arrives', async () => {
    await render(push({ value: true }))
    expect(error).not.toHaveBeenCalled()
    await screen.rerender(push({ value: false, error: true, hint: 'Couldn’t save. Try again.' }))
    expect(text('Couldn’t save. Try again.').color).toBe(COLOR.destructive)
    expect(error).toHaveBeenCalledTimes(1)
    await screen.rerender(push({ value: false, error: true, hint: 'Couldn’t save. Try again.' }))
    expect(error).toHaveBeenCalledTimes(1)
  })

  it('destructive: the title and glyph in red', async () => {
    await render(<SettingsRow icon="trash" title="Delete account" trail="chevron" destructive onPress={jest.fn()} />)
    expect(text('Delete account').color).toBe(COLOR.destructive)
  })

  it('pressed on iOS washes 6% white; focused draws the inset ring', async () => {
    await render(push({ previewState: 'pressed' }))
    expect(flat('r').backgroundColor).toBe(PRESSED_WASH.ios)
    await render(<SettingsRow icon="shield" title="Blocked users" trail="chevron" previewState="focused" testID="r" />)
    expect(flat('r-focus').borderColor).toBe(COLOR.focusRing)
    // A switch row is focused as a row too: the switch inside is drawn, not focused.
    await render(push({ previewState: 'focused' }))
    expect(flat('r-focus').borderColor).toBe(COLOR.focusRing)
  })
})

describe('<SettingsGroup>', () => {
  const group = () => (
    <SettingsGroup title="Privacy" testID="g">
      <SettingsRow icon="eye" title="Show online status" trail="switch" value onValueChange={jest.fn()} />
      <SettingsRow icon="shield" title="Blocked users" trail="chevron" onPress={jest.fn()} />
      <SettingsRow icon="download" title="Get a copy of your data" trail="chevron" onPress={jest.fn()} />
    </SettingsGroup>
  )

  it('heads its card with the label, and starts hairlines at the text edge', async () => {
    await render(group())
    expect(screen.getByRole('header', { name: 'Privacy' })).toBeTruthy()
    const lines = screen.getAllByTestId('g-hairline', { includeHiddenElements: true })
    expect(lines).toHaveLength(2)
    expect(StyleSheet.flatten(lines[0].props.style)).toMatchObject({
      marginLeft: SPACE.lg + ICON.control + SPACE.lg,
      backgroundColor: COLOR.hairline,
    })
  })

  it('Increase Contrast: hairlines at 50% and 1 pt, the card outlined', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await render(group())
    await act(async () => {})
    const line = StyleSheet.flatten(screen.getAllByTestId('g-hairline', { includeHiddenElements: true })[0].props.style)
    expect(line).toMatchObject({ height: 1, backgroundColor: MATERIAL.hairlineIncreaseContrast })
    expect(flat('g-card').borderColor).toBe(MATERIAL.hairlineIncreaseContrast)
  })
})
