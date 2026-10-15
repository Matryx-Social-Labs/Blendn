/*
 * <DateField> (guidelines/components/DateField.html): DD · MM · YYYY in three
 * Geist Mono capsules at 1 : 1 : 1.5, day-first everywhere, focus moving on
 * when a box is full, one error sentence for all three, no haptic.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React, { useState } from 'react'
import { StyleSheet, TextInput } from 'react-native'

import { DateField, type DateParts } from '../components/ds/DateField'
import { COLOR, FONT_FAMILY, SIZE } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { OPACITY } from '../lib/theme'

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const box = (name: 'day' | 'month' | 'year') => screen.getByLabelText(`Date of birth, ${name}`)

function Controlled(props: Partial<React.ComponentProps<typeof DateField>>) {
  const [value, setValue] = useState<DateParts>(['', '', ''])
  return <DateField label="Date of birth" value={value} onChange={setValue} testID="d" {...props} />
}

describe('<DateField>', () => {
  it('draws three 56 pt boxes, day first, at 1 : 1 : 1.5', async () => {
    await render(<Controlled />)
    expect(flat('d-0')).toMatchObject({ flex: 1, height: SIZE.input, backgroundColor: COLOR.surface })
    expect(flat('d-1').flex).toBe(1)
    expect(flat('d-2').flex).toBe(1.5)
    expect(box('day').props.placeholder).toBe('DD')
    expect(box('year').props.placeholder).toBe('YYYY')
  })

  it('the digits are Geist Mono, tabular, on a number pad, capped at 1.3×', async () => {
    await render(<Controlled />)
    const day = box('day')
    expect(StyleSheet.flatten(day.props.style)).toMatchObject({ fontFamily: FONT_FAMILY.mono[500], fontVariant: ['tabular-nums'] })
    expect(day.props.keyboardType).toBe('number-pad')
    expect(day.props.maxFontSizeMultiplier).toBe(1.3)
    expect(day.props.maxLength).toBe(2)
    expect(box('year').props.maxLength).toBe(4)
  })

  it('keeps digits only, and moves focus on when a box is full', async () => {
    const focus = jest.spyOn(TextInput.prototype, 'focus')
    const onChange = jest.fn()
    await render(<DateField label="Date of birth" value={['', '', '']} onChange={onChange} />)
    await fireEvent.changeText(box('day'), '1a4')
    expect(onChange).toHaveBeenLastCalledWith(['14', '', ''])
    expect(focus).toHaveBeenCalledTimes(1)
    expect((focus.mock.contexts[0] as TextInput & { props: { accessibilityLabel: string } }).props.accessibilityLabel).toBe('Date of birth, month')
  })

  it('backspace in an empty box goes back to the one before', async () => {
    const focus = jest.spyOn(TextInput.prototype, 'focus')
    await render(<DateField label="Date of birth" value={['14', '', '']} onChange={jest.fn()} />)
    await fireEvent(box('month'), 'keyPress', { nativeEvent: { key: 'Backspace' } })
    expect((focus.mock.contexts.at(-1) as TextInput & { props: { accessibilityLabel: string } }).props.accessibilityLabel).toBe('Date of birth, day')
  })

  it('a focused box takes the 2 pt white ring', async () => {
    await render(<Controlled previewFocus={1} />)
    expect(flat('d-1-border')).toMatchObject({ borderWidth: 2, borderColor: COLOR.focusRing })
    expect(flat('d-0-border')).toMatchObject({ borderWidth: 1, borderColor: COLOR.inputBorder })
  })

  it('an impossible date is the ring only; a refusal adds one sentence, the hint of every box', async () => {
    await render(<DateField label="Date of birth" value={['31', '02', '1998']} onChange={jest.fn()} invalid testID="d" />)
    for (const i of [0, 1, 2]) expect(flat(`d-${i}-border`).borderColor).toBe(COLOR.destructive)
    expect(box('day').props.accessibilityHint).toBeUndefined()

    await render(
      <DateField label="Date of birth" value={['14', '03', '2012']} onChange={jest.fn()} error="Blend’n is for people 18 and over." testID="d" />
    )
    expect(flat('d-2-border').borderColor).toBe(COLOR.destructive)
    expect(screen.getByText('Blend’n is for people 18 and over.')).toBeTruthy()
    expect(box('year').props.accessibilityHint).toBe('Blend’n is for people 18 and over.')
  })

  it('disabled: 45%, not editable', async () => {
    await render(<DateField label="Date of birth" value={['14', '03', '1998']} onChange={jest.fn()} disabled testID="d" />)
    expect(flat('d').opacity).toBe(OPACITY.disabled)
    expect(box('day').props.editable).toBe(false)
  })

  it('plays nothing while typing', async () => {
    const spies = (['error', 'select'] as const).map((k) => jest.spyOn(H, k).mockImplementation(() => {}))
    await render(<Controlled />)
    await fireEvent.changeText(box('day'), '14')
    for (const s of spies) expect(s).not.toHaveBeenCalled()
  })
})
