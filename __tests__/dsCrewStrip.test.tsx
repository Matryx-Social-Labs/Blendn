/*
 * <CrewStrip> (crews 4-A3, owner-approved 2026-11-12, board 04-checkin A3): after your own check-in, each of your crews
 * here as "Nebula · 3 of 5 in", its ticks, and who is in by first name ("Priya, Arjun, You"). Only who is in is named;
 * nobody is listed as not here yet. There is no action: "Tell your crew — We're here" is retired (the hold's
 * "With {crew}" is the act). A count rising plays nothing. Off is one quiet line.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { CrewStrip, type StripCrew } from '../components/ds/CrewStrip'
import { FONT_FAMILY } from '../lib/design/tokens'
import { H } from '../lib/haptics'

jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

const person = (name: string, you = false, photo: string | null = null) => ({ userId: `h-${name}`, name, photo, you })

const nebula = (o: Partial<StripCrew> = {}): StripCrew => ({
  id: 'n',
  name: 'Nebula',
  emblemSeed: 'nebula',
  size: 5,
  in: 3,
  people: [person('Priya'), person('Arjun'), person('Sagar', true)],
  context: 'Vinyl Night · Toit',
  ...o,
})

describe('<CrewStrip>', () => {
  it('names the crew, "3 of 5 in" and who is in, you last as "You"', async () => {
    await render(<CrewStrip crews={[nebula({ people: [person('Sagar', true), person('Priya'), person('Arjun')] })]} />)
    expect(screen.getByText('Priya, Arjun, You')).toBeTruthy()
    expect(screen.getByLabelText('Nebula, 3 of 5 in, Vinyl Night · Toit. In: Priya, Arjun, You')).toBeTruthy()
  })

  it('never names the crew with a "Crew" prefix glued on, and the figures are mono (rc7 D12)', async () => {
    await render(<CrewStrip crews={[nebula()]} />)
    expect(screen.queryByText(/^Crew Nebula/)).toBeNull()
    expect(StyleSheet.flatten(screen.getByText('3 of 5').props.style).fontFamily).toBe(FONT_FAMILY.mono[500])
  })

  it('everyone in: the word in the body face, never mono', async () => {
    await render(<CrewStrip crews={[nebula({ in: 5 })]} />)
    const word = screen.getByText('Everyone')
    expect(StyleSheet.flatten(word.props.style).fontFamily).not.toBe(FONT_FAMILY.mono[500])
  })

  it('no names (an older server sends a count only): the count, and no names line', async () => {
    await render(<CrewStrip crews={[nebula({ in: 2, people: [] })]} testID="s" />)
    expect(screen.getByText('2 of 5')).toBeTruthy()
    expect(screen.queryByTestId('s-n-who')).toBeNull()
  })

  it('has no "We’re here" button any more, and no button at all', async () => {
    await render(<CrewStrip crews={[nebula()]} />)
    expect(screen.queryByText(/We’re here/)).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('a name line that runs long is one line, ending in an ellipsis', async () => {
    const many = ['Thiruvananthapuram', 'प्रियंका', 'Zoë', 'Priya', 'Arjun', 'Meera', 'Kabir', 'Ravi', 'Isha'].map((n) => person(n))
    await render(<CrewStrip crews={[nebula({ size: 12, in: 9, people: many })]} testID="s" />)
    expect(screen.getByTestId('s-n-names').props.numberOfLines).toBe(1)
  })

  it('your crew check-in moment plays the huddle’s cheer once per crew per event; a row without you rests', async () => {
    await render(<CrewStrip crews={[nebula({ cheerKey: 'e1|n', people: [person('Priya')] })]} />)
    expect(screen.queryByTestId('crew-emblem-scene', { includeHiddenElements: true })).toBeNull()
    await render(<CrewStrip crews={[nebula({ cheerKey: 'e2|n' })]} />)
    expect(screen.getByTestId('crew-emblem-scene', { includeHiddenElements: true })).toBeTruthy()
    // Drawn again (the pass, then the Room): it has played.
    await render(<CrewStrip crews={[nebula({ cheerKey: 'e2|n' })]} />)
    expect(screen.queryByTestId('crew-emblem-scene', { includeHiddenElements: true })).toBeNull()
  })

  it('a count rising plays nothing', async () => {
    const spies = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
    const { rerender } = await render(<CrewStrip crews={[nebula()]} />)
    await rerender(<CrewStrip crews={[nebula({ in: 4, people: [...nebula().people, person('Kabir')] })]} />)
    for (const s of spies) expect(s).not.toHaveBeenCalled()
  })

  it('two crews stack', async () => {
    await render(<CrewStrip crews={[nebula(), nebula({ id: 'q', name: 'Quiz Night Irregulars', size: 4, in: 2, people: [person('Zoë'), person('Sagar', true)] })]} />)
    expect(screen.getByText('Priya, Arjun, You')).toBeTruthy()
    expect(screen.getByText('Zoë, You')).toBeTruthy()
  })

  it('off: one quiet line and no action', async () => {
    await render(<CrewStrip crews={[nebula()]} off />)
    expect(screen.getByText('Crews are off at this event.')).toBeTruthy()
    expect(screen.queryByText(/The strip hides/)).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
