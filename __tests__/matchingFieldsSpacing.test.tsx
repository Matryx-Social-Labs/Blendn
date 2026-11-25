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
      gender={null}
      onChangeGender={noop}
      orientations={[]}
      onChangeOrientations={noop}
      interestedIn={[]}
      onChangeInterestedIn={noop}
      offerDating={false}
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
    expect(['gender', 'interestedIn', 'orientation'].every((f) => FIELD_TIER[f] === 'O')).toBe(true)
    expect(whoSees('gender')).toMatchObject({ icon: 'lock', text: 'Nobody but you sees this.' })
    expect(whoSees('college').icon).toBe('eye-off')
  })

  it('says it under intent, and under the owner-only fields while dating is on', async () => {
    await render(
      <MatchingFields
        intents={['dating']}
        onToggleIntent={noop}
        workField={null}
        onChangeWorkField={noop}
        workFields={[{ slug: 'design', label: 'Design' }]}
        gender={null}
        onChangeGender={noop}
        orientations={[]}
        onChangeOrientations={noop}
        interestedIn={[]}
        onChangeInterestedIn={noop}
        offerDating
      />,
    )
    expect(screen.getByTestId('who-sees-intent')).toBeTruthy()
    expect(screen.getByTestId('who-sees-gender')).toBeTruthy()
    expect(screen.getByTestId('who-sees-orientation')).toBeTruthy()
    expect(screen.getAllByLabelText(TIER_SEES.O).length).toBeGreaterThanOrEqual(2)
    // The work field says Tier B through its own hint.
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

  const dating = (showOrientation?: boolean) => (
    <MatchingFields
      intents={['dating']}
      onToggleIntent={noop}
      workField={null}
      onChangeWorkField={noop}
      workFields={[{ slug: 'design', label: 'Design' }]}
      gender={null}
      onChangeGender={noop}
      orientations={[]}
      onChangeOrientations={noop}
      interestedIn={[]}
      onChangeInterestedIn={noop}
      offerDating
      showOrientation={showOrientation}
    />
  )

  it('orientation says nobody but you while show_orientation is off (the default)', async () => {
    await render(dating())
    expect(screen.getByTestId('who-sees-orientation').props.accessibilityLabel).toBe('Nobody but you sees this.')
  })

  it('orientation is Tier C once show_orientation is on: shown to whoever may see who you are, never "nobody"', async () => {
    await render(dating(true))
    expect(screen.getByTestId('who-sees-orientation').props.accessibilityLabel).toBe('Shown only after you reveal yourself.')
    // Gender stays owner-only either way.
    expect(screen.getByTestId('who-sees-gender').props.accessibilityLabel).toBe('Nobody but you sees this.')
  })
})
