/*
 * <StateScreen> and <GlyphWell> (guidelines/components/StateScreen.html): one
 * pattern for empty, failed, refused and system states, inline (56 well) and
 * full screen (80 well, actions docked), read title → body → actions, no
 * haptic of its own.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Dimensions, StyleSheet } from 'react-native'

import { GlyphWell, StateScreen } from '../components/ds/StateScreen'
import { COLOR, MATERIAL, MAX_FONT_SCALE, TYPE } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { AX_XXXL, uncapped } from './helpers/ax'

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

  it('inline, its title is quieter than the screen’s and the section’s headings; a whole screen keeps the title face (r7 M5)', async () => {
    // Room info's "Couldn’t load who’s in this room" sat at 24 pt bold under a 20 pt section heading, louder than the page.
    await render(<StateScreen icon="cloud-off" title="Couldn’t load who’s in this room" body="Check your connection and try again." />)
    const inline = text('Couldn’t load who’s in this room')
    expect(inline).toMatchObject({ fontFamily: TYPE.bodyStrong.fontFamily, fontSize: TYPE.bodyStrong.fontSize })
    expect(inline.fontSize).toBeLessThan(TYPE.heading.fontSize)
    await render(<StateScreen variant="screen" icon="cloud-off" title="Blend’n can’t reach the server" />)
    expect(text('Blend’n can’t reach the server')).toMatchObject({ fontFamily: TYPE.title.fontFamily, fontSize: TYPE.title.fontSize })
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

describe('<StateScreen gutter> (Going’s empty state: the frame’s left 24 / right 24)', () => {
  it('stops the body and the action at the page margins when asked, and adds nothing by default', async () => {
    await render(<StateScreen icon="calendar" title="Nothing here yet" body="Tap the heart." actions={[{ label: 'Browse events', onPress: jest.fn() }]} gutter testID="s" />)
    expect(flat('s')).toMatchObject({ paddingHorizontal: 24 })
    await render(<StateScreen icon="calendar" title="Nothing here yet" testID="s" />)
    expect(flat('s').paddingHorizontal).toBeUndefined()
  })

  it('Going draws both its states with it, 96 pt under the title (the frame: title at 124, state at 260)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'app', '(tabs)', 'going.tsx'), 'utf8') as string
    expect(src.match(/gutter\n\s*testID="going-(empty|failed)"/g)).toHaveLength(2)
    // The 96 pt is the scroll's top padding since the states scroll at the accessibility sizes (RC drive D2).
    expect(src).toMatch(/stateBlock: \{ paddingTop: SPACE\.xxxl \* 2,/)
  })
})

it('balances the title’s wrap on Android, so a two-line title never leaves one word alone', async () => {
  await render(<StateScreen icon="users" title="Meet other crews" body="x" />)
  expect(screen.getByRole('header', { name: 'Meet other crews' }).props.textBreakStrategy).toBe('balanced')
})

describe('at AX XXXL (A21, A25: the title and body pushed the actions off the screen)', () => {
  const window = Dimensions.get('window')
  beforeEach(() => act(async () => Dimensions.set({ window: { ...window, fontScale: AX_XXXL }, screen: { ...window, fontScale: AX_XXXL } })))
  afterEach(() => Dimensions.set({ window, screen: window }))
  const actions = [{ label: 'Try again', onPress: jest.fn() }]

  it('a whole screen: the title at the title cap, the body, its link and the note at their role caps; the actions render', async () => {
    await render(
      <StateScreen
        variant="screen"
        icon="wifi-off"
        title="You’re offline"
        body="Check your connection, or read the help page."
        bodyLink={{ text: 'help page', onPress: jest.fn() }}
        note="Last synced 9:41 PM"
        actions={actions}
        testID="s"
      />
    )
    expect(screen.getByText('You’re offline').props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.title)
    expect(screen.getByText(/Check your connection/).props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.body)
    expect(screen.getByText('Last synced 9:41 PM').props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.meta)
    expect(uncapped(screen.toJSON())).toEqual([])
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('inline, and with a mono note: every line capped at its role', async () => {
    await render(<StateScreen icon="users" title="Nobody here yet" body="When friends check in, they show here." note="ref 8f2c-41aa" noteMono actions={actions} />)
    expect(screen.getByText('Nobody here yet').props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.bodyStrong)
    expect(screen.getByText('ref 8f2c-41aa').props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.caption)
    expect(uncapped(screen.toJSON())).toEqual([])
  })
})
