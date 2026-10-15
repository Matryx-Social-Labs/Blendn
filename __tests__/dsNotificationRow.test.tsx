/*
 * <NotificationRow> and <NotificationVisual> (guidelines/components/NotificationRow.html,
 * Flow 9): one row per notification. The leading visual is chosen by who the
 * actor is to you; a title (700 while new, with the dot), one line of context
 * one line of context; a request adds 36 pt pills; stale rows dim and say so.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'

import { NotificationRow, NotificationVisual } from '../components/ds/NotificationRow'
import { COLOR, FONT_FAMILY } from '../lib/design/tokens'
import { H } from '../lib/haptics'

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)

let success: jest.SpyInstance
let primary: jest.SpyInstance
beforeEach(() => {
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
          { label: 'Accept', kind: 'strong', onPress: accept },
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
        actions={[{ label: 'Accept', kind: 'strong', onPress: accept }]}
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
          { label: 'Join', kind: 'strong', onPress: jest.fn() },
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
        actions={[{ label: 'Accept', kind: 'strong', onPress: jest.fn() }]}
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
