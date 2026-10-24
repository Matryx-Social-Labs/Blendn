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

import { ContextMenu, LongPressMenu, placeLongPress, type MenuItem } from '../components/ds/ContextMenu'
import { COLOR, MATERIAL, SIZE, SPRING } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { dismissModals } from '../lib/pendingRoute'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false), withSpring: jest.fn(actual.withSpring), withTiming: jest.fn(actual.withTiming) }
})
/*
 * RN's Modal stays mounted and presented on iOS after `visible` turns false,
 * until the native dismissal (then `onDismiss`); the stock mock drops it at
 * once. This one keeps the element, so a test can fire `dismiss` on it.
 */
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const { View } = jest.requireActual('react-native')
  const Modal = ({ visible, children, ...props }: { visible?: boolean; children?: React.ReactNode }) => (
    <View {...props}>{visible ? children : null}</View>
  )
  return { __esModule: true, default: Modal }
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

describe('placeLongPress', () => {
  const window = { width: 360, height: 800 }
  const insets = { top: 40, bottom: 30 }
  const bar = { width: 296, height: 48 }
  const menu = { width: 220, height: 240 }

  it('mid-screen: the item stays; the bar above, the menu below', () => {
    const at = placeLongPress({ window, insets, anchor: { x: 64, y: 300, width: 220, height: 44 }, side: 'left', bar, menu })
    expect(at.item).toBe(300)
    expect(at.bar).toEqual({ top: 300 - 48 - 8, left: 56 })
    expect(at.menu).toEqual({ top: 300 + 44 + 12, left: 64 })
  })

  it('near the bottom: the item moves up so the menu fits', () => {
    const at = placeLongPress({ window, insets, anchor: { x: 64, y: 700, width: 220, height: 44 }, side: 'left', bar, menu })
    expect(at.menu.top + menu.height).toBeLessThanOrEqual(800 - 30)
    expect(at.item).toBeLessThan(700)
  })

  it('an item too tall for both: the menu pins to the bottom, over it', () => {
    const at = placeLongPress({ window, insets, anchor: { x: 24, y: 100, width: 300, height: 600 }, side: 'left', bar: null, menu })
    expect(at.menu.top).toBe(800 - 30 - 8 - 240)
  })

  it('yours lines up on its right edge; a bar too wide for the space is kept on screen', () => {
    const yours = placeLongPress({ window, insets, anchor: { x: 200, y: 300, width: 136, height: 44 }, side: 'right', bar, menu })
    expect(yours.bar?.left).toBe(336 - 296)
    expect(yours.menu.left).toBe(336 - 220)
    const theirs = placeLongPress({ window, insets, anchor: { x: 100, y: 300, width: 200, height: 44 }, side: 'left', bar, menu })
    expect(theirs.bar?.left).toBe(360 - 8 - 296)
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

  it('iOS: an item closes the menu and runs once it has been dismissed (a sheet it opens is not lost)', async () => {
    const reply = jest.fn()
    const onClose = jest.fn()
    await render(menu({ items: items({ reply }), onClose }))
    await fireEvent.press(screen.getByRole('button', { name: 'Reply' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(reply).not.toHaveBeenCalled()
    await fireEvent(screen.getByTestId('lp-modal'), 'dismiss')
    expect(reply).toHaveBeenCalledTimes(1)
  })

  it('iOS: a screen that closes it by clearing anchor and visible together still gets the item, once dismissed', async () => {
    const reply = jest.fn()
    const onClose = jest.fn()
    await render(menu({ items: items({ reply }), onClose }))
    await fireEvent.press(screen.getByRole('button', { name: 'Reply' }))
    await screen.rerender(menu({ items: items({ reply }), onClose, visible: false, anchor: null }))
    expect(reply).not.toHaveBeenCalled()
    await fireEvent(screen.getByTestId('lp-modal'), 'dismiss')
    expect(reply).toHaveBeenCalledTimes(1)
  })

  it('a link closes an open menu, as it does a sheet (RC drive 6); a closed one is not asked', async () => {
    const onClose = jest.fn()
    const view = await render(menu({ onClose }))
    await act(async () => dismissModals())
    expect(onClose).toHaveBeenCalledTimes(1)

    await view.rerender(menu({ onClose, visible: false, anchor: null }))
    await act(async () => dismissModals())
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('never opened (no anchor yet): nothing is mounted', async () => {
    await render(menu({ visible: false, anchor: null }))
    expect(screen.queryByTestId('lp-modal')).toBeNull()
  })

  it('Android: an item closes the menu and runs at once; a reaction too', async () => {
    on('android')
    const reply = jest.fn()
    const onPick = jest.fn()
    const onClose = jest.fn()
    jest.spyOn(H, 'reaction').mockImplementation(() => {})
    await render(menu({ items: items({ reply }), reactions: { mine: [], onPick }, onClose }))
    await fireEvent.press(screen.getByRole('button', { name: 'Reply' }))
    expect(reply).toHaveBeenCalledTimes(1)
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

  describe('the exit (DS #6: a quick fade with an 8 pt drop)', () => {
    const withTiming = Reanimated.withTiming as jest.Mock
    beforeEach(() => {
      jest.useFakeTimers()
      withTiming.mockClear()
      reduceMotion.mockReturnValue(false)
    })
    afterEach(() => jest.useRealTimers())

    it('fades the dim and the menu out over quick when it closes, instead of vanishing', async () => {
      const view = await render(menu())
      withTiming.mockClear()
      await view.rerender(menu({ visible: false }))
      const outs = withTiming.mock.calls.filter(([to, cfg]) => cfg.duration === 160 && (to === 0 || to === 1))
      // The dim to 0, and the menu's own exit (0 → 1 of its `leave`).
      expect(outs.map(([to]) => to).sort()).toEqual([0, 1])
    })

    it('stays mounted for the exit, then goes', async () => {
      const view = await render(menu())
      await view.rerender(menu({ visible: false }))
      expect(screen.getByTestId('lp-menu', { includeHiddenElements: true })).toBeTruthy()
      await act(async () => jest.advanceTimersByTime(60))
      expect(screen.getByTestId('lp-menu', { includeHiddenElements: true })).toBeTruthy()
      await act(async () => jest.advanceTimersByTime(120))
      expect(screen.queryByTestId('lp-menu', { includeHiddenElements: true })).toBeNull()
    })

    it('drops the menu 8 pt as it goes, and under Reduce Motion fades in place', async () => {
      const style = () => Reanimated.getAnimatedStyle(screen.getByTestId('lp-menu', { includeHiddenElements: true })) as { opacity: number; transform: { translateY?: number }[] }
      const view = await render(menu())
      await view.rerender(menu({ visible: false }))
      await act(async () => jest.advanceTimersByTime(150))
      expect(style().transform[0].translateY).toBeGreaterThan(0)
      expect(style().transform[0].translateY).toBeLessThanOrEqual(8)
      expect(style().opacity).toBeLessThan(1)
      reduceMotion.mockReturnValue(true)
      await screen.unmount() // one Modal on screen at a time (lib/modalTurn): the first goes before the next
      const rm = await render(menu())
      await rm.rerender(menu({ visible: false }))
      await act(async () => jest.advanceTimersByTime(150))
      expect(style().transform[0].translateY).toBe(0)
    })

    it('opens the next time as it always did, whatever the last exit was', async () => {
      const view = await render(menu())
      await view.rerender(menu({ visible: false }))
      await act(async () => jest.advanceTimersByTime(300))
      await view.rerender(menu())
      await act(async () => jest.advanceTimersByTime(300))
      const menuNode = Reanimated.getAnimatedStyle(screen.getByTestId('lp-menu', { includeHiddenElements: true })) as { opacity: number }
      expect(menuNode.opacity).toBe(1)
    })
  })
})
