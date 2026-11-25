/*
 * <CrewCard> and <CrewRow> (guidelines/components/CrewCard.html, Flow 10): the
 * crew as strangers see it. Counts, never people: the emblem, the name, the
 * ticks, the tags, one line of overlap, and Wave (as you, or as your crew).
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { CrewCard, CrewRow } from '../components/ds/CrewCard'
import { COLOR, MAX_FONT_SCALE, RADIUS } from '../lib/design/tokens'
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
  tags: ['Dancefloor', 'Technoheads'],
  intent: 'Friendship',
}

let like: jest.SpyInstance
let primary: jest.SpyInstance
beforeEach(() => {
  like = jest.spyOn(H, 'like').mockImplementation(() => {})
  primary = jest.spyOn(H, 'primary').mockImplementation(() => {})
})

describe('<CrewCard>', () => {
  it('reads as one element, counts never people, then Wave', async () => {
    await render(<CrewCard crew={NEBULA} wave={{ state: 'idle', onPress: jest.fn() }} onPress={jest.fn()} testID="k" />)
    expect(screen.getByLabelText('Nebula, crew of 4, 2 here, Late sets, early trains. Dance floor first, questions later., #Dancefloor, #Technoheads, Friendship')).toBeTruthy()
    expect(screen.getByText('Crew of 4 · 2 here now · #Dancefloor · #Technoheads')).toBeTruthy()
    expect(screen.getByLabelText('2 of 4 here')).toBeTruthy()
  })

  it('the hashtags ride the count’s line: one line, cut at the end, never a wrap of chips (board crews/tags/01 · Crew card)', async () => {
    const five = ['sundayrunclub', 'कैफ़ेहॉपिंग', 'chai🍵', 'averyveryverylongtag24ch', 'dosaafter']
    await render(<CrewCard crew={{ ...NEBULA, size: 25, here: 0, tags: five }} testID="k" />)
    const line = screen.getByText('Crew of 25 · #sundayrunclub · #कैफ़ेहॉपिंग · #chai🍵 · #averyveryverylongtag24ch · #dosaafter')
    expect(line.props).toMatchObject({ numberOfLines: 1, ellipsizeMode: 'tail' })
    // Control: no tag is drawn a second time as a chip.
    expect(screen.queryAllByText('#sundayrunclub')).toHaveLength(0)
  })

  it('Wave plays H.select (the person Wave’s), never H.like or H.primary; “Wave for Orbit” when waving as your crew', async () => {
    const select = jest.spyOn(H, 'select').mockImplementation(() => {})
    const onPress = jest.fn()
    await render(<CrewCard crew={NEBULA} wave={{ state: 'idle', as: 'Orbit', onPress }} testID="k" />)
    await fireEvent(screen.getByRole('button', { name: 'Wave for Orbit' }), 'pressIn')
    await fireEvent.press(screen.getByRole('button', { name: 'Wave for Orbit' }))
    expect(select).toHaveBeenCalledTimes(1)
    expect(like).not.toHaveBeenCalled()
    expect(primary).not.toHaveBeenCalled()
    expect(onPress).toHaveBeenCalledTimes(1)
    // Control: the Like words are gone (crews wave, board 05-room A).
    expect(screen.queryByText(/Like/)).toBeNull()
  })

  it('waved: “Waved” with its check in the button’s place, not a button', async () => {
    await render(<CrewCard crew={NEBULA} wave={{ state: 'waved', as: 'Orbit', onPress: jest.fn() }} testID="k" />)
    expect(screen.getByLabelText('Waved')).toBeTruthy()
    // Board crews/05-room A: the rose rim, the check and the word in the rose's light tone; never the card's own fill on the card.
    const plate = StyleSheet.flatten(screen.getByTestId('crew-waved').props.style)
    expect(plate).toMatchObject({ borderWidth: 1, borderColor: COLOR.brandRose })
    expect(plate.backgroundColor).toBeUndefined()
    expect(StyleSheet.flatten(screen.getByText('Waved').props.style).color).toBe(COLOR.selectionRoseGlyph)
    expect(screen.queryByRole('button', { name: /Wave/ })).toBeNull()
  })

  it('waved at yours: the card is lit, says so, and offers Wave back (advisor Q4)', async () => {
    const onPress = jest.fn()
    await render(<CrewCard crew={NEBULA} wave={{ state: 'waveBack', as: 'Orbit', onPress }} testID="k" />)
    expect(screen.getByText('Waved at Orbit')).toBeTruthy()
    expect(StyleSheet.flatten(screen.getByTestId('k').props.style)).toMatchObject({ backgroundColor: COLOR.selectionRoseFill, borderColor: COLOR.brandRose })
    await fireEvent.press(screen.getByRole('button', { name: 'Wave back' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('waved at you (no crew of yours): “Waved at you”', async () => {
    await render(<CrewCard crew={NEBULA} wave={{ state: 'waveBack', as: null, onPress: jest.fn() }} testID="k" />)
    expect(screen.getByText('Waved at you')).toBeTruthy()
  })

  it('a 32-character crew name wraps in the Wave button rather than cutting it', async () => {
    const long = 'Indiranagar Sunrise Run Club Cre'
    await render(<CrewCard crew={NEBULA} wave={{ state: 'idle', as: long, onPress: jest.fn() }} testID="k" />)
    expect(screen.getByRole('button', { name: `Wave for ${long}` })).toBeTruthy()
  })

  it('your own crew: no Wave', async () => {
    await render(<CrewCard crew={NEBULA} testID="k" />)
    expect(screen.queryByRole('button', { name: /Wave/ })).toBeNull()
  })

  it('with overlap: one line', async () => {
    await render(<CrewCard crew={NEBULA} overlap="Both crews: Techno heads · out for friendship" wave={{ state: 'idle', onPress: jest.fn() }} />)
    expect(screen.getByText('Both crews: Techno heads · out for friendship')).toBeTruthy()
  })

  it('no one here: no count of who is here', async () => {
    await render(<CrewCard crew={{ ...NEBULA, here: 0 }} testID="k" />)
    expect(screen.getByText('Crew of 4 · #Dancefloor · #Technoheads')).toBeTruthy()
  })

  it('full is radius 32; compact (the row form in a list) is 24', async () => {
    await render(<CrewCard crew={NEBULA} testID="k" />)
    expect(flat('k')).toMatchObject({ borderRadius: RADIUS.card, backgroundColor: COLOR.surface })
    await render(<CrewCard crew={NEBULA} compact testID="k" />)
    expect(flat('k').borderRadius).toBe(RADIUS.sheet)
  })

  it('no ⋯ any more: Hide tonight, Block and Report live in the crew’s sheet, opened by a tap on the card', async () => {
    const onPress = jest.fn()
    await render(<CrewCard crew={NEBULA} onPress={onPress} wave={{ state: 'idle', onPress: jest.fn() }} />)
    expect(screen.queryByLabelText('More, Nebula')).toBeNull()
    await fireEvent.press(screen.getByLabelText(/^Nebula, crew of 4/))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})

describe('<CrewCard> with its badge (YOU-06, E15)', () => {
  it('draws one pill, “Out together often”, and no digits in it', async () => {
    await render(<CrewCard crew={{ ...NEBULA, badge: 'nights_together' }} />)
    expect(screen.getAllByLabelText('Badge: Out together often')).toHaveLength(1)
    expect(screen.getByLabelText(/Nebula, crew of 4.*Badge: Out together often/)).toBeTruthy()
    expect(screen.getByText('Out together often').props.children).not.toMatch(/\d/)
  })

  it('crewBadge reads the server’s badges: the tier or nothing, however many nights', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { crewBadge } = require('../lib/crews')
    expect(crewBadge([{ kind: 'nights_together', label: 'Out together often' }])).toBe('nights_together')
    expect(crewBadge([])).toBeUndefined()
    expect(crewBadge(undefined)).toBeUndefined()
    expect(crewBadge([{ kind: 'shows_up', label: 'x' }])).toBeUndefined()
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

describe('long crew names (You hand-off 2)', () => {
  const NAME = 'The Midnight Vinyl Collective'

  it('a CrewRow’s name takes two lines at its role’s cap; the line under it stops at meta’s', async () => {
    await render(<CrewRow name={NAME} emblemSeed="nebula" size={4} onPress={jest.fn()} />)
    expect(screen.getByText(NAME).props).toMatchObject({ numberOfLines: 2, maxFontSizeMultiplier: MAX_FONT_SCALE.bodyStrong })
    expect(screen.getByText('Crew of 4').props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.meta)
  })

  it('a CrewCard’s name wraps at its role’s cap', async () => {
    await render(<CrewCard crew={{ id: 'c', name: NAME, emblemSeed: 'n', size: 4, tags: [], bio: null } as never} />)
    expect(screen.getByText(NAME).props.numberOfLines).toBeUndefined()
    expect(screen.getByText(NAME).props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.title)
  })
})

describe('crewWaveState (board crews/05-room A)', () => {
  const { crewWaveState } = jest.requireActual('../lib/crews') as typeof import('../lib/crews')
  it('waved or liked by your side → Waved; theirs unanswered → Wave back; else Wave', () => {
    expect(crewWaveState({ youLiked: false, wavedAtYou: false })).toBe('idle')
    expect(crewWaveState({ youLiked: false, wavedAtYou: true })).toBe('waveBack')
    expect(crewWaveState({ youLiked: true, wavedAtYou: true })).toBe('waved')
    expect(crewWaveState({ youLiked: false, youWaved: true })).toBe('waved')
    // An older server sends neither flag: a plain Wave.
    expect(crewWaveState({ youLiked: false })).toBe('idle')
  })
})
