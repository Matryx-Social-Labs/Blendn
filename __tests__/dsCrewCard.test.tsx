/*
 * <CrewCard> and <CrewRow> (guidelines/components/CrewCard.html, Flow 10): the
 * crew as strangers see it. Counts, never people: the emblem, the name, the
 * ticks, the tags, one line of overlap, and Like (as you, or as your crew).
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { CrewCard, CrewRow } from '../components/ds/CrewCard'
import { COLOR, RADIUS } from '../lib/design/tokens'
import { H } from '../lib/haptics'

jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const NEBULA = {
  name: 'Nebula',
  emblemSeed: 'nebula',
  size: 4,
  here: 2,
  bio: 'Late sets, early trains. Dance floor first, questions later.',
  tags: ['Dance floor', 'Techno heads'],
  intent: 'Friendship',
}

let like: jest.SpyInstance
let primary: jest.SpyInstance
beforeEach(() => {
  like = jest.spyOn(H, 'like').mockImplementation(() => {})
  primary = jest.spyOn(H, 'primary').mockImplementation(() => {})
})

describe('<CrewCard>', () => {
  it('reads as one element, counts never people, then Like', async () => {
    await render(<CrewCard crew={NEBULA} like={{ onPress: jest.fn() }} onPress={jest.fn()} testID="k" />)
    expect(screen.getByLabelText('Nebula, crew of 4, 2 here, Late sets, early trains. Dance floor first, questions later., Dance floor, Techno heads, Friendship')).toBeTruthy()
    expect(screen.getByText('Crew of 4 · 2 here now')).toBeTruthy()
    expect(screen.getByLabelText('2 of 4 here')).toBeTruthy()
  })

  it('Like plays H.like, never H.primary; “Like for Orbit” when liking as your crew', async () => {
    const onPress = jest.fn()
    await render(<CrewCard crew={NEBULA} like={{ as: 'Orbit', onPress }} testID="k" />)
    await fireEvent(screen.getByRole('button', { name: 'Like for Orbit' }), 'pressIn')
    await fireEvent.press(screen.getByRole('button', { name: 'Like for Orbit' }))
    expect(like).toHaveBeenCalledTimes(1)
    expect(primary).not.toHaveBeenCalled()
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('liked: the check and “Liked” in the button’s place, not a button', async () => {
    await render(<CrewCard crew={NEBULA} like={{ liked: true, as: 'Orbit', onPress: jest.fn() }} testID="k" />)
    expect(screen.getByLabelText('Liked for Orbit')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Liked/ })).toBeNull()
  })

  it('your own crew: no Like', async () => {
    await render(<CrewCard crew={NEBULA} testID="k" />)
    expect(screen.queryByRole('button', { name: /Like/ })).toBeNull()
  })

  it('with overlap: one line', async () => {
    await render(<CrewCard crew={NEBULA} overlap="Both crews: Techno heads · out for friendship" like={{ onPress: jest.fn() }} />)
    expect(screen.getByText('Both crews: Techno heads · out for friendship')).toBeTruthy()
  })

  it('no one here: no count of who is here', async () => {
    await render(<CrewCard crew={{ ...NEBULA, here: 0 }} testID="k" />)
    expect(screen.getByText('Crew of 4')).toBeTruthy()
  })

  it('full is radius 32; compact (the row form in a list) is 24', async () => {
    await render(<CrewCard crew={NEBULA} testID="k" />)
    expect(flat('k')).toMatchObject({ borderRadius: RADIUS.card, backgroundColor: COLOR.surface })
    await render(<CrewCard crew={NEBULA} compact testID="k" />)
    expect(flat('k').borderRadius).toBe(RADIUS.sheet)
  })

  it('⋯ is its own button', async () => {
    const onMore = jest.fn()
    await render(<CrewCard crew={NEBULA} onMore={onMore} />)
    await fireEvent.press(screen.getByRole('button', { name: 'More, Nebula' }))
    expect(onMore).toHaveBeenCalledTimes(1)
  })
})

describe('<CrewRow> with its badge', () => {
  it('reads the badge with the row, in the chevron’s place', async () => {
    await render(<CrewRow name="Nebula" emblemSeed="nebula" size={4} sub="4 people · Techno heads" badge="nights_together" onPress={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Nebula, 4 people · Techno heads, Badge: Out together often' })).toBeTruthy()
  })
})

describe('<CrewRow>', () => {
  it('40 pt emblem, the name, “Crew of N”, a chevron; a button', async () => {
    const onPress = jest.fn()
    await render(<CrewRow name="The Usual Suspects" emblemSeed="usual" size={6} onPress={onPress} testID="r" />)
    await fireEvent.press(screen.getByRole('button', { name: 'The Usual Suspects, Crew of 6' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
