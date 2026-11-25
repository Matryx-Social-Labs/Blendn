/*
 * A named person with no photo (owner F1 B, D1 A 2026-11-14): their initial, in the hue's glyph tone, on the same glowing
 * disc their creature would sit on, never a creature. Avatar and Facepile draw it; it never scales with text.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { Avatar } from '../components/ds/Avatar'
import { creatureFor } from '../components/ds/Creature'
import { Facepile } from '../components/ds/Facepile'
import { CREATURE_HUES } from '../lib/design/tokens'

const letter = (text: string) => screen.getByText(text, { includeHiddenElements: true })

describe('the initial on its hue disc', () => {
  it.each([24, 36, 40, 52] as const)('at %i pt: the letter in the glyph tone of the name’s hue, fixed size, no creature drawn', async (size) => {
    await render(<Avatar kind="initial" name="Audit Host 09" size={size} testID="a" />)
    const hue = CREATURE_HUES[creatureFor('Audit Host 09').hue]
    const style = StyleSheet.flatten(letter('A').props.style)
    expect(style.color).toBe(hue.glyph)
    expect(style.fontSize).toBe(Math.round(size * 0.44))
    expect(letter('A').props.allowFontScaling).toBe(false)
    // The disc is the creature's own (fill under its edge glow), at the avatar's size.
    expect(StyleSheet.flatten(screen.getByTestId('a', { includeHiddenElements: true }).props.style)).toMatchObject({ width: size, height: size })
    expect(screen.getByTestId('a-disc', { includeHiddenElements: true })).toBeTruthy()
  })

  it('is decorative beside a name, and reads the name when it stands alone', async () => {
    await render(<Avatar kind="initial" name="Kavya Raman" size={40} testID="a" />)
    expect(screen.queryByLabelText('Kavya Raman')).toBeNull()
    await render(<Avatar kind="initial" name="Kavya Raman" size={40} label="Kavya Raman" />)
    expect(screen.getByLabelText('Kavya Raman')).toBeTruthy()
  })

  it('a facepile mixes photos, initials and creatures, each drawn as its kind', async () => {
    await render(
      <Facepile
        faces={[{ kind: 'photo', uri: 'https://x/a.jpg', name: 'Asha' }, { kind: 'initial', name: 'Kavya Raman' }, { kind: 'creature', pseudonym: 'Rustic Lark' }]}
        size={24}
        testID="p"
      />
    )
    expect(letter('K')).toBeTruthy()
    expect(screen.queryByText('R', { includeHiddenElements: true })).toBeNull()
  })
})
