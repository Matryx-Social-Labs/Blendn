/*
 * One "new" pill (buttons board C, owner 2026-11-17): the room's "48 new messages", the Lobby's held posts, Banter's and
 * Notifications' "↑ New" were four looks (rose, surface, glass, toast glass). Now the one DS NewPill, a glass capsule.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import fs from 'fs'
import path from 'path'
import React from 'react'
import { StyleSheet } from 'react-native'

import { NewPill } from '../components/ds/NewPill'
import { COLOR, FONT_FAMILY } from '../lib/design/tokens'

jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} />, isGlassEffectAPIAvailable: jest.fn(() => true), isLiquidGlassAvailable: jest.fn(() => true) }
})

const ROOT = path.join(__dirname, '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

describe('the four sites draw the one DS NewPill', () => {
  const SITES = ['components/chat/ChatParts.tsx', 'components/board/LobbyParts.tsx', 'components/banter/BanterParts.tsx', 'app/notifications.tsx']

  it.each(SITES)('%s imports it and draws no pill of its own', (rel) => {
    const src = read(rel)
    expect(src).toMatch(/import \{ NewPill \} from '(\.\.\/)+(components\/)?ds\/NewPill'/)
    expect(src).toMatch(/<NewPill\b/)
    // The old hand-rolled pills: a rose or surface capsule with an arrow glyph inside a Pressable.
    expect(src).not.toMatch(/styles\.(newPill|pill|newPlace)\b/)
  })

  it('the notifications-only pill is gone', () => {
    expect(fs.existsSync(path.join(ROOT, 'components/notifications/NewPill.tsx'))).toBe(false)
  })

  it('control: the source check would catch a site that still drew its own', () => {
    expect(`<Pressable style={styles.newPill}>`).toMatch(/styles\.(newPill|pill|newPlace)\b/)
  })
})

describe('<NewPill>', () => {
  it('is a button named with what pressing does, white on glass, never a hue', async () => {
    const onPress = jest.fn()
    await render(<NewPill label="new messages" count="48" direction="down" bottom={80} accessibilityLabel="48 new messages, jump to the newest" onPress={onPress} testID="p" />)
    const pill = screen.getByRole('button', { name: '48 new messages, jump to the newest' })
    await fireEvent.press(pill)
    expect(onPress).toHaveBeenCalledTimes(1)
    const label = screen.getByText(/new messages/)
    expect(StyleSheet.flatten(label.props.style).color).toBe(COLOR.textPrimary)
    // The count leads, in Geist Mono.
    expect(StyleSheet.flatten(screen.getByText('48 ').props.style).fontFamily).toBe(FONT_FAMILY.mono[700])
    const json = JSON.stringify(screen.toJSON())
    for (const hue of [COLOR.selectionRoseFill, COLOR.selectionEmberFill, COLOR.selectionVioletFill]) expect(json).not.toContain(hue)
  })

  it('says itself when asked to (the Lobby’s held posts), and not otherwise', async () => {
    await render(<NewPill label="3 new posts" top={100} accessibilityLabel="3 new posts. Show them" announce onPress={jest.fn()} testID="p" />)
    expect(screen.getByTestId('p').props.accessibilityLiveRegion).toBe('polite')
    await render(<NewPill label="New" top={100} accessibilityLabel="New messages above" onPress={jest.fn()} testID="p" />)
    expect(screen.getByTestId('p').props.accessibilityLiveRegion).toBeUndefined()
  })
})
