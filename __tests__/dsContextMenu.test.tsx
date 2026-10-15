/*
 * <ContextMenu> and <LongPressMenu> (guidelines/components/ContextMenu.html,
 * ROUND3 D 5.2, motion #36): a sheet-glass column of 48 pt rows, the
 * destructive one last in red, no haptic on an item; the long-press overlay
 * lifts the item to 1.03 on M.settle over a 55% dim, the bar above and the
 * menu below springing from it; Android back and the dim close it; Reduce
 * Motion: no lift.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet, Text } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { ContextMenu, LongPressMenu, type MenuItem } from '../components/ds/ContextMenu'
import { COLOR, MATERIAL, SIZE, SPRING } from '../lib/design/tokens'
import { H } from '../lib/haptics'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false), withSpring: jest.fn(actual.withSpring) }
})
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} testID="glass" />, isGlassEffectAPIAvailable: () => true, isLiquidGlassAvailable: () => true }
})

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const withSpring = Reanimated.withSpring as jest.Mock
const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)

const items = (fns: Record<string, jest.Mock> = {}): MenuItem[] => [
  { icon: 'user', label: 'Cosmic Panda', chevron: true, onPress: fns.card ?? jest.fn() },
  { icon: 'reply', label: 'Reply', onPress: fns.reply ?? jest.fn() },
  { icon: 'copy', label: 'Copy', onPress: fns.copy ?? jest.fn() },
  { icon: 'flag', label: 'Report…', onPress: jest.fn() },
  { icon: 'ban', label: 'Block…', destructive: true, onPress: jest.fn() },
]
const ANCHOR = { x: 64, y: 320, width: 220, height: 44 }

beforeEach(() => {
  on('ios')
  reduceMotion.mockReturnValue(false)
})

describe('<ContextMenu>', () => {
  it('rows top to bottom as buttons; the destructive one in red; an item plays nothing', async () => {
    const spies = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
    const copy = jest.fn()
    await render(<ContextMenu items={items({ copy })} testID="m" />)
    expect(screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual(['Cosmic Panda', 'Reply', 'Copy', 'Report…', 'Block…'])
    expect(StyleSheet.flatten(screen.getByText('Block…').props.style).color).toBe(COLOR.destructive)
    expect(flat('m-row-1').minHeight).toBe(SIZE.control)
    await fireEvent.press(screen.getByRole('button', { name: 'Copy' }))
    expect(copy).toHaveBeenCalledTimes(1)
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('iOS: sheet glass. Android: solid, no blur', async () => {
    await render(<ContextMenu items={items()} />)
    expect(screen.getByTestId('glass')).toBeTruthy()
    on('android')
    await render(<ContextMenu items={items()} />)
    expect(screen.queryByTestId('glass')).toBeNull()
  })

  it('Increase Contrast: the hairlines at 50%', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await render(<ContextMenu items={items()} testID="m" />)
    await act(async () => {})
    expect(flat('m-row-1').borderTopColor).toBe(MATERIAL.hairlineIncreaseContrast)
  })
})

describe('<LongPressMenu>', () => {
  const menu = (props: Partial<React.ComponentProps<typeof LongPressMenu>> = {}) => (
    <LongPressMenu visible anchor={ANCHOR} side="left" items={items()} onClose={jest.fn()} testID="lp" {...props}>
      <Text>Rumours side two. Fight me.</Text>
    </LongPressMenu>
  )

  it('the lifted item, the bar above it and the menu below', async () => {
    await render(menu({ reactions: { mine: ['🔥'], onPick: jest.fn() } }))
    expect(screen.getByText('Rumours side two. Fight me.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'React, fire' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reply' })).toBeTruthy()
    const bar = flat('lp-bar').top as number
    const item = flat('lp-item').top as number
    const below = flat('lp-menu').top as number
    expect(bar).toBeLessThan(item)
    expect(below).toBeGreaterThan(item + ANCHOR.height)
  })

  it('no reactions (a DM, a room that refuses writes): no bar', async () => {
    await render(menu())
    expect(screen.queryByTestId('lp-bar')).toBeNull()
  })

  it('an item runs and closes the menu; so does a reaction', async () => {
    const reply = jest.fn()
    const onPick = jest.fn()
    const onClose = jest.fn()
    jest.spyOn(H, 'reaction').mockImplementation(() => {})
    await render(menu({ items: items({ reply }), reactions: { mine: [], onPick }, onClose }))
    await fireEvent.press(screen.getByRole('button', { name: 'Reply' }))
    expect(reply).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByRole('button', { name: 'React, heart' }))
    expect(onPick).toHaveBeenCalledWith('❤️')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('the dim, system back and the escape gesture close it', async () => {
    const onClose = jest.fn()
    await render(menu({ onClose }))
    expect(flat('lp-dim').backgroundColor).toBe('rgba(13,12,12,0.55)')
    await fireEvent.press(screen.getByTestId('lp-dim', { includeHiddenElements: true }))
    await fireEvent(screen.getByTestId('lp-modal'), 'requestClose')
    await fireEvent(screen.getByTestId('lp-root', { includeHiddenElements: true }), 'accessibilityEscape')
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('#36: lifts to 1.03 on M.settle and springs the menu on M.snap; Reduce Motion: no lift, a fade', async () => {
    withSpring.mockClear()
    await render(menu())
    expect(withSpring).toHaveBeenCalledWith(1.03, expect.objectContaining({ stiffness: SPRING.settle.stiffness }))
    expect(withSpring).toHaveBeenCalledWith(1, expect.objectContaining({ stiffness: SPRING.snap.stiffness }))
    withSpring.mockClear()
    reduceMotion.mockReturnValue(true)
    await render(menu())
    expect(withSpring).not.toHaveBeenCalled()
  })
})
