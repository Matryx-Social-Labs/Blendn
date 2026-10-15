/*
 * <OverlapLine> (guidelines/components/OverlapLine.html, Flow 14 · 14.1,
 * ROUND3 G4): one sentence of what two people share, never a score. The
 * server's sentence; 2 labels before a reveal, 4 after; nothing at all when
 * the server sends no line.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { OverlapLine } from '../components/ds/OverlapLine'
import { COLOR, TYPE } from '../lib/design/tokens'

const LABELS = [
  { text: 'Tamil Nadu', shared: true },
  { text: 'Filter coffee', shared: true },
  { text: 'CSK', shared: true },
  { text: 'Friendship', shared: true },
  { text: 'Kannada', shared: true },
]

describe('<OverlapLine>', () => {
  it('draws the server’s sentence in bodyStrong white', async () => {
    await render(<OverlapLine line="You both picked Filter coffee over Chai" />)
    const line = screen.getByText('You both picked Filter coffee over Chai')
    expect(StyleSheet.flatten(line.props.style)).toMatchObject({ fontSize: TYPE.bodyStrong.fontSize, color: COLOR.textPrimary })
  })

  it('2 labels before a reveal, 4 after', async () => {
    await render(<OverlapLine line="Both from Tamil Nadu" labels={LABELS} />)
    expect(screen.getByText('Filter coffee')).toBeTruthy()
    expect(screen.queryByText('CSK')).toBeNull()
    await render(<OverlapLine line="Both from Tamil Nadu" labels={LABELS} revealed />)
    expect(screen.getByText('Friendship')).toBeTruthy()
    expect(screen.queryByText('Kannada')).toBeNull()
  })

  it('a shared label is outlined (1.5 pt at 35%) and read as shared', async () => {
    await render(<OverlapLine line="Both from Tamil Nadu" labels={[{ text: 'CSK', shared: true }]} testID="o" />)
    expect(screen.getByLabelText('CSK, shared')).toBeTruthy()
    expect(StyleSheet.flatten(screen.getByTestId('o-label').props.style)).toMatchObject({ borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)' })
  })

  it('nothing at all when there is nothing', async () => {
    await render(<OverlapLine line={null} testID="o" />)
    expect(screen.queryByTestId('o')).toBeNull()
  })

})
