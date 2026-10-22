/**
 * The one sheet host (`components/SheetHost.tsx`) on the DS Sheet, rendered:
 * a `rows` sheet draws its actions as rows with Cancel apart; a run that
 * fails stays and says why; a reason sends on tap, and "Something else" asks
 * for a note first (R3-D5) — naming who isn't told.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
const mockToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }))

/* eslint-disable import/first */
import { StyleSheet } from 'react-native'
import { SheetHost } from '../components/SheetHost'
import { COLOR } from '../lib/design/tokens'
import { closeSheet, showSheet, type SheetOutcome } from '../lib/sheet'
/* eslint-enable import/first */

const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve()
  })
}

afterEach(() => act(() => closeSheet()))

it('rows: every action but Cancel is a row; a failed run stays and says why', async () => {
  const run = jest.fn(async (): Promise<SheetOutcome> => ({ ok: false, error: 'You can’t block yourself.' }))
  await render(<SheetHost />)
  await act(async () =>
    showSheet({
      kind: 'actions',
      title: 'Cosmic Panda',
      layout: 'rows',
      actions: [
        { label: 'Block…', variant: 'destructive', icon: 'user', run },
        { label: 'Cancel', cancel: true },
      ],
    })
  )
  expect(screen.getByLabelText('Block…')).toBeTruthy()
  expect(screen.getByLabelText('Cancel')).toBeTruthy()
  await act(async () => fireEvent.press(screen.getByLabelText('Block…')))
  await settle()
  expect(run).toHaveBeenCalledTimes(1)
  expect(screen.getByText('You can’t block yourself.')).toBeTruthy()
})

describe('the affirmative is lit in the world the sheet is asked from', () => {
  const ask = (hue?: 'rose' | 'violet') =>
    showSheet({ kind: 'actions', hue, title: 'Sign out?', actions: [{ label: 'Sign out', variant: 'primary', then: jest.fn() }, { label: 'Cancel', cancel: true }] })
  const fill = () => StyleSheet.flatten(screen.getByRole('button', { name: 'Sign out' }).props.style).backgroundColor

  it.each([
    ['violet', COLOR.selectionVioletFill],
    ['rose', COLOR.selectionRoseFill],
  ] as const)('%s: the caller’s hue', async (hue, expected) => {
    await render(<SheetHost />)
    await act(async () => ask(hue))
    expect(fill()).toBe(expected)
  })

  it('ember when the caller names none; never the white strong', async () => {
    await render(<SheetHost />)
    await act(async () => ask())
    expect(fill()).toBe(COLOR.selectionEmberFill)
    expect(fill()).not.toBe(COLOR.textPrimary)
  })
})

describe('a reason sheet', () => {
  const reasons = (run: (reason: string, note?: string) => Promise<SheetOutcome>) =>
    showSheet({
      kind: 'reasons',
      title: 'Report this message',
      about: 'Cosmic Panda',
      reasons: [
        { value: 'harassment', label: 'Harassment' },
        { value: 'other', label: 'Something else' },
      ],
      submitLabel: 'Report',
      run,
    })

  it('sends a reason on tap, and closes with the toast', async () => {
    const run = jest.fn(async (): Promise<SheetOutcome> => ({ ok: true, toast: 'Reported. Thank you.' }))
    await render(<SheetHost />)
    await act(async () => reasons(run))
    await act(async () => fireEvent.press(screen.getByLabelText('Harassment')))
    await settle()
    expect(run).toHaveBeenCalledWith('harassment', undefined)
    expect(mockToast).toHaveBeenCalledWith('Reported. Thank you.', 'success')
  })

  it('"Something else" asks for the note first, and says who isn’t told', async () => {
    const run = jest.fn(async (): Promise<SheetOutcome> => ({ ok: true }))
    await render(<SheetHost />)
    await act(async () => reasons(run))
    await act(async () => fireEvent.press(screen.getByLabelText('Something else')))
    expect(run).not.toHaveBeenCalled()
    expect(screen.getByText('Tell us what happened. Cosmic Panda isn’t told who sent this.')).toBeTruthy()
    await act(async () => fireEvent.changeText(screen.getByPlaceholderText('What happened?'), '  kept sending links  '))
    await act(async () => fireEvent.press(screen.getByLabelText('Send report')))
    await settle()
    expect(run).toHaveBeenCalledWith('other', 'kept sending links')
  })
})
