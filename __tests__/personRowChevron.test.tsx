/*
 * Friends has one chevron (r7 M9): the "Friend requests" row's (SettingsRow, 16 pt textTertiary, 16 in from the card's
 * edge) and the person rows' were two sizes on two right edges. A person row's chevron is SettingsRow's, on its edge.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { PersonRow } from '../components/friends/PersonRow'
import { SettingsRow } from '../components/ds/SettingsRow'
import { COLOR, ICON, SPACE } from '../lib/design/tokens'

jest.mock('../lib/apiClient', () => ({ apiClient: {} }))
jest.mock('../components/ui/Icon', () => {
  const { View } = jest.requireActual('react-native')
  return { Icon: ({ name, size, color }: { name: string; size: number; color: string }) => <View testID={`icon-${name}`} size={size} color={color} /> }
})

const chevron = () => screen.getAllByTestId('icon-chevron-right', { includeHiddenElements: true })[0]

it('a person row’s chevron is the settings row’s: its size, its colour, its inset from the right', async () => {
  await render(<SettingsRow icon="users" title="Friend requests" trail="chevron" onPress={() => {}} />)
  const settings = { size: chevron().props.size, color: chevron().props.color }

  await render(<PersonRow person={{ id: 'u1', name: 'Sneha', photo: null } as never} detail="Friends since " detailMono="Mar 2026" chevron onPress={() => {}} />)
  expect({ size: chevron().props.size, color: chevron().props.color }).toEqual(settings)
  expect(settings).toEqual({ size: ICON.inline, color: COLOR.textTertiary })
  expect(StyleSheet.flatten(chevron().parent!.props.style)).toMatchObject({ marginRight: SPACE.lg })
})
