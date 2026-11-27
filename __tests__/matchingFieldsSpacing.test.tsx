/** The matching sets: the gap is between sets; the first sits straight under the card's label (visual QA R5 M15). */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Dimensions, StyleSheet } from 'react-native'

import { MatchingFields } from '../components/profile/MatchingFields'
import { SPACE } from '../lib/design/tokens'
import { WhoSees } from '../components/profile/WhoSees'
import { AX_XXXL, uncapped } from './helpers/ax'

const noop = jest.fn()

it('puts no margin above the first set and SPACE.xl above the next', async () => {
  await render(
    <MatchingFields
      intents={['networking']}
      onToggleIntent={noop}
      workField={null}
      onChangeWorkField={noop}
      workFields={[{ slug: 'design', label: 'Design' }]}
    />,
  )
  expect(StyleSheet.flatten(screen.getByTestId('matching-first-set').props.style)?.marginTop ?? 0).toBe(0)
  const second = screen.getByTestId('matching-work-field').parent
  expect(StyleSheet.flatten(second?.props.style).marginTop).toBe(SPACE.xl)
})

describe('who sees each field (YOU-07, 14.0)', () => {
  const { TIER_SEES, FIELD_TIER, whoSees } = require('../lib/matchingTiers')

  it('maps the fields to the design’s tiers', () => {
    expect(['interests', 'iplTeam', 'thisOrThat', 'artists', 'intent', 'sign'].every((f) => FIELD_TIER[f] === 'A')).toBe(true)
    expect(['languages', 'homeState', 'workField'].every((f) => FIELD_TIER[f] === 'B')).toBe(true)
    expect(['college', 'neighbourhood', 'occupation', 'prompts', 'photos'].every((f) => FIELD_TIER[f] === 'C')).toBe(true)
    expect(whoSees('college').icon).toBe('eye-off')
    // The dating fields left with dating (D-002): no tier line is kept for a question nobody is asked.
    for (const f of ['gender', 'interestedIn', 'orientation']) expect(FIELD_TIER).not.toHaveProperty(f)
  })

  it('says it under intent, and the work field says Tier B through its own hint', async () => {
    await render(
      <MatchingFields
        intents={['friendship']}
        onToggleIntent={noop}
        workField={null}
        onChangeWorkField={noop}
        workFields={[{ slug: 'design', label: 'Design' }]}
      />,
    )
    expect(screen.getByTestId('who-sees-intent')).toBeTruthy()
    expect(screen.getByText(TIER_SEES.B)).toBeTruthy()
  })

  it('stays capped at AX XXXL', async () => {
    const window = Dimensions.get('window')
    try {
      await act(async () => Dimensions.set({ window: { ...window, fontScale: AX_XXXL }, screen: { ...window, fontScale: AX_XXXL } }))
      await render(<WhoSees field="homeState" />)
      expect(uncapped(screen.toJSON())).toEqual([])
    } finally {
      Dimensions.set({ window, screen: window })
    }
  })
})
