/*
 * <StateScreen> and <GlyphWell> (guidelines/components/StateScreen.html): one
 * pattern for empty, failed, refused and system states, inline (56 well) and
 * full screen (80 well, actions docked), read title → body → actions, no
 * haptic of its own.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, StyleSheet } from 'react-native'

import { GlyphWell, StateScreen } from '../components/ds/StateScreen'
import { COLOR, MATERIAL } from '../lib/design/tokens'
import { H } from '../lib/haptics'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const text = (t: string) => StyleSheet.flatten(screen.getByText(t).props.style)

describe('<GlyphWell>', () => {
  it('is 56 with a secondary glyph inline, 80 with a white glyph on a whole screen', async () => {
    await render(<GlyphWell icon="users" testID="w" />)
    expect(flat('w')).toMatchObject({ width: 56, height: 56, backgroundColor: COLOR.surface })
    await render(<GlyphWell icon="users" size="screen" testID="w" />)
    expect(flat('w')).toMatchObject({ width: 80, height: 80 })
  })

  it('is decorative', async () => {
    await render(<GlyphWell icon="users" testID="w" />)
    expect(screen.queryByTestId('w')).toBeNull()
  })
})

describe('<StateScreen>', () => {
  const errorH = () => jest.spyOn(H, 'error').mockImplementation(() => {})

  it('reads title (a heading), body, then the actions, and plays no haptic', async () => {
    const error = errorH()
    const retry = jest.fn()
    await render(
      <StateScreen
        icon="cloud-off"
        title="Couldn’t load the board"
        body="Check your connection and try again."
        actions={[{ label: 'Try again', kind: 'secondary', onPress: retry }]}
      />
    )
    expect(screen.getByRole('header', { name: 'Couldn’t load the board' })).toBeTruthy()
    expect(text('Check your connection and try again.').color).toBe(COLOR.textSecondary)
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)
    expect(error).not.toHaveBeenCalled()
  })

  it('busy: the primary action shows its busy state', async () => {
    await render(
      <StateScreen icon="cloud-off" title="Couldn’t load the board" busy actions={[{ label: 'Try again', onPress: jest.fn() }]} />
    )
    expect(screen.getByRole('button', { name: 'Try again' }).props.accessibilityState).toMatchObject({ busy: true })
  })

  it('full screen: the 80 well, the actions docked, and the screen announced on arrival', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
    await render(
      <StateScreen
        variant="screen"
        icon="circle-slash"
        title="Not open to you"
        body="This event is 21+."
        actions={[{ label: 'OK', kind: 'strong', onPress: jest.fn() }]}
        testID="s"
      />
    )
    expect(flat('s-well').width).toBe(80)
    expect(screen.getByTestId('s-dock')).toBeTruthy()
    expect(announce).toHaveBeenCalledWith('Not open to you. This event is 21+.')
  })

  it('Increase Contrast: the well’s hairline, a white glyph, white body text', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await render(<StateScreen icon="users" title="Nobody else is here yet" body="People show up as they check in." testID="s" />)
    await act(async () => {})
    expect(flat('s-well').borderColor).toBe(MATERIAL.hairlineIncreaseContrast)
    expect(text('People show up as they check in.').color).toBe(COLOR.textPrimary)
  })
})
