/*
 * <Avatar> (guidelines/components/Avatar.html): photo, creature and initial (a crew is its CrewEmblem)
 * from 24 to 112, the cut-out ring, Increase Contrast's white ring, and the
 * name read rather than the picture.
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, StyleSheet } from 'react-native'

import { Avatar } from '../components/ds/Avatar'
import { Creature, creatureFor } from '../components/ds/Creature'
import { COLOR, MATERIAL, RADIUS } from '../lib/design/tokens'

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)

describe('<Avatar>', () => {
  it.each([24, 32, 40, 56, 72, 112] as const)('a creature at %i pt is the pseudonym’s <Creature> at that size', async (size) => {
    // Each face names its own glow and clip, so the two renders differ only in those ids.
    const drawn = (json: unknown) => JSON.stringify(json).replace(/cr[A-Za-z0-9]+(?=[gck]")/g, 'id')
    await render(<Creature {...creatureFor('Night Cat')} size={size} />)
    const disc = drawn(screen.toJSON())
    await render(<Avatar kind="creature" pseudonym="Night Cat" size={size} testID="a" />)
    expect(flat('a')).toMatchObject({ width: size, height: size })
    expect(drawn((screen.toJSON() as { children: unknown[] }).children)).toBe(`[${disc}]`)
  })

  it('a photo is a circle', async () => {
    await render(<Avatar kind="photo" uri="https://x/y.jpg" size={40} testID="a" />)
    expect(flat('a-body')).toMatchObject({ width: 40, borderRadius: RADIUS.capsule })
  })

  it('is decorative beside a name; alone, it reads the name, never “image”', async () => {
    await render(<Avatar kind="creature" pseudonym="Night Cat" size={32} testID="a" />)
    expect(screen.queryByTestId('a')).toBeNull()

    await render(<Avatar kind="creature" pseudonym="Night Cat" size={32} label="Night Cat" testID="a" />)
    expect(screen.getByLabelText('Night Cat').props.accessibilityRole).toBeUndefined()

  })

  it('draws a 2 pt cut-out ring in the colour behind it', async () => {
    await render(<Avatar kind="photo" uri="https://x/y.jpg" size={32} ring={COLOR.ink} testID="a" />)
    expect(flat('a-ring')).toMatchObject({ backgroundColor: COLOR.ink, top: -2, borderRadius: RADIUS.capsule })
  })

  it('Increase Contrast rings it in 50% white so a dark plate leaves a dark card', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await render(<Avatar kind="creature" pseudonym="Night Cat" size={56} testID="a" />)
    await act(async () => {})
    expect(flat('creature-ring').borderColor).toBe(MATERIAL.hairlineIncreaseContrast)
    await render(<Avatar kind="photo" uri="https://x/y.jpg" size={56} testID="a" />)
    await act(async () => {})
    expect(flat('a-ring').backgroundColor).toBe(MATERIAL.hairlineIncreaseContrast)
  })
})

describe('<Avatar halo>', () => {
  // An earlier test turns Increase Contrast on (its ring is then white at 50%); these draw the ordinary cut-out.
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(false)
  })

  it('a photo takes a second 2 pt ring in the halo colour, outside the 2 pt cut-out', async () => {
    await render(<Avatar kind="photo" uri="https://x/y.jpg" size={40} ring={COLOR.surface} halo={COLOR.brandRose} testID="a" />)
    expect(flat('a-ring')).toMatchObject({ top: -2, backgroundColor: COLOR.surface })
    expect(flat('a-halo')).toMatchObject({ top: -4, left: -4, borderWidth: 2, borderColor: COLOR.brandRose, borderRadius: RADIUS.capsule })
  })

  it('with no cut-out it hugs the face', async () => {
    await render(<Avatar kind="photo" uri="https://x/y.jpg" size={40} halo={COLOR.brandRose} testID="a" />)
    expect(flat('a-halo')).toMatchObject({ top: -2, borderColor: COLOR.brandRose })
  })

  it('a creature takes it too', async () => {
    await render(<Avatar kind="creature" pseudonym="Night Cat" size={40} ring={COLOR.ink} halo={COLOR.brandRose} testID="a" />)
    expect(flat('a-halo')).toMatchObject({ top: -4, borderColor: COLOR.brandRose })
  })

  it('no halo, no ring: nothing is drawn', async () => {
    await render(<Avatar kind="photo" uri="https://x/y.jpg" size={40} testID="a" />)
    expect(screen.queryByTestId('a-halo', { includeHiddenElements: true })).toBeNull()
  })
})
