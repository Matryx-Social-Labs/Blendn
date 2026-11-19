/*
 * <ManageStatusRow> (guidelines/components/ManageStatusRow.html, Flow 12
 * Manage, ROUND3 G2): what is true in one card. The Plus mark, the status, one
 * sentence with the date and the store; a payment problem links to the store
 * that can fix it. remaining-screens 03 A: no dot, a gift says so, and the card
 * can carry what Blend'n+ includes.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'

import { ManageStatusRow } from '../components/ds/ManageStatusRow'

jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

describe('<ManageStatusRow>', () => {
  it('reads as one sentence: the status, then what is true', async () => {
    await render(<ManageStatusRow status="active" sentence="Renews 3 Nov · ₹199 · Google Play" store="android" testID="m" />)
    expect(screen.getByLabelText('Blend’n+ · active. Renews 3 Nov · ₹199 · Google Play')).toBeTruthy()
  })

  // remaining-screens 03 A draws no dot. Negative control: today's coloured dot fails it.
  it('no status dot: the words say how it stands', async () => {
    await render(<ManageStatusRow status="grace" sentence="…" store="ios" testID="m" />)
    expect(screen.queryByTestId('m-dot', { includeHiddenElements: true })).toBeNull()
  })

  it('a gift from us says so', async () => {
    await render(<ManageStatusRow status="gift" sentence="Until 25 Oct 2027 · nothing renews, nothing to pay" store="ios" />)
    expect(screen.getByLabelText('Blend’n+ · a gift from Blend’n. Until 25 Oct 2027 · nothing renews, nothing to pay')).toBeTruthy()
  })

  it('what Blend’n+ includes, as a checklist under a hairline, read after the sentence', async () => {
    await render(<ManageStatusRow status="active" sentence="Renews 25 Oct 2027 · App Store" store="ios" features={['Stay live while you’re there', 'Your full night history']} testID="m" />)
    expect(screen.getByTestId('m-features')).toBeTruthy()
    expect(screen.getByLabelText('Includes: Stay live while you’re there, Your full night history')).toBeTruthy()
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
