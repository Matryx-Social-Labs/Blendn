/*
 * <RevealSheet> and <RevealSide> (guidelines/components/RevealSheet.html, Flow
 * 10 · 10.9): the only confirmed action in crews. The sheet names the outcome
 * ("Reveal Nebula"), never destructive, and says exactly who sees what. After
 * the server answers, the discs cross-fade to photos and the line reads
 * "3 revealed · 1 keeps it private".
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native'
import React from 'react'
import { act } from '@testing-library/react-native'
import { Dimensions, StyleSheet } from 'react-native'

import { RevealSheet, RevealSide } from '../components/ds/RevealSheet'
import { H } from '../lib/haptics'
import { MAX_FONT_SCALE } from '../lib/design/tokens'
import { AX_XXXL, uncapped } from './helpers/ax'

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

describe('<RevealSide> headers (audit D3)', () => {
  const orbit = { kind: 'crew' as const, name: 'Midnight Vinyl Collective Bengaluru', emblemSeed: 'orbit' }

  it('the name and the status are two Texts of their own: a long name wraps on its own and never pushes the status out', async () => {
    const window = Dimensions.get('window')
    await act(async () => Dimensions.set({ window: { ...window, fontScale: 1 }, screen: { ...window, fontScale: 1 } }))
    await render(<RevealSide side={orbit} people={PEOPLE.slice(0, 2)} testID="r" />)
    Dimensions.set({ window, screen: window })
    const name = screen.getByText(orbit.name)
    const status = screen.getByText('2 on tonight’s names')
    // The name may take two lines (C28: a crew name cut to a few letters at AX); the status keeps its own line.
    expect(name.props.numberOfLines).toBe(2)
    expect(status.props.numberOfLines).toBe(1)
    expect(name).not.toBe(status)
    // Neither is nested in the other.
    expect(status.parent?.props.numberOfLines).not.toBe(1)
    expect(screen.getByLabelText(`${orbit.name}, 2 on tonight’s names`)).toBeTruthy()
  })

  it('count={2} with one person draws two tiles, the second a neutral "+1"', async () => {
    await render(<RevealSide side={orbit} people={PEOPLE.slice(0, 1)} count={2} testID="r" />)
    expect(screen.getAllByTestId(/^r-tile-/, { includeHiddenElements: true })).toHaveLength(1)
    expect(screen.getByTestId('r-more', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByText('+1', { includeHiddenElements: true })).toBeTruthy()
  })

  it('no "+n" once someone has revealed (the kept count has its own tile), or when the people are all there', async () => {
    const one = [{ ...PEOPLE[0], photo: 'https://example.com/0.jpg' }, PEOPLE[1]]
    await render(<RevealSide side={orbit} people={one} count={5} testID="r" />)
    expect(screen.queryByTestId('r-more', { includeHiddenElements: true })).toBeNull()
    await screen.unmount()
    await render(<RevealSide side={orbit} people={PEOPLE.slice(0, 2)} count={2} testID="r" />)
    expect(screen.queryByTestId('r-more', { includeHiddenElements: true })).toBeNull()
  })

  it('the Reveal button is in the tiles row, at the far edge', async () => {
    await render(<RevealSide side={orbit} people={PEOPLE.slice(0, 2)} mine onReveal={jest.fn()} testID="r" />)
    const button = screen.getByRole('button', { name: 'Reveal my crew' })
    let node: typeof button | null = button
    let slot: typeof button | null = null
    while (node && !slot) {
      if (StyleSheet.flatten(node.props.style)?.marginLeft === 'auto') slot = node
      node = node.parent
    }
    expect(slot).not.toBeNull()
    // Its parent row holds the tiles too.
    expect(within(slot!.parent!).getAllByTestId(/^r-tile-/, { includeHiddenElements: true })).toHaveLength(2)
  })
})

describe('<RevealSide> at scale (Together hand-off 1: the strip was half the screen at AX; "+1" wrapped under the faces)', () => {
  const orbit = { kind: 'crew' as const, name: 'Midnight Vinyl Collective Bengaluru', emblemSeed: 'orbit' }
  const hidden = { includeHiddenElements: true }
  const many = Array.from({ length: 7 }, (_, i) => ({ pseudonym: `Person ${i}`, photo: null }))

  it('at AX XXXL every line stops at its role’s cap; the name and the status take two lines', async () => {
    const window = Dimensions.get('window')
    try {
      await act(async () => Dimensions.set({ window: { ...window, fontScale: AX_XXXL }, screen: { ...window, fontScale: AX_XXXL } }))
      await render(<RevealSide side={orbit} people={PEOPLE} mine onReveal={jest.fn()} testID="r" />)
      expect(screen.getByText(orbit.name).props).toMatchObject({ maxFontSizeMultiplier: MAX_FONT_SCALE.meta, numberOfLines: 2 })
      expect(screen.getByText('4 on tonight’s names').props).toMatchObject({ maxFontSizeMultiplier: MAX_FONT_SCALE.meta, numberOfLines: 2 })
      expect(uncapped(screen.toJSON())).toEqual([])
    } finally {
      Dimensions.set({ window, screen: window })
    }
  })

  it('the faces never wrap: past four, the rest fold into the "+N" tile in the same row', async () => {
    await render(<RevealSide side={orbit} people={many} testID="r" />)
    expect(screen.getAllByTestId(/^r-tile-/, hidden)).toHaveLength(4)
    expect(screen.getByText('+3', hidden)).toBeTruthy()
    const row = screen.getByTestId('r-tile-0', hidden).parent!
    expect(StyleSheet.flatten(row.props.style).flexWrap ?? 'nowrap').toBe('nowrap')
    expect(row).toContainElement(screen.getByTestId('r-more', hidden))
  })

  it('after a reveal the extra revealed faces fold in with the kept ones: one "+N"', async () => {
    const after = many.map((p, i) => ({ ...p, photo: i < 6 ? `https://example.com/${i}.jpg` : null }))
    await render(<RevealSide side={orbit} people={after} testID="r" />)
    expect(screen.getAllByTestId(/^r-tile-/, hidden)).toHaveLength(4)
    expect(screen.getByText('+3', hidden)).toBeTruthy()
  })
})
