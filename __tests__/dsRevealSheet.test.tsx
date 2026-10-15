/*
 * <RevealSheet> and <RevealSide> (guidelines/components/RevealSheet.html, Flow
 * 10 · 10.9): the only confirmed action in crews. The sheet names the outcome
 * ("Reveal Nebula"), never destructive, and says exactly who sees what. After
 * the server answers, the discs cross-fade to photos and the line reads
 * "3 revealed · 1 keeps it private".
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'

import { RevealSheet, RevealSide } from '../components/ds/RevealSheet'
import { H } from '../lib/haptics'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false) }
})
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} />, isGlassEffectAPIAvailable: jest.fn(() => true), isLiquidGlassAvailable: jest.fn(() => true) }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

let spies: jest.SpyInstance[]
beforeEach(() => {
  spies = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
})

describe('<RevealSheet>', () => {
  it('names the outcome and who will see what', async () => {
    await render(<RevealSheet visible onClose={jest.fn()} crew="Nebula" audience={7} onReveal={jest.fn()} />)
    expect(screen.getByRole('header', { name: 'Reveal Nebula to this Blend?' })).toBeTruthy()
    expect(screen.getByText(/shown by first name and one photo to the 7 people in this Blend — and nobody else/)).toBeTruthy()
    expect(screen.getByText('You can’t undo a reveal.')).toBeTruthy()
  })

  it('the primary names the outcome; Not now closes; nothing plays on the sheet', async () => {
    const onReveal = jest.fn()
    const onClose = jest.fn()
    await render(<RevealSheet visible onClose={onClose} crew="Nebula" audience={7} onReveal={onReveal} />)
    const reveal = screen.getByRole('button', { name: 'Reveal Nebula' })
    await fireEvent(reveal, 'pressIn')
    await fireEvent.press(reveal)
    expect(onReveal).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }))
    expect(onClose).toHaveBeenCalled()
    for (const s of spies) expect(s).not.toHaveBeenCalled()
  })

  it('solo: the “yourself” form', async () => {
    await render(<RevealSheet visible onClose={jest.fn()} crew={null} audience={4} onReveal={jest.fn()} />)
    expect(screen.getByRole('header', { name: 'Reveal yourself to this Blend?' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reveal me' })).toBeTruthy()
  })
})

const PEOPLE = [
  { pseudonym: 'Cosmic Panda', photo: null },
  { pseudonym: 'Brave Turtle', photo: null },
  { pseudonym: 'Night Fox', photo: null },
  { pseudonym: 'Early Owl', photo: null },
]

describe('<RevealSide>', () => {
  it('before: one disc per person, “4 on tonight’s names”, and Reveal my crew on your side', async () => {
    const onReveal = jest.fn()
    await render(<RevealSide side={{ kind: 'crew', name: 'Nebula', emblemSeed: 'nebula' }} people={PEOPLE} mine onReveal={onReveal} testID="r" />)
    expect(screen.getByText('4 on tonight’s names')).toBeTruthy()
    expect(screen.getAllByTestId(/^r-tile-/, { includeHiddenElements: true })).toHaveLength(4)
    await fireEvent.press(screen.getByRole('button', { name: 'Reveal my crew' }))
    expect(onReveal).toHaveBeenCalledTimes(1)
  })

  it('after: photos first, then one neutral +N; “3 revealed · 1 keeps it private”', async () => {
    const after = PEOPLE.map((p, i) => ({ ...p, photo: i === 1 ? null : `https://example.com/${i}.jpg` }))
    await render(<RevealSide side={{ kind: 'crew', name: 'Nebula', emblemSeed: 'nebula' }} people={after} mine testID="r" />)
    expect(screen.getByText('3 revealed · 1 keeps it private')).toBeTruthy()
    expect(screen.getAllByTestId(/^r-tile-/, { includeHiddenElements: true })).toHaveLength(3)
    expect(screen.getByText('+1', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByText('Revealed')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Reveal my crew' })).toBeNull()
  })

  it('their side has no reveal button', async () => {
    await render(<RevealSide side={{ kind: 'crew', name: 'Orbit', emblemSeed: 'orbit' }} people={PEOPLE.slice(0, 3)} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('3 on tonight’s names')).toBeTruthy()
  })
})
