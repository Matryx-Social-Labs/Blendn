/*
 * <ManageStatusRow> (guidelines/components/ManageStatusRow.html, Flow 12
 * Manage, ROUND3 G2): what is true in one card. The Plus mark, the status, one
 * sentence with the date and the store, a dot in the status colour; a payment
 * problem links to the store that can fix it.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { ManageStatusRow } from '../components/ds/ManageStatusRow'
import { COLOR } from '../lib/design/tokens'

jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)

describe('<ManageStatusRow>', () => {
  it('reads as one sentence: the status, then what is true', async () => {
    await render(<ManageStatusRow status="active" sentence="Renews 3 Nov · ₹199 · Google Play" store="android" testID="m" />)
    expect(screen.getByLabelText('Blend’n+ · active. Renews 3 Nov · ₹199 · Google Play')).toBeTruthy()
  })

  it.each([
    ['active', COLOR.live],
    ['trial', COLOR.live],
    ['night', COLOR.live],
    ['grace', COLOR.warning],
    ['cancelled', COLOR.textTertiary],
    ['expired', COLOR.textTertiary],
  ] as const)('%s: the dot', async (status, colour) => {
    await render(<ManageStatusRow status={status} sentence="…" store="ios" testID="m" />)
    expect(flat('m-dot').backgroundColor).toBe(colour)
  })

  it('G2: the Night Pass is 24 hours', async () => {
    await render(<ManageStatusRow status="night" sentence="Until 9:42 pm tomorrow. It doesn’t renew; another one adds 24 hours." store="ios" />)
    expect(screen.getByText('Night Pass · 24 hours', { includeHiddenElements: true })).toBeTruthy()
  })

  it('a payment problem links to its own store; nothing else has a button', async () => {
    const onFix = jest.fn()
    await render(<ManageStatusRow status="grace" sentence="You still have Blend’n+." store="android" onFix={onFix} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Fix it in Google Play' }))
    expect(onFix).toHaveBeenCalledTimes(1)
    await render(<ManageStatusRow status="hold" sentence="Paused until the payment is fixed." store="ios" onFix={onFix} />)
    expect(screen.getByRole('button', { name: 'Fix it in the App Store' })).toBeTruthy()
    await render(<ManageStatusRow status="active" sentence="Renews 3 Nov" store="ios" onFix={onFix} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
