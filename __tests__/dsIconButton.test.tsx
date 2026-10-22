/*
 * <IconButton> (guidelines/components/IconButton.html): the 44 pt / 48 dp
 * circle on the control or media tier, silent for navigation, H.select when it
 * toggles, never faded as a whole (it is glass), and the accessibility matrix.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { IconButton } from '../components/ds/IconButton'
import { HueProvider } from '../components/ds/shared'
import { COLOR, MATERIAL, RADIUS, SIZE } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { OPACITY } from '../lib/theme'

jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), __esModule: true, useReducedMotion: jest.fn(() => false) }))
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return {
    GlassView: (props: object) => <View {...props} testID="glass" />,
    isGlassEffectAPIAvailable: jest.fn(() => true),
    isLiquidGlassAvailable: jest.fn(() => true),
  }
})
jest.mock('expo-blur', () => {
  const { View } = jest.requireActual('react-native')
  return { BlurView: (props: object) => <View testID="blur" {...props} /> }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View testID="highlight" {...props} /> }
})

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style)
const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })

let select: jest.SpyInstance
beforeEach(() => {
  on('ios')
  select = jest.spyOn(H, 'select').mockImplementation(() => {})
})

const draw = (props: Partial<React.ComponentProps<typeof IconButton>> = {}) =>
  render(<IconButton icon="chevron-left" accessibilityLabel="Back" onPress={jest.fn()} testID="i" {...props} />)

describe('<IconButton>', () => {
  it('is a 44 pt glass circle on iOS, a button named by its action', async () => {
    await draw()
    expect(flat('i')).toMatchObject({ width: SIZE.circleButton, height: SIZE.circleButton, borderRadius: RADIUS.circleButton })
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy()
    expect(screen.getByTestId('glass').props.glassEffectStyle).toBe('regular')
  })

  it('is a 48 dp solid circle on Android', async () => {
    on('android')
    await draw()
    expect(flat('i')).toMatchObject({ width: SIZE.circleButtonAndroid, borderRadius: RADIUS.circleButtonAndroid })
    expect(screen.queryByTestId('glass')).toBeNull()
  })

  it('uses clear glass over a photo (the media tier)', async () => {
    await draw({ tier: 'media' })
    expect(screen.getByTestId('glass').props.glassEffectStyle).toBe('clear')
  })

  it('plays nothing for navigation', async () => {
    const onPress = jest.fn()
    await draw({ onPress })
    await fireEvent.press(screen.getByTestId('i'))
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(select).not.toHaveBeenCalled()
  })

  it('plays H.select when it toggles a selection, and says it is selected', async () => {
    await draw({ icon: 'bookmark', accessibilityLabel: 'Saved', selected: true })
    expect(screen.getByTestId('i').props.accessibilityState).toMatchObject({ selected: true })
    await fireEvent.press(screen.getByTestId('i'))
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('selected lights in the screen’s hue, never white (direction C): the fill, a 1 pt rim, the light glyph', async () => {
    await render(
      <HueProvider value="rose">
        <IconButton icon="search" accessibilityLabel="Search" selected onPress={jest.fn()} testID="i" />
      </HueProvider>
    )
    expect(flat('i-selected')).toMatchObject({ backgroundColor: COLOR.selectionRoseFill, borderWidth: 1, borderColor: COLOR.brandRose })
    expect(flat('i-selected').backgroundColor).not.toBe(COLOR.selectionFill)
  })

  it('over a photo (media) the selected disc stays white with an ink glyph (§4.7): a hue on a photo is not legible', async () => {
    await draw({ icon: 'heart', accessibilityLabel: 'Saved', selected: true, tier: 'media' })
    expect(flat('i-selected').backgroundColor).toBe(COLOR.selectionFill)
  })

  it('disabled dims the glyph, never the glass (§5.2 rule 6), and does not press', async () => {
    const onPress = jest.fn()
    await draw({ disabled: true, onPress })
    expect(flat('i').opacity).toBeUndefined()
    expect(flat('i-glyph').opacity).toBe(OPACITY.disabled)
    expect(screen.getByTestId('i').props.accessibilityState).toMatchObject({ disabled: true })
    await fireEvent.press(screen.getByTestId('i'))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('Android press squares the corner off to 12 dp; iOS keeps the circle', async () => {
    on('android')
    await draw()
    await fireEvent(screen.getByTestId('i'), 'pressIn')
    expect(flat('i').borderRadius).toBe(RADIUS.pressedAndroid)
    await fireEvent(screen.getByTestId('i'), 'pressOut')
    expect(flat('i').borderRadius).toBe(RADIUS.circleButtonAndroid)
  })

  it('focused draws the ring', async () => {
    await draw({ previewState: 'focused' })
    expect(screen.getByTestId('i-focus')).toBeTruthy()
  })

  it('Increase Contrast adds the 50% hairline', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await draw()
    await act(async () => {})
    expect(flat('i-contrast').borderColor).toBe(MATERIAL.hairlineIncreaseContrast)
  })
})

describe('the pop (DS #15)', () => {
  const reduceMotion = Reanimated.useReducedMotion as jest.Mock
  const toggle = (selected: boolean) => (
    <IconButton icon="heart" accessibilityLabel="Like" selected={selected} onPress={jest.fn()} testID="i" />
  )

  it('a toggle pops its glyph once when it is switched on, with H.select once', async () => {
    reduceMotion.mockReturnValue(false)
    const spring = jest.spyOn(Reanimated, 'withSpring')
    await render(toggle(false))
    await fireEvent.press(screen.getByTestId('i'))
    await screen.rerender(toggle(true))
    expect(select).toHaveBeenCalledTimes(1)
    expect(spring).toHaveBeenCalledTimes(1)
    spring.mockRestore()
  })

  it('switched off, or mounted on, it plays nothing; and Reduce Motion plays nothing', async () => {
    const spring = jest.spyOn(Reanimated, 'withSpring')
    reduceMotion.mockReturnValue(false)
    await render(toggle(true))
    await screen.rerender(toggle(false))
    expect(spring).not.toHaveBeenCalled()
    reduceMotion.mockReturnValue(true)
    await screen.rerender(toggle(true))
    expect(spring).not.toHaveBeenCalled()
    spring.mockRestore()
  })

  it('a button that is not a toggle never animates', async () => {
    const spring = jest.spyOn(Reanimated, 'withSpring')
    await render(<IconButton icon="heart" accessibilityLabel="Like" testID="i" />)
    expect(spring).not.toHaveBeenCalled()
    spring.mockRestore()
  })
})
