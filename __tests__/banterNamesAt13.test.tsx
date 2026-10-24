/*
 * Banter at Android's 1.3 on a 360 dp phone (rc7 D10, D13). The names beside a fixed trailing column (the time, the ⋯)
 * were held to one line until the AX flag at 1.5, so request rows read "Arnav G…" and "Bhavna …"; from 1.2 they take two.
 * A Blend's "closes 5:50 AM" wrapped inside the time and left "AM" alone on the next line.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { View } from 'react-native'

import { BanterRow, BlendLiveCard, RequestCard } from '../components/banter/BanterParts'
import { unbroken } from '../lib/time'
import { atScale, resetScale } from './helpers/ax'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)

afterEach(() => resetScale())

const request = () => (
  <RequestCard face={<View />} name="Arnav Gupta" note="Saw you at the quiz" time="2h" onAccept={jest.fn()} onDecline={jest.fn()} onMore={jest.fn()} />
)
const row = () => <BanterRow face={{ kind: 'creature', seed: 'x' } as never} title="Bhavna Iyer" line={{ kind: 'text', text: 'hey' } as never} time="Yesterday" unread={false} />
const lines = (text: string) => screen.getByText(text, { includeHiddenElements: true }).props.numberOfLines

describe('names take two lines from 1.2 (rc7 D10)', () => {
  it('at 1.3 a request’s name and a row’s title may wrap', async () => {
    await atScale(1.3, 360)
    await render(request())
    expect(lines('Arnav Gupta')).toBe(2)
    await render(row())
    expect(lines('Bhavna Iyer')).toBe(2)
  })

  it('at the default size they stay on one line', async () => {
    await atScale(1)
    await render(request())
    expect(lines('Arnav Gupta')).toBe(1)
  })
})

describe('a Blend’s closing time wraps as one piece (rc7 D13)', () => {
  it('unbroken turns the clock’s spaces into no-break spaces', () => {
    expect(unbroken('5:50 AM')).toBe('5:50\u00A0AM')
  })

  it('the Blend card says the time with no break inside it', async () => {
    await render(<BlendLiveCard title="RC7 Crew G × RC4 Crew Y" seeds={[null, null]} closesAt="2026-10-24T05:50:00" unread={0} onPress={jest.fn()} />)
    // Raw text: the default normalizer folds a no-break space into a space, and would pass the broken line too.
    expect(screen.getByText('5:50\u00A0AM', { includeHiddenElements: true, normalizer: (text) => text })).toBeTruthy()
  })
})

describe('the Banter bar at Android 1.3 (rc7 first pass: rows "drawn through" the title)', () => {
  it('is the solid bar on Android, so rows scrolling up are cut at its edge, and it is named `-bar` for the checker', async () => {
    const { Platform, StyleSheet } = jest.requireActual('react-native')
    const { SOLID } = jest.requireActual('../components/ui/Material')
    const { BanterHeader } = jest.requireActual('../components/banter/BanterParts')
    const os = Platform.OS
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
    try {
      await atScale(1.3, 360)
      await render(<BanterHeader bell={null} searching={false} onSearch={jest.fn()} canMarkAll={false} onMarkAll={jest.fn()} />)
      const bar = StyleSheet.flatten(screen.getByTestId('banter-bar', { includeHiddenElements: true }).props.style)
      expect(bar.backgroundColor).toBe(SOLID.bar)
    } finally {
      Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
    }
  })
})
