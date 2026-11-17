/**
 * A person's name in a row never splits mid-word (SCRUM-1041 ruling A, extended to names by the coordinator 2026-11-17): Android at
 * font 2.0 drew "Marc-André Lefebv / re-Desrosiers" in a friend row. The rows draw the name through the DS word fit (`FitText`,
 * the same measured fit as `Title`): when the phone's own layout ends a line inside a word, that word is measured at 1× and the
 * name drawn at the size it fits, never under 1×. Negative control: the rows' old plain `Text` has no measure copy, so each test
 * fails at `measuring()`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { IncomingRequestRow } from '../components/friends/IncomingRequestRow'
import { InviteLinkCard } from '../components/friends/InviteLinkCard'
import { PersonRow } from '../components/friends/PersonRow'
import { TYPE } from '../lib/design/tokens'
import { atScale, resetScale } from './helpers/ax'

jest.mock('../components/OptimizedImage', () => {
  const { View } = require('react-native')
  return { OptimizedImage: () => <View /> }
})
afterEach(resetScale)

const NAME = 'Marc-André Lefebvre-Desrosiers'
const lines = (...texts: string[]) => texts.map((text) => ({ text, width: 0, height: 0, x: 0, y: 0, ascender: 0, descender: 0, capHeight: 0, xHeight: 0 }))
const measuring = () => screen.queryByTestId('title-measure', { includeHiddenElements: true })
const size = () => (StyleSheet.flatten(screen.getByText(NAME).props.style) as { fontSize: number }).fontSize

/** The phone lays the name out over a line `line` wide, ending its first line inside "Lefebvre-Desrosiers". */
async function splitMidWord(line: number, word: number) {
  const name = screen.getByText(NAME)
  await fireEvent(name, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: line, height: 0 } } })
  await fireEvent(name, 'textLayout', { nativeEvent: { lines: lines('Marc-André Lefebv', 're-Desrosiers') } })
  expect(measuring()).toBeTruthy()
  await fireEvent(measuring()!, 'textLayout', { nativeEvent: { lines: [{ ...lines('w')[0], width: word }] } })
}

describe('a long hyphenated name in a row at Android font 2.0', () => {
  const person = { userId: 'u1', name: NAME, photo: null }

  it('the friend row shrinks the word that would split, never under 1×, and keeps it whole', async () => {
    await atScale(2)
    await render(<PersonRow person={person} detail="Friends since " detailMono="Nov 2026" />)
    // "Lefebvre-Desrosiers" is 160 wide at 17 pt; the line is 200: it fits at 21 pt, not the 34 of 2×.
    await splitMidWord(200, 160)
    expect(size()).toBe(21)
    expect(size()).toBeGreaterThanOrEqual(TYPE.bodyStrong.fontSize)
  })

  it('the request row does the same', async () => {
    await atScale(2)
    await render(<IncomingRequestRow request={{ id: 'r1', person, createdAt: new Date().toISOString() }} busy={false} onRespond={jest.fn()} />)
    await splitMidWord(200, 160)
    expect(size()).toBe(21)
  })

  it('a name that breaks only between words is left as the role draws it', async () => {
    await atScale(2)
    await render(<PersonRow person={person} />)
    await fireEvent(screen.getByText(NAME), 'textLayout', { nativeEvent: { lines: lines('Marc-André ', 'Lefebvre-Desrosiers') } })
    expect(measuring()).toBeNull()
  })

  it('your name on the invite card is fitted the same way', async () => {
    await atScale(2)
    await render(<InviteLinkCard url="https://www.blendn.app/f/abcdefqrstuv" name={NAME} />)
    await splitMidWord(200, 190)
    expect(size()).toBeGreaterThanOrEqual(TYPE.heading.fontSize)
    expect(size()).toBeLessThan(TYPE.heading.fontSize * 2)
  })
})
