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
  workIntent: 'hire' as string | null,
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
    const seq = ['In the room at Junction', 'Gentle Bison', 'Anonymous · 31', 'Product design', 'Here to hire', 'What are you working on?', 'A map of every quiet café', 'In common', 'Cycling', 'Wave', 'Message', 'Like']
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
  it('venue night with nothing in common: one quiet line, not an empty sheet (owner pick r2 A; the control is the venue test above)', async () => {
    await draw(bison({ key: 'venue_night', question: null }, { sharedIntents: [], interests: [], workField: '' }))
    expect(q('p-empty')).toBeTruthy()
    expect(screen.getByText('Nothing on your profiles in common yet.')).toBeTruthy()
    expect(screen.getByText('A wave is the lightest hello.')).toBeTruthy()
  })
  it('anything to show keeps the quiet line away', async () => {
    await draw(bison({ key: 'venue_night', question: null }))
    expect(q('p-empty')).toBeNull()
    await draw(bison(work, { sharedIntents: [], interests: [], workField: '', workIntent: null }))
    expect(q('p-tonight')).toBeTruthy()
    expect(q('p-empty')).toBeNull()
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

describe('state 1 A (SCRUM-1042): a venue night, anonymous, nothing in common', () => {
  const venue = { key: 'venue_night', question: null }
  const empty = { sharedIntents: [], interests: [], workField: '' }
  const at = Date.parse('2026-11-12T20:00:00Z')
  const owl = (extra: object = {}): PersonCardPerson => ({
    face: { kind: 'creature', pseudonym: 'Fierce Owl' },
    name: 'Fierce Owl',
    age: 31,
    ...lensView({ ...deck, ...empty, arrivedAt: new Date(at - 40 * 60_000).toISOString(), ...extra }, venue, { title: 'Live at Counter Kitchen', venueName: 'Counter Kitchen' }, false, at),
  })

  it('the time here joins the meta line, and the openers are chips over the actions', async () => {
    const onOpener = jest.fn()
    await draw(owl(), { onOpener })
    expect(screen.getByText('Anonymous · 31 · Here 40 min')).toBeTruthy()
    expect(screen.getByText('Nothing in common yet. Start with tonight:')).toBeTruthy()
    const t = tree()
    const seq = ['At Counter Kitchen', 'Fierce Owl', 'Anonymous · 31 · Here 40 min', 'First time here?', 'What’s good here?', 'Who are you here with?', 'Wave', 'Message']
    const idx = seq.map((x) => t.indexOf(x))
    expect(idx.every((i) => i >= 0)).toBe(true)
    expect([...idx].sort((a, b) => a - b)).toEqual(idx)
    // The openers stand in for the quiet line, never beside it.
    expect(q('p-empty')).toBeNull()
    await fireEvent.press(screen.getByTestId('p-opener-1'))
    expect(onOpener).toHaveBeenCalledWith('What’s good here?')
  })

  it('no openers where Message would not open the Connect sheet: requested, or nobody to hand them to (controls)', async () => {
    await draw(owl(), { onOpener: jest.fn(), requested: true })
    expect(q('p-openers')).toBeNull()
    expect(q('p-empty')).toBeTruthy()
    await draw(owl())
    expect(q('p-openers')).toBeNull()
    expect(q('p-empty')).toBeTruthy()
  })

  it('no openers once there is something in common, or on another lens (controls)', async () => {
    await draw(owl({ interests: ['Filter coffee'] }), { onOpener: jest.fn() })
    expect(q('p-openers')).toBeNull()
    await draw(bison(work, { ...empty, tonightAnswer: null, workIntent: null }), { onOpener: jest.fn() })
    expect(q('p-openers')).toBeNull()
  })

  it('a long pseudonym and a long place: the opener chips wrap to two lines rather than cut', async () => {
    await draw(owl(), { onOpener: jest.fn(), person: { ...owl(), name: 'Midnight Hummingbird', context: 'At The Courtyard at Jayamahal Palace Hotel, Bengaluru' } })
    expect(screen.getByText('Midnight Hummingbird')).toBeTruthy()
    expect(screen.getByTestId('p-context').props.numberOfLines).toBe(1)
  })
})

describe('state 2 on the sheet (SCRUM-1042, combined board): shown to you', () => {
  const work = { key: 'work', question: 'What are you working on?' }
  const divya = (shared: PersonCardPerson['shared'] = { latest: 'Riso Night at Champaca', more: 1 }): PersonCardPerson => ({
    face: { kind: 'creature', pseudonym: 'Gentle Bison' },
    name: 'Divya',
    age: 30,
    shared,
    interests: ['Bakeries', 'PBKS'],
    ...lensView({ ...deck, tonightAnswer: null, arrivedAt: new Date(Date.parse('2026-11-12T20:00:00Z') - 40 * 60_000).toISOString() }, work, { title: 'Junction Tech Mixer' }, true, Date.parse('2026-11-12T20:00:00Z')),
  })

  it('the time on the meta line, the question to ask, then one line for the events you have both been to', async () => {
    const onOpener = jest.fn()
    await draw(divya(), { onOpener })
    expect(screen.getByText('Shown to you · 31 · Here 40 min')).toBeTruthy()
    const t = tree()
    const seq = ['Divya', 'Shown to you · 31 · Here 40 min', 'Tonight’s question', 'What are you working on?', 'Ask in a message', 'Bakeries', 'PBKS', 'Riso Night at Champaca', '+1', 'p-wave']
    const idx = seq.map((x) => t.indexOf(x))
    expect(seq.filter((_, i) => idx[i] < 0)).toEqual([])
    expect([...idx].sort((a, b) => a - b)).toEqual(idx)
    // A question keeps its own mark: TalkBack read "working on?." on Android (SCRUM-1042 drive).
    expect(screen.getByTestId('p-ask').props.accessibilityLabel).toBe('Tonight’s question: What are you working on? Not answered yet.')
    await fireEvent.press(screen.getByTestId('p-ask'))
    expect(onOpener).toHaveBeenCalledWith('What are you working on?')
  })

  it('no event line when there are none; no "+0" for exactly one', async () => {
    await draw(divya(null), { onOpener: jest.fn() })
    expect(q('p-shared')).toBeNull()
    await draw(divya({ latest: 'Riso Night at Champaca', more: 0 }), { onOpener: jest.fn() })
    expect(q('p-shared')).toBeTruthy()
    expect(screen.queryByText('+0')).toBeNull()
  })

  it('anonymous: no question to ask, however it is unanswered (control)', async () => {
    await draw({ ...divya(), ...lensView({ ...deck, tonightAnswer: null }, work, { title: 'Junction Tech Mixer' }, false) }, { onOpener: jest.fn() })
    expect(q('p-ask')).toBeNull()
  })
})
