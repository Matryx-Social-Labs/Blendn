/*
 * <NotificationRow> and <NotificationVisual> (guidelines/components/NotificationRow.html,
 * Flow 9): one row per notification. The leading visual is chosen by who the
 * actor is to you; a title (700 while new, with the dot), one line of context
 * one line of context; a request adds 36 pt pills; stale rows dim and say so.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'

import * as Reanimated from 'react-native-reanimated'

import { NotificationRow, NotificationVisual } from '../components/ds/NotificationRow'
import { HueProvider, SELECTION, type Hue } from '../components/ds/shared'
import { COLOR, FONT_FAMILY } from '../lib/design/tokens'
import { H } from '../lib/haptics'

jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), __esModule: true, useReducedMotion: jest.fn(() => false) }))
const reduceMotion = Reanimated.useReducedMotion as jest.Mock

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)

let success: jest.SpyInstance
let primary: jest.SpyInstance
beforeEach(() => {
  reduceMotion.mockReturnValue(false)
  success = jest.spyOn(H, 'success').mockImplementation(() => {})
  primary = jest.spyOn(H, 'primary').mockImplementation(() => {})
})

describe('<NotificationVisual>', () => {
  it.each([
    ['photo', { type: 'photo', uri: 'https://example.com/p.jpg' }],
    ['creature', { type: 'creature', pseudonym: 'Cosmic Panda' }],
    ['glyph', { type: 'glyph', icon: 'sparkles' }],
    ['emblem', { type: 'emblem', seed: 'nebula' }],
    ['event', { type: 'event', cover: 'https://example.com/c.jpg', badge: 'clock' }],
    ['stack', { type: 'stack', people: [{ pseudonym: 'Cosmic Panda' }, { pseudonym: 'Quiet Heron' }], extra: 1 }],
  ] as const)('%s draws at 40, decorative', async (_, visual) => {
    await render(<NotificationVisual visual={visual} size={40} testID="v" />)
    expect(flat('v')).toMatchObject({ width: 40, height: 40 })
    expect(screen.getByTestId('v', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true)
  })

  it('a merged stack shows +N', async () => {
    await render(<NotificationVisual visual={{ type: 'stack', people: [{ pseudonym: 'A' }, { pseudonym: 'B' }], extra: 1 }} size={40} testID="v" />)
    expect(screen.getByText('+1', { includeHiddenElements: true })).toBeTruthy()
  })
})

describe('<NotificationRow>', () => {
  it('reads title, context, new; the title is 700 while new, with the dot', async () => {
    await render(
      <NotificationRow visual={{ type: 'creature', pseudonym: 'Cosmic Panda' }} title="Cosmic Panda liked you" context="Vinyl Night" fresh onPress={jest.fn()} testID="n" />
    )
    expect(screen.getByRole('button', { name: 'Cosmic Panda liked you, Vinyl Night, new' })).toBeTruthy()
    expect(StyleSheet.flatten(screen.getByText('Cosmic Panda liked you', { includeHiddenElements: true }).props.style).fontFamily).toBe(FONT_FAMILY.brand[700])
    expect(screen.getByTestId('n-dot', { includeHiddenElements: true })).toBeTruthy()
  })

  it('read: 500, no dot', async () => {
    await render(<NotificationRow visual={{ type: 'glyph', icon: 'sparkles' }} title="You’re in" context="Toit" testID="n" />)
    expect(StyleSheet.flatten(screen.getByText('You’re in', { includeHiddenElements: true }).props.style).fontFamily).toBe(FONT_FAMILY.brand[500])
    expect(screen.queryByTestId('n-dot', { includeHiddenElements: true })).toBeNull()
  })

  it('a request: the pills are buttons after the row; the first is busy while pending', async () => {
    const accept = jest.fn()
    await render(
      <NotificationRow
        visual={{ type: 'photo', uri: 'https://example.com/p.jpg' }}
        title="Priya wants to be friends"
        context="From Vinyl Night"
        fresh
        actions={[
          { label: 'Accept', kind: 'lit', onPress: accept },
          { label: 'Not now', kind: 'secondary', onPress: jest.fn() },
        ]}
        testID="n"
      />
    )
    expect(screen.queryByTestId('n-dot', { includeHiddenElements: true })).toBeNull()
    await fireEvent(screen.getByRole('button', { name: 'Accept' }), 'pressIn')
    await fireEvent.press(screen.getByRole('button', { name: 'Accept' }))
    expect(accept).toHaveBeenCalledTimes(1)
    // The Flow 9 prototype: Accept (strong) plays H.primary as it's pressed; Not now plays nothing.
    expect(primary).toHaveBeenCalledTimes(1)
    await fireEvent(screen.getByRole('button', { name: 'Not now' }), 'pressIn')
    expect(primary).toHaveBeenCalledTimes(1)
    await render(
      <NotificationRow
        visual={{ type: 'photo', uri: 'p' }}
        title="Priya wants to be friends"
        context="From Vinyl Night"
        state="pending"
        actions={[{ label: 'Accept', kind: 'lit', onPress: accept }]}
      />
    )
    expect(screen.getByRole('button', { name: 'Accept' }).props.accessibilityState).toMatchObject({ busy: true })
  })

  it('the tapped pill carries the spinner; the others wait', async () => {
    const row = (state?: 'pending') => (
      <NotificationRow
        visual={{ type: 'photo', uri: 'p' }}
        title="Quiet Heron asked to join your car"
        context="The Board"
        state={state}
        actions={[
          { label: 'Join', kind: 'lit', onPress: jest.fn() },
          { label: 'View', kind: 'secondary', onPress: jest.fn() },
        ]}
      />
    )
    const { rerender } = await render(row())
    await fireEvent.press(screen.getByRole('button', { name: 'View' }))
    await rerender(row('pending'))
    expect(screen.getByRole('button', { name: 'View' }).props.accessibilityState).toMatchObject({ busy: true })
    expect(screen.getByRole('button', { name: 'Join' }).props.accessibilityState).toMatchObject({ disabled: true })
  })

  it('Accept recorded: H.success once, the outcome replaces the pills, joins the row’s label and is said', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
    const row = (state: 'pending' | 'done') => (
      <NotificationRow
        visual={{ type: 'photo', uri: 'p' }}
        title="Priya wants to be friends"
        context="From Vinyl Night"
        state={state}
        doneText="You’re friends"
        actions={[{ label: 'Accept', kind: 'lit', onPress: jest.fn() }]}
      />
    )
    const { rerender } = await render(row('pending'))
    expect(success).not.toHaveBeenCalled()
    await rerender(row('done'))
    expect(success).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Priya wants to be friends, From Vinyl Night, You’re friends')).toBeTruthy()
    expect(announce).toHaveBeenCalledWith('You’re friends')
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull()
  })

  it('a row that mounts done plays nothing', async () => {
    await render(<NotificationRow visual={{ type: 'photo', uri: 'p' }} title="t" context="c" state="done" doneText="You’re friends" />)
    expect(success).not.toHaveBeenCalled()
  })

  it('stale: the visual at 50%, the title quiet, “This request is no longer open”, no pills', async () => {
    await render(
      <NotificationRow
        visual={{ type: 'event', cover: 'c', badge: 'x', cancelled: true }}
        title="Open mic · late set was cancelled"
        context="Open mic"
        state="stale"
        actions={[{ label: 'View', kind: 'secondary', onPress: jest.fn() }]}
        testID="n"
      />
    )
    expect(flat('n-visual').opacity).toBe(0.5)
    expect(StyleSheet.flatten(screen.getByText('Open mic · late set was cancelled', { includeHiddenElements: true }).props.style).color).toBe(COLOR.textSecondary)
    expect(screen.getByText('This request is no longer open', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'View' })).toBeNull()
  })

  it('a tap goes where the push would, silently', async () => {
    const onPress = jest.fn()
    const spies = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
    await render(<NotificationRow visual={{ type: 'glyph', icon: 'sparkles' }} title="It’s a Blend" context="Nebula" onPress={onPress} />)
    await fireEvent.press(screen.getByRole('button', { name: 'It’s a Blend, Nebula' }))
    expect(onPress).toHaveBeenCalledTimes(1)
    for (const s of spies) expect(s).not.toHaveBeenCalled()
  })
})

describe('unread → read (motion #29)', () => {
  it('the title steps from 700 to 500 and the dot goes when the row is no longer fresh', async () => {
    const visual = { type: 'glyph', icon: 'sparkles' } as const
    const view = await render(<NotificationRow visual={visual} title="It’s a Blend" context="Now" fresh testID="r" />)
    expect(screen.getByTestId('r-dot', { includeHiddenElements: true })).toBeTruthy()
    expect(StyleSheet.flatten(screen.getByText('It’s a Blend').props.style)).toMatchObject({ fontFamily: FONT_FAMILY.brand[700] })
    await view.rerender(<NotificationRow visual={visual} title="It’s a Blend" context="Now" testID="r" />)
    expect(StyleSheet.flatten(screen.getByText('It’s a Blend').props.style)).toMatchObject({ fontFamily: FONT_FAMILY.brand[500] })
  })

  it('the dot leaves over quick on the exit curve, and is not animated at all under Reduce Motion', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'components', 'ds', 'NotificationRow.tsx'), 'utf8')
    expect(src).toMatch(/FadeOut\.duration\(DURATION\.quick\)\.easing\(Easing\.bezier\(\.\.\.EASING\.exit\)\)/)
    expect(src).toMatch(/exiting=\{reduceMotion \? undefined : DOT_EXIT\}/)
  })
})

describe('foundations C, part 2: the row in its world', () => {
  const inWorld = (hue: Hue, row: React.ReactElement) => <HueProvider value={hue}>{row}</HueProvider>
  const request = (over: Partial<React.ComponentProps<typeof NotificationRow>> = {}) => (
    <NotificationRow
      visual={{ type: 'glyph', icon: 'user-plus' }}
      title="New friend request"
      context="21 h ago"
      actions={[
        { label: 'Accept', kind: 'lit', icon: 'user-check', onPress: jest.fn() },
        { label: 'Decline', kind: 'secondary', onPress: jest.fn() },
      ]}
      testID="n"
      {...over}
    />
  )

  it.each(['ember', 'rose', 'violet'] as const)('under %s the fallback glyph tile is that hue’s fill with its light glyph', async (hue) => {
    await render(inWorld(hue, request()))
    expect(flat('n-art-tile').backgroundColor).toBe(SELECTION[hue].fill)
    expect(JSON.stringify(screen.toJSON())).toContain(SELECTION[hue].glyph)
  })

  it('under rose the tile is selectionRoseFill with a selectionRoseGlyph glyph', async () => {
    await render(inWorld('rose', request()))
    expect(flat('n-art-tile').backgroundColor).toBe(COLOR.selectionRoseFill)
    expect(JSON.stringify(screen.toJSON())).toContain(COLOR.selectionRoseGlyph)
  })

  it('the banner’s visual, which asks for no light, keeps the grey tile and the white glyph under any hue', async () => {
    await render(inWorld('rose', <NotificationVisual visual={{ type: 'glyph', icon: 'bell' }} size={32} testID="v" />))
    expect(flat('v-tile').backgroundColor).toBe(COLOR.surfaceRaised)
    expect(JSON.stringify(screen.toJSON())).not.toContain(COLOR.selectionRoseGlyph)
  })

  it('Accept and Join are lit buttons with their glyph; Decline is secondary', async () => {
    await render(inWorld('rose', request()))
    expect(flat('n-pill-0')).toMatchObject({ backgroundColor: COLOR.selectionRoseFill })
    expect(flat('n-pill-0-rim')).toMatchObject({ borderColor: COLOR.brandRose, borderWidth: 1 })
    expect(flat('n-pill-1').backgroundColor).toBe(COLOR.surfaceRaised)
    expect(screen.queryByTestId('n-pill-1-rim', { includeHiddenElements: true })).toBeNull()
  })

  describe('a request’s face takes the hue’s ring, outside the cut-out, only while it has actions', () => {
    const photo = { type: 'photo', uri: 'https://example.com/p.jpg' } as const
    it('a photo request: the rose ring outside the 2 pt cut-out of the ground', async () => {
      await render(inWorld('rose', request({ visual: photo, ground: COLOR.surface })))
      expect(flat('n-art-face-halo')).toMatchObject({ borderColor: COLOR.brandRose, borderWidth: 2 })
      expect(flat('n-art-face-ring').backgroundColor).toBe(COLOR.surface)
    })

    it('a creature request takes it too', async () => {
      await render(inWorld('rose', request({ visual: { type: 'creature', pseudonym: 'Velvet Heron' } })))
      expect(screen.getByTestId('n-art-face-halo', { includeHiddenElements: true })).toBeTruthy()
    })

    it('a row with no actions (a notice, a match) draws no halo and no cut-out', async () => {
      await render(inWorld('rose', request({ visual: photo, actions: undefined })))
      expect(screen.queryByTestId('n-art-face-halo', { includeHiddenElements: true })).toBeNull()
      expect(screen.queryByTestId('n-art-face-ring', { includeHiddenElements: true })).toBeNull()
    })
  })

  it('the unread dot is the hue’s light glyph tone, not white', async () => {
    await render(inWorld('rose', <NotificationRow visual={{ type: 'glyph', icon: 'heart' }} title="It’s a match" context="Now" fresh testID="n" />))
    expect(flat('n-dot').backgroundColor).toBe(COLOR.selectionRoseGlyph)
    expect(flat('n-dot')).toMatchObject({ width: 8, height: 8 })
  })

  describe('You’re friends now: the moment a request is answered', () => {
    const row = (state: 'pending' | 'done', icon: 'user-plus' | 'user-check') =>
      inWorld('rose', request({ state, doneText: 'You’re friends now', visual: { type: 'glyph', icon } }))

    it('pending → done: the pills leave, the outcome line comes in with a drawn ✓, H.success plays once', async () => {
      const view = await render(row('pending', 'user-plus'))
      expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy()
      expect(screen.queryByTestId('n-done-check', { includeHiddenElements: true })).toBeNull()
      await view.rerender(row('done', 'user-check'))
      expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull()
      expect(screen.getByText('You’re friends now')).toBeTruthy()
      // `DrawnGlyph`: the check, stroked in the hue's light tone.
      expect(screen.getByTestId('n-done-check', { includeHiddenElements: true }).props.stroke).toBe(COLOR.selectionRoseGlyph)
      expect(success).toHaveBeenCalledTimes(1)
    })

    it('the outcome line enters on the frame it is answered, and not on a row that arrives done', async () => {
      const view = await render(row('pending', 'user-plus'))
      await view.rerender(row('done', 'user-check'))
      expect(screen.getByTestId('n-done', { includeHiddenElements: true }).props.entering).toBeDefined()
      await render(row('done', 'user-check'))
      expect(screen.getByTestId('n-done', { includeHiddenElements: true }).props.entering).toBeUndefined()
    })

    it('the row’s height settles on a layout transition, and jumps under Reduce Motion', async () => {
      await render(row('pending', 'user-plus'))
      expect(screen.getByTestId('n').props.layout).toBeDefined()
      reduceMotion.mockReturnValue(true)
      await render(row('pending', 'user-plus'))
      expect(screen.getAllByTestId('n').at(-1)?.props.layout).toBeUndefined()
    })
  })

  it('Accept plays H.primary on press-in and Decline nothing', async () => {
    await render(inWorld('rose', request()))
    await fireEvent(screen.getByRole('button', { name: 'Decline' }), 'pressIn')
    expect(primary).not.toHaveBeenCalled()
    await fireEvent(screen.getByRole('button', { name: 'Accept' }), 'pressIn')
    expect(primary).toHaveBeenCalledTimes(1)
  })
})
