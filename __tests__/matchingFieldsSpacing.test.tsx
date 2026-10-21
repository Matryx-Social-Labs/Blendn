/** The matching sets: the gap is between sets; the first sits straight under the card's label (visual QA R5 M15). */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { MatchingFields } from '../components/profile/MatchingFields'
import { SPACE } from '../lib/design/tokens'

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
