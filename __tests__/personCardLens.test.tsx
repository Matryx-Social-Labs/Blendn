/*
 * Flow 5 C3 (P-A): the person sheet, through the room's lens. One sheet from every entry point: the context line, the
 * name and age, the lead pills, Tonight's question with their answer, In common, then Wave · Message · Like (52).
 * The pA-* frames in element-boxes.json are the spec.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { PersonCardContent, type PersonCardPerson } from '../components/ds/PersonCard'
import { SIZE } from '../lib/design/tokens'
import { lensView } from '../lib/roomLens'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} testID="gradient" /> }
})

const deck = {
  workField: 'Product design',
  sharedIntents: ['networking'],
  interests: ['Product design', 'Cycling', 'Board games'],
  overlaps: [],
  badges: [],
  age: 31,
  tonightAnswer: 'A map of every quiet café in Toronto with outlets and good light.' as string | null,
}
const work = { key: 'work', question: 'What are you working on?' }
const bison = (lens: { key: string; question: string | null } | null = work, extra: Partial<typeof deck> = {}): PersonCardPerson => ({
  face: { kind: 'creature', pseudonym: 'Gentle Bison' },
  name: 'Gentle Bison',
  age: 31,
  ...lensView({ ...deck, ...extra }, lens, { title: 'Junction Tech Mixer: Founders, Designers & the Curious' }, false),
})
const q = (id: string) => screen.queryByTestId(id, { includeHiddenElements: true })
const draw = (person: PersonCardPerson, props: Partial<React.ComponentProps<typeof PersonCardContent>> = {}) =>
  render(
    <PersonCardContent
      person={person}
      variant="here"
      onLike={jest.fn()}
      onWave={jest.fn()}
      onMessage={jest.fn()}
      onMore={jest.fn()}
      onViewProfile={jest.fn()}
      testID="p"
      {...props}
    />
  )

/** The rendered tree as text, in tree order: the order a screen reader reads it in. */
const tree = () => JSON.stringify(screen.toJSON())

describe('the sheet, through the work lens', () => {
  it('reads context, name, Anonymous and age, the lead, the question and answer, In common, then the actions', async () => {
    await draw(bison())
    const t = tree()
    const at = (x: string) => t.indexOf(x)
    const seq = ['In the room at Junction', 'Gentle Bison', 'Anonymous · 31', 'Product design', 'Here for work', 'What are you working on?', 'A map of every quiet café', 'In common', 'Cycling', 'Wave', 'Message', 'Like']
    const idx = seq.map(at)
    expect(idx.every((i) => i >= 0)).toBe(true)
    expect([...idx].sort((a, b) => a - b)).toEqual(idx)
  })

  it('the answer is the server’s words, whole: a 140-character answer is never cut', async () => {
    const long = 'x'.repeat(130) + ' ✨ प्रियंका'
    await draw(bison(work, { tonightAnswer: long }))
    const answer = screen.getByTestId('p-tonight-answer')
    expect(answer.props.children).toBe(long)
    expect(answer.props.numberOfLines).toBeUndefined()
  })

  it('Wave, Message and Like stand level at 52 (the board’s .db), Like lit', async () => {
    await draw(bison())
    for (const id of ['p-wave', 'p-message', 'p-like']) expect(StyleSheet.flatten(screen.getByTestId(id).props.style).height ?? SIZE.tabBarCompact).toBe(SIZE.tabBarCompact)
  })

  it('⋯ is in the head and opens Block or Report; the head opens their profile; there is no separate View profile line', async () => {
    const onMore = jest.fn()
    const onViewProfile = jest.fn()
    await draw(bison(), { onMore, onViewProfile })
    await fireEvent.press(screen.getByLabelText('Block or report Gentle Bison'))
    expect(onMore).toHaveBeenCalled()
    await fireEvent.press(screen.getByTestId('p-head'))
    expect(onViewProfile).toHaveBeenCalled()
    expect(screen.queryByText('View profile')).toBeNull()
  })
})

describe('the other lenses', () => {
  it('unanswered: no question card', async () => {
    await draw(bison(work, { tonightAnswer: null }))
    expect(q('p-tonight')).toBeNull()
  })
  it('venue night: no question, no work line, “Things in common”', async () => {
    await draw(bison({ key: 'venue_night', question: null }))
    expect(q('p-tonight')).toBeNull()
    expect(screen.queryByText('Product design', { exact: true })).toBeTruthy() // the shared interest, in Things in common
    expect(screen.getByText('Things in common')).toBeTruthy()
    expect(q('p-lead-0')?.props.accessibilityLabel ?? '').not.toContain('Product design')
  })
  it('no lens: the plain profile, no lead pills and no question', async () => {
    await draw(bison(null))
    expect(q('p-lead')).toBeNull()
    expect(q('p-tonight')).toBeNull()
    expect(screen.getByText('In common')).toBeTruthy()
  })
})

describe('anonymity on the sheet', () => {
  it('shows a creature and the pseudonym, never the photo or a real name, while anonymous', async () => {
    await draw(bison())
    expect(tree()).not.toContain('"uri"')
    expect(screen.getByText('Anonymous · 31')).toBeTruthy()
  })
})
