/*
 * Flow 5 D-A in the DM (dm.html): the thread opens with where and when you matched and tonight's question
 * (`xThread` opener), and showing who you are is confirmed once, on one sheet (`xConfirm`).
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'
import React from 'react'
import { StyleSheet } from 'react-native'

import { MatchOpenerCard, RevealSheets } from '../components/chat/DmParts'
import { H } from '../lib/haptics'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} />, isGlassEffectAPIAvailable: jest.fn(() => true), isLiquidGlassAvailable: jest.fn(() => true) }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View testID="gradient" {...props} /> }
})

const LINE = 'You matched in the room · Tonight · 7:42 PM'

describe('the thread opener', () => {
  it('says where and when you matched, then tonight’s question as the opener', async () => {
    await render(<MatchOpenerCard line={LINE} question="Who are you hoping they play?" />)
    expect(screen.getByText(LINE)).toBeTruthy()
    expect(screen.getByText('TONIGHT’S QUESTION')).toBeTruthy()
    expect(screen.getByText('Who are you hoping they play?')).toBeTruthy()
    expect(screen.getByLabelText('Tonight’s question: Who are you hoping they play?')).toBeTruthy()
  })

  it('a room that asks nothing: the line alone, no question card', async () => {
    await render(<MatchOpenerCard line={LINE} question={null} />)
    expect(screen.getByText(LINE)).toBeTruthy()
    expect(screen.queryByTestId('dm-opener-question')).toBeNull()
    expect(screen.queryByText('TONIGHT’S QUESTION')).toBeNull()
  })

  it('the line is centred and stops at 300 wide, so a long one wraps rather than running edge to edge', async () => {
    await render(<MatchOpenerCard line={LINE} question={null} />)
    expect(StyleSheet.flatten(screen.getByText(LINE).props.style)).toMatchObject({ textAlign: 'center', maxWidth: 300 })
  })
})

describe('the confirm (one sheet, the only confirm)', () => {
  const you = { kind: 'creature', pseudonym: 'Quiet Lynx' } as const
  const yourPhoto = { kind: 'photo', uri: 'https://example.com/rohan.jpg' } as const
  const draw = (props: Partial<React.ComponentProps<typeof RevealSheets>> = {}) =>
    render(<RevealSheets name="Lunar Fox" sheet="confirm" busy={false} you={you} yourPhoto={yourPhoto} onShow={jest.fn()} onClose={jest.fn()} onAddPhoto={jest.fn()} {...props} />)

  it('asks by name, says what they will see and that it cannot be undone, then Show them and Not now', async () => {
    await draw()
    expect(screen.getByText('Show Lunar Fox who you are?')).toBeTruthy()
    expect(screen.getByText('They’ll see your name and photos. You can’t undo this.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show them' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy()
  })

  it('shows the change itself: your creature, then your face', async () => {
    await draw()
    expect(screen.getByTestId('dm-reveal-sheet-from', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByTestId('dm-reveal-sheet-to', { includeHiddenElements: true })).toBeTruthy()
  })

  it('Show them is the gradient and silent on press (H.success follows the server); Not now only closes', async () => {
    const onShow = jest.fn()
    const onClose = jest.fn()
    const haptics = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
    await draw({ onShow, onClose })
    const show = screen.getByRole('button', { name: 'Show them' })
    expect(screen.getAllByTestId('gradient', { includeHiddenElements: true }).length).toBeGreaterThan(0)
    await fireEvent(show, 'pressIn')
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onShow).not.toHaveBeenCalled()
    await fireEvent.press(show)
    expect(onShow).toHaveBeenCalledTimes(1)
    for (const spy of haptics) expect(spy).not.toHaveBeenCalled()
  })
})

describe('the DM screen', () => {
  const DM = readFileSync(join(__dirname, '..', 'app/private-chat/[conversationId].tsx'), 'utf8')

  it('plays H.success only on the server’s yes to a reveal, nowhere else', () => {
    const calls = DM.match(/H\.success\(\)/g) ?? []
    expect(calls).toHaveLength(1)
    expect(DM).toMatch(/if \(r\.success\) \{\s*H\.success\(\)/)
  })

  it('the opener takes the room’s question from the server’s lens, never from the route', () => {
    expect(DM).toMatch(/question: reveal\?\.lens\?\.question/)
  })
})

describe('the reveal’s motion (D-A film)', () => {
  const DM = readFileSync(join(__dirname, '..', 'app/private-chat/[conversationId].tsx'), 'utf8')
  const BAR = readFileSync(join(__dirname, '..', 'components/ds/RevealBar.tsx'), 'utf8')

  it('a side crossfades in place over 700 ms; under Reduce Motion over 200 ms', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { REVEAL_CROSSFADE_MS, REVEAL_CROSSFADE_REDUCED_MS } = require('../components/ds/RevealBar')
    expect(REVEAL_CROSSFADE_MS).toBe(700)
    expect(REVEAL_CROSSFADE_REDUCED_MS).toBe(200)
    expect(BAR).toContain('const crossfade = reduceMotion ? REVEAL_CROSSFADE_REDUCED_MS : REVEAL_CROSSFADE_MS')
  })

  it('once you both have shown, the strip folds away over 500 ms; under Reduce Motion it fades', () => {
    expect(DM).toContain('const STRIP_FOLD_MS = 500')
    expect(DM).toContain('exiting={reduceMotionNow ? stripFade : stripFold}')
    // Not keyed by state any more: a key would remount the strip on every change instead of crossing each side in place.
    expect(DM).not.toMatch(/<Animated\.View\s+key=\{view\.bar\}/)
  })
})
