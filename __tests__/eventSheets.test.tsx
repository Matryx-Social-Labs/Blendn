/*
 * The event announce and edit sheets (EventDetailScreen): the field being typed
 * in and Send / Save must both be on screen with the keyboard up. They are the
 * app's own Sheet now (it caps at the keyboard's top and scrolls its content to
 * the focused field); they were transparent Modals with the card centred in the
 * window, where the keyboard covered the buttons.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Dimensions, Keyboard } from 'react-native'

import { sheetMaxHeight } from '../components/ds/Sheet'
import { AnnouncementSheet, ANNOUNCEMENT_LIMIT, EDIT_LIMITS, EditEventSheet, isOver } from '../components/scene/EventSheets'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false) }
})
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} />, isGlassEffectAPIAvailable: jest.fn(() => true), isLiquidGlassAvailable: jest.fn(() => true) }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

type Handlers = Record<string, (e?: { endCoordinates: { height: number; screenY: number } }) => void>
let handlers: Handlers
beforeEach(() => {
  handlers = {}
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, fn: Handlers[string]) => {
    handlers[event] = fn
    return { remove: () => {} }
  }) as never)
})

const KEYBOARD = 336
const up = async () => {
  const windowHeight = Dimensions.get('window').height
  await act(async () => handlers.keyboardWillShow({ endCoordinates: { height: KEYBOARD, screenY: windowHeight - KEYBOARD } }))
  return windowHeight
}
const capOf = (id: string) => {
  const style = screen.getByTestId(id, { includeHiddenElements: true }).props.style
  return [style].flat(Infinity).reduce((all: Record<string, unknown>, one) => ({ ...all, ...(one as object) }), {}) as { maxHeight?: number }
}

describe('the announcement sheet', () => {
  const sheet = (over: Partial<React.ComponentProps<typeof AnnouncementSheet>> = {}) => (
    <AnnouncementSheet visible text="" onChangeText={jest.fn()} sending={false} onSend={jest.fn()} onClose={jest.fn()} {...over} />
  )

  it('with the keyboard up the sheet stops at the keyboard’s top, and its field and Send are both in it', async () => {
    await render(sheet({ text: 'Doors in ten' }))
    const windowHeight = await up()
    expect(capOf('announcement-sheet').maxHeight).toBe(sheetMaxHeight(windowHeight, 0, windowHeight - KEYBOARD))
    expect(screen.getByTestId('announcement-input')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy()
  })

  it('Send is refused for an empty message, and shows it is busy while it goes', async () => {
    const onSend = jest.fn()
    const view = await render(sheet({ onSend }))
    expect(screen.getByRole('button', { name: 'Send' }).props.accessibilityState).toMatchObject({ disabled: true })
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }))
    expect(onSend).not.toHaveBeenCalled()
    await view.rerender(sheet({ onSend, text: 'Hello', sending: true }))
    expect(screen.getByRole('button', { name: 'Send' }).props.accessibilityState).toMatchObject({ busy: true })
  })

  it('Send sends, Cancel closes, and the field counts toward the server’s 1,000', async () => {
    const onSend = jest.fn()
    const onClose = jest.fn()
    await render(sheet({ text: 'Hello', onSend, onClose }))
    expect(screen.getByText('5/1000', { includeHiddenElements: true })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }))
    expect(onSend).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('the edit sheet', () => {
  const edit = (over: Partial<React.ComponentProps<typeof EditEventSheet>> = {}) => (
    <EditEventSheet
      visible
      title="Vinyl Night"
      onChangeTitle={jest.fn()}
      shortDescription=""
      onChangeShortDescription={jest.fn()}
      description=""
      onChangeDescription={jest.fn()}
      saving={false}
      onSave={jest.fn()}
      onClose={jest.fn()}
      {...over}
    />
  )

  it('three fields and Save, in a sheet capped at the keyboard’s top (the content scrolls to the focused field)', async () => {
    await render(edit())
    const windowHeight = await up()
    expect(capOf('edit-sheet').maxHeight).toBe(sheetMaxHeight(windowHeight, 0, windowHeight - KEYBOARD))
    for (const id of ['edit-title', 'edit-short', 'edit-description']) expect(screen.getByTestId(id)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
  })

  it('Save needs a title; saving shows busy; Save and Cancel do what they say', async () => {
    const onSave = jest.fn()
    const onClose = jest.fn()
    const view = await render(edit({ title: ' ', onSave, onClose }))
    expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState).toMatchObject({ disabled: true })
    await view.rerender(edit({ title: 'Vinyl Night', onSave, onClose }))
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await view.rerender(edit({ title: 'Vinyl Night', saving: true, onSave, onClose }))
    expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState).toMatchObject({ busy: true })
  })
})

describe('the limits the old maxLength enforced', () => {
  const saveDisabled = () => screen.getByRole('button', { name: 'Save' }).props.accessibilityState.disabled
  const sendDisabled = () => screen.getByRole('button', { name: 'Send' }).props.accessibilityState.disabled

  it('counts what is sent: trimmed, in UTF-16 units (an emoji is two), as the server’s zod max() does', () => {
    expect(isOver('a'.repeat(120), 120)).toBe(false)
    expect(isOver('a'.repeat(121), 120)).toBe(true)
    expect(isOver(`  ${'a'.repeat(120)}  `, 120)).toBe(false)
    expect(isOver('😀'.repeat(61), 120)).toBe(true)
    expect(isOver('😀'.repeat(60), 120)).toBe(false)
  })

  it('Send is refused over 1,000 and says why; at 1,000 it goes', async () => {
    const view = await render(<AnnouncementSheet visible text={'a'.repeat(ANNOUNCEMENT_LIMIT)} onChangeText={jest.fn()} sending={false} onSend={jest.fn()} onClose={jest.fn()} />)
    expect(sendDisabled()).toBe(false)
    await view.rerender(<AnnouncementSheet visible text={'a'.repeat(ANNOUNCEMENT_LIMIT + 1)} onChangeText={jest.fn()} sending={false} onSend={jest.fn()} onClose={jest.fn()} />)
    expect(sendDisabled()).toBe(true)
    expect(screen.getByText('Over the 1000-character limit.')).toBeTruthy()
  })

  it.each([
    ['title', { title: 'a'.repeat(EDIT_LIMITS.title + 1) }, 'Over the 120-character limit.'],
    ['short description', { shortDescription: 'a'.repeat(EDIT_LIMITS.shortDescription + 1) }, 'Over the 200-character limit.'],
    ['description', { description: 'a'.repeat(EDIT_LIMITS.description + 1) }, 'Over the 2000-character limit.'],
  ])('Save is refused while the %s is over its limit, and the field says so', async (_name, over, line) => {
    const props = { visible: true, title: 'Vinyl Night', onChangeTitle: jest.fn(), shortDescription: '', onChangeShortDescription: jest.fn(), description: '', onChangeDescription: jest.fn(), saving: false, onSave: jest.fn(), onClose: jest.fn() }
    const view = await render(<EditEventSheet {...props} />)
    expect(saveDisabled()).toBe(false)
    await view.rerender(<EditEventSheet {...props} {...over} />)
    expect(saveDisabled()).toBe(true)
    expect(screen.getByText(line)).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }))
    expect(props.onSave).not.toHaveBeenCalled()
  })
})
