/*
 * The five moments (guidelines/components/Moment*.html, DESIGN-BRIEF §9.3 #9
 * and #11, motion #43, Flow 2's celebration, Flow 10's It's a Blend). L4:
 * full screen, skippable, a celebration spent once, Reduce Motion a
 * crossfade in place with the same haptic.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import DsP5Preview from '../app/preview/ds-p5'
import { MomentBlend, type MomentBlendProps } from '../components/ds/MomentBlend'
import { MomentMatch, type MomentMatchProps } from '../components/ds/MomentMatch'
import { ASK_AT, MomentPour, PANEL_TOP, ROOM_AT } from '../components/ds/MomentPour'
import { MomentReady } from '../components/ds/MomentReady'
import { MomentRecap, type MomentRecapProps } from '../components/ds/MomentRecap'
import { COLOR, DURATION, MATERIAL, RADIUS, SPACE, SPRING } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { markOffline, markOnline } from '../lib/networkStatus'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false), withSpring: jest.fn(actual.withSpring) }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return {
    GlassView: (props: object) => <View {...props} />,
    isGlassEffectAPIAvailable: jest.fn(() => true),
    isLiquidGlassAvailable: jest.fn(() => true),
  }
})

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const withSpring = Reanimated.withSpring as jest.Mock
const HIDDEN = { includeHiddenElements: true }
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, HIDDEN).props.style)
const advance = (ms: number) => act(async () => jest.advanceTimersByTime(ms))
const sprungWith = (spring: keyof typeof SPRING) => withSpring.mock.calls.some((c) => c[1]?.stiffness === SPRING[spring].stiffness)

let haptic: Record<'match' | 'success' | 'primary', jest.SpyInstance>
let announce: jest.SpyInstance
let screenReader: jest.SpyInstance
beforeEach(() => {
  jest.useFakeTimers()
  reduceMotion.mockReturnValue(false)
  haptic = {
    match: jest.spyOn(H, 'match').mockImplementation(() => {}),
    success: jest.spyOn(H, 'success').mockImplementation(() => {}),
    primary: jest.spyOn(H, 'primary').mockImplementation(() => {}),
  }
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => {})
  screenReader = jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false)
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false)
  jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(false)
})
afterEach(() => jest.useRealTimers())

const PHOTO = 'https://example.com/me.jpg'

function match(props: Partial<MomentMatchProps> = {}) {
  const p: MomentMatchProps = {
    you: { kind: 'photo', uri: PHOTO },
    them: { kind: 'creature', pseudonym: 'Velvet Heron' },
    name: 'Velvet Heron',
    reason: 'Both into live music',
    opener: 'Which set are you here for?',
    onSayHi: jest.fn(),
    onClose: jest.fn(),
    testID: 'm',
    ...props,
  }
  return { p, el: <MomentMatch {...p} /> }
}

describe('<MomentMatch> · It’s mutual (#11, ROUND3 D · 4.4)', () => {
  it('says it, with why and the opener, then Say hi and Keep looking', async () => {
    const { p, el } = match()
    await render(el)
    expect(screen.getByText('It’s mutual')).toBeTruthy()
    expect(screen.getByText('You and Velvet Heron matched · Both into live music')).toBeTruthy()
    expect(screen.getByText('TRY')).toBeTruthy()
    expect(screen.getByText('“Which set are you here for?”')).toBeTruthy()
    await advance(1260)
    await fireEvent.press(screen.getByRole('button', { name: 'Say hi' }))
    expect(p.onSayHi).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Keep looking' }))
    expect(p.onClose).toHaveBeenCalledTimes(1)
  })

  it('is announced once, everything in it from t0', async () => {
    await render(match().el)
    expect(announce).toHaveBeenCalledTimes(1)
    expect(announce).toHaveBeenCalledWith('It’s mutual. You and Velvet Heron matched, Both into live music. Try: Which set are you here for?', { queue: true })
  })

  it.each([
    ['photo · photo', { kind: 'photo', uri: PHOTO }, { kind: 'photo', uri: PHOTO }, true],
    ['photo · creature', { kind: 'photo', uri: PHOTO }, { kind: 'creature', pseudonym: 'Velvet Heron' }, false],
    ['creature · creature', { kind: 'creature', pseudonym: 'Cosmic Panda' }, { kind: 'creature', pseudonym: 'Velvet Heron' }, false],
  ] as const)('%s: never shows a face either person hid', async (_, you, them, theirPhoto) => {
    await render(match({ you, them }).el)
    expect(!!screen.queryByTestId('m-them-body', HIDDEN)).toBe(theirPhoto)
  })

  it('the faces meet on M.pop, three hearts arc, and H.match lands on the frame the bump does', async () => {
    await render(match().el)
    expect(sprungWith('pop')).toBe(true)
    expect(screen.getAllByTestId(/^m-heart-/, HIDDEN)).toHaveLength(3)
    await advance(999)
    expect(haptic.match).not.toHaveBeenCalled()
    await advance(1)
    expect(haptic.match).toHaveBeenCalledTimes(1)
    await advance(5000)
    expect(haptic.match).toHaveBeenCalledTimes(1)
  })

  it('a tap anywhere skips to the end: the haptic still lands, once', async () => {
    await render(match().el)
    await advance(300)
    await fireEvent.press(screen.getByTestId('m-skip', HIDDEN))
    expect(haptic.match).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('m-actions', HIDDEN).props.pointerEvents).toBe('box-none')
    await advance(5000)
    expect(haptic.match).toHaveBeenCalledTimes(1)
  })

  it('Say hi is tappable once fully shown (1100 + 160 ms); with a screen reader, from t0', async () => {
    await render(match().el)
    await advance(1259)
    expect(screen.getByTestId('m-actions', HIDDEN).props.pointerEvents).toBe('none')
    await advance(1)
    expect(screen.getByTestId('m-actions', HIDDEN).props.pointerEvents).toBe('box-none')
    screenReader.mockResolvedValue(true)
    await screen.unmount() // one Modal on screen at a time (lib/modalTurn): the first goes before the next
    await render(match().el)
    await act(async () => {})
    expect(screen.getByTestId('m-actions', HIDDEN).props.pointerEvents).toBe('box-none')
  })

  it('Reduce Motion: the faces placed, no hearts, H.match at once', async () => {
    reduceMotion.mockReturnValue(true)
    await render(match().el)
    expect(sprungWith('pop')).toBe(false)
    expect(screen.queryAllByTestId(/^m-heart-/, HIDDEN)).toHaveLength(0)
    await advance(0)
    expect(haptic.match).toHaveBeenCalledTimes(1)
  })

  it('system back is Keep looking, and the haptic still lands (once)', async () => {
    const { p, el } = match()
    await render(el)
    await act(async () => screen.getByTestId('m-modal', HIDDEN).props.onRequestClose())
    expect(p.onClose).toHaveBeenCalledTimes(1)
    expect(haptic.match).toHaveBeenCalledTimes(1)
  })

  it('a tap on the faces or the words skips: nothing over the skip area but the buttons is a hit target', async () => {
    await render(match().el)
    expect(screen.getByTestId('m-faces', HIDDEN).props.pointerEvents).toBe('none')
    expect(screen.getByTestId('m-copy', HIDDEN).props.pointerEvents).toBe('none')
  })

  it('Reduce Transparency makes the scrim opaque; Increase Contrast lifts the line and rings the opener', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(true)
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await render(match().el)
    await act(async () => {})
    expect(flat('m-scrim').backgroundColor).toBe(COLOR.ink)
    expect(flat('m-why').color).toBe(COLOR.textPrimary)
    expect(flat('m-opener')).toMatchObject({ borderColor: MATERIAL.hairlineIncreaseContrast })
  })
})

function blend(props: Partial<MomentBlendProps> = {}) {
  const p = {
    ours: { kind: 'crew', name: 'Nebula', emblemSeed: 'nebula', count: 3 },
    theirs: { kind: 'crew', name: 'Orbit', emblemSeed: 'orbit', count: 4 },
    facets: ['Dance floor', 'Friendship'],
    yourLike: true,
    onOpen: jest.fn(),
    onLater: jest.fn(),
    testID: 'b',
    ...props,
  } as MomentBlendProps
  return { p, el: <MomentBlend {...p} /> }
}

describe('<MomentBlend> · It’s a Blend (Flow 10.8, §21.5)', () => {
  it('crew × crew: the counts, nobody named, the shared facets, Open the Blend and Later', async () => {
    const { p, el } = blend()
    await render(el)
    expect(screen.getByText('It’s a Blend')).toBeTruthy()
    expect(screen.getByText('Nebula + Orbit · 3 + 4 people')).toBeTruthy()
    expect(screen.getByText('Nobody’s named yet. Everyone’s on tonight’s names until your crew chooses to reveal.')).toBeTruthy()
    expect(screen.getByText('You both: Dance floor · Friendship')).toBeTruthy()
    expect(announce).toHaveBeenCalledWith('It’s a Blend. Nebula and Orbit, 7 people.', { queue: true })
    await advance(1200)
    await fireEvent.press(screen.getByRole('button', { name: 'Open the Blend' }))
    expect(p.onOpen).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Later' }))
    expect(p.onLater).toHaveBeenCalledTimes(1)
  })

  it('crew × person, from the crew’s side: “one more”', async () => {
    await render(blend({ theirs: { kind: 'person', pseudonym: 'Quiet Heron' } }).el)
    expect(screen.getByText('Nebula + one more · 3 + 1 people')).toBeTruthy()
  })

  it('person × crew, from the person’s side: no facet line (yours is people data)', async () => {
    await render(blend({ ours: { kind: 'person', pseudonym: 'Cosmic Panda' }, theirs: { kind: 'crew', name: 'Nebula', emblemSeed: 'nebula', count: 3 } }).el)
    expect(screen.getByText('You + Nebula · 1 + 3 people')).toBeTruthy()
    expect(screen.queryByText(/You both/)).toBeNull()
  })

  it('the emblems interlock on M.pop; H.match on landing for the person whose like made it', async () => {
    await render(blend().el)
    expect(sprungWith('pop')).toBe(true)
    await advance(619)
    expect(haptic.match).not.toHaveBeenCalled()
    await advance(1)
    expect(haptic.match).toHaveBeenCalledTimes(1)
  })

  it('seen later (someone else’s like): no haptic, ever', async () => {
    await render(blend({ yourLike: false }).el)
    await advance(5000)
    await fireEvent.press(screen.getByTestId('b-skip', HIDDEN))
    expect(haptic.match).not.toHaveBeenCalled()
  })

  it('Reduce Motion: the emblems fade in place, H.match unchanged', async () => {
    reduceMotion.mockReturnValue(true)
    await render(blend().el)
    expect(sprungWith('pop')).toBe(false)
    await advance(0)
    expect(haptic.match).toHaveBeenCalledTimes(1)
  })

  it('system back is Later', async () => {
    const { p, el } = blend()
    await render(el)
    await act(async () => screen.getByTestId('b-modal', HIDDEN).props.onRequestClose())
    expect(p.onLater).toHaveBeenCalledTimes(1)
  })

  it('a tap on the emblems or the words skips; the buttons go live once fully shown', async () => {
    await render(blend().el)
    expect(screen.getByTestId('b-art', HIDDEN).props.pointerEvents).toBe('none')
    expect(screen.getByTestId('b-copy', HIDDEN).props.pointerEvents).toBe('none')
    await advance(820)
    expect(screen.getByTestId('b-actions', HIDDEN).props.pointerEvents).toBe('none')
    await advance(220)
    expect(screen.getByTestId('b-actions', HIDDEN).props.pointerEvents).toBe('box-none')
  })
})

describe('<MomentReady> · the one celebration (Flow 2)', () => {
  it('the mark assembles on M.pop; H.success once as it completes; done at 1.3 s', async () => {
    const onDone = jest.fn()
    await render(<MomentReady name="Sam" onDone={onDone} testID="r" />)
    expect(sprungWith('pop')).toBe(true)
    expect(announce).toHaveBeenCalledWith('You’re all set, Sam.', { queue: true })
    await advance(529)
    expect(haptic.success).not.toHaveBeenCalled()
    await advance(1)
    expect(haptic.success).toHaveBeenCalledWith({ important: true })
    await advance(769)
    expect(onDone).not.toHaveBeenCalled()
    await advance(1)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(haptic.success).toHaveBeenCalledTimes(1)
  })

  it('a tap on the mark skips (it is not a hit target)', async () => {
    await render(<MomentReady onDone={jest.fn()} testID="r" />)
    expect(screen.getByTestId('r-centre', HIDDEN).props.pointerEvents).toBe('none')
  })

  it('tap to skip: the haptic and the hand-off now, once each', async () => {
    const onDone = jest.fn()
    await render(<MomentReady onDone={onDone} testID="r" />)
    await fireEvent.press(screen.getByRole('button', { name: 'Skip' }))
    expect(haptic.success).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledTimes(1)
    await advance(5000)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('Reduce Motion: the mark fades in, the orbs hold, the haptic at once', async () => {
    reduceMotion.mockReturnValue(true)
    const onDone = jest.fn()
    await render(<MomentReady onDone={onDone} testID="r" />)
    expect(sprungWith('pop')).toBe(false)
    await advance(0)
    expect(haptic.success).toHaveBeenCalledTimes(1)
    await advance(500)
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})

describe('<MomentPour> · the check-in success (motion #9)', () => {
  const pour = (props: { ready?: boolean; asks?: boolean } = {}) => <MomentPour venue="Toit" onDone={onDone} testID="p" {...props} />
  let onDone: jest.Mock
  beforeEach(() => {
    onDone = jest.fn()
  })

  it('draws the pass as #9 does: a panel under the top bar, the venue top left, “You’re in.” bottom left', async () => {
    // A phone with a notch and a home indicator: the panel sits inside them.
    const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, bottom: 34, left: 0, right: 0 } }
    await render(<SafeAreaProvider initialMetrics={metrics}>{pour()}</SafeAreaProvider>)
    // Inset 12 at the sides, 40 under the top inset, 24 over the bottom one; radius 24; the surface; the flood kept inside.
    expect(flat('p-panel')).toMatchObject({
      position: 'absolute',
      left: SPACE.md,
      right: SPACE.md,
      top: 59 + PANEL_TOP,
      bottom: 34 + SPACE.xl,
      borderRadius: RADIUS.sheet,
      backgroundColor: COLOR.surface,
      overflow: 'hidden',
    })
    expect(SPACE.md).toBe(12)
    expect(PANEL_TOP).toBe(40)
    expect(SPACE.xl).toBe(24)
    expect(RADIUS.sheet).toBe(24)
    // The flood is the panel's, not the screen's.
    const panel = screen.getByTestId('p-panel', HIDDEN)
    expect(within(panel).getByTestId('p-flood', HIDDEN)).toBeTruthy()
    expect(flat('p-venue')).toMatchObject({ position: 'absolute', left: 16, top: 16, fontSize: 20, lineHeight: 26 })
    expect(flat('p-youre-in')).toMatchObject({ position: 'absolute', left: 16, right: 16, bottom: 24, fontSize: 28, lineHeight: 32, letterSpacing: -0.8, fontFamily: 'Satoshi_900Black' })
    expect(flat('p-youre-in').top).toBeUndefined()
    expect(within(panel).getByText('Toit')).toBeTruthy()
    expect(within(panel).getByText('You’re in.')).toBeTruthy()
    expect(announce).toHaveBeenCalledWith('You’re in. Toit.', { queue: true })
  })

  it('on the Tonight door it fills the docked pass exactly: the flood in its bounds, “You’re in.” at its bottom left', async () => {
    // Flow 4 delta R2-D1 "success": the pass docked 12 in at the bottom, 234 tall.
    const pass = { x: 12, y: 584, width: 369, height: 234 }
    await render(<MomentPour venue="Toit" onDone={onDone} testID="p" frame={pass} />)
    expect(flat('p-panel')).toMatchObject({ position: 'absolute', left: 12, top: 584, width: 369, height: 234, borderRadius: RADIUS.sheet, overflow: 'hidden' })
    expect(flat('p-panel').right).toBeUndefined()
    expect(flat('p-panel').bottom).toBeUndefined()
    const panel = screen.getByTestId('p-panel', HIDDEN)
    expect(within(panel).getByTestId('p-flood', HIDDEN)).toBeTruthy()
    expect(flat('p-flood')).toMatchObject({ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 })
    expect(flat('p-youre-in')).toMatchObject({ left: 16, bottom: 24 })
    expect(flat('p-venue')).toMatchObject({ left: 16, top: 16 })
  })

  it('H.success once on the server’s answer, the flood on M.settle, the Room at 700 ms', async () => {
    await render(pour())
    expect(sprungWith('settle')).toBe(true)
    await advance(0)
    expect(haptic.success).toHaveBeenCalledWith({ important: true })
    await advance(699)
    expect(onDone).not.toHaveBeenCalled()
    await advance(1)
    expect(onDone).toHaveBeenCalledTimes(1)
    await advance(1000)
    expect(haptic.success).toHaveBeenCalledTimes(1)
    // It has handed off: every touch goes through to the Room, and the screen reader no longer finds it.
    const stage = screen.getByTestId('p', HIDDEN)
    expect(stage.props.pointerEvents).toBe('none')
    expect(stage.props.accessibilityElementsHidden).toBe(true)
  })

  it('before a question it plays out: “You’re in.” held to ASK_AT, then onDone only after the fade’s D.base', async () => {
    await render(pour({ asks: true }))
    await advance(ROOM_AT)
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByTestId('p', HIDDEN).props.pointerEvents).toBe('auto')
    await advance(ASK_AT - ROOM_AT)
    // The fade has begun (it lets touches through) but the question waits for its end.
    expect(screen.getByTestId('p', HIDDEN).props.pointerEvents).toBe('none')
    expect(onDone).not.toHaveBeenCalled()
    await advance(DURATION.base - 1)
    expect(onDone).not.toHaveBeenCalled()
    await advance(1)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(haptic.success).toHaveBeenCalledTimes(1)
  })

  it('Reduce Motion: the same order and hold before a question, a 200 ms crossfade, the haptic kept', async () => {
    reduceMotion.mockReturnValue(true)
    await render(pour({ asks: true }))
    await advance(0)
    expect(haptic.success).toHaveBeenCalledTimes(1)
    await advance(ASK_AT)
    await advance(199)
    expect(onDone).not.toHaveBeenCalled()
    await advance(1)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('ASK_AT holds “You’re in.” about a second after it is fully shown', () => {
    expect(ASK_AT).toBe(1600)
    expect(ROOM_AT).toBe(700)
  })

  it('a pour unmounted mid-fade asks nothing of a screen that is gone', async () => {
    const view = await render(pour({ asks: true }))
    await advance(ASK_AT)
    await view.unmount()
    await advance(1000)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('a skip during the fade before a question hands off once', async () => {
    await render(pour({ asks: true }))
    await advance(ASK_AT)
    await fireEvent.press(screen.getByTestId('p-skip', HIDDEN))
    await advance(1000)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('whether a question follows is read once, at mount: a later asks={false} does not move the hold', async () => {
    const view = await render(pour({ asks: true }))
    await view.rerender(pour({ asks: false }))
    await advance(ROOM_AT)
    expect(onDone).not.toHaveBeenCalled()
    await advance(ASK_AT - ROOM_AT)
    await advance(1000)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('holds, filled, until the Room is there to hand off to', async () => {
    const view = await render(pour({ ready: false }))
    await advance(3000)
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByTestId('p', HIDDEN).props.pointerEvents).toBe('auto')
    await view.rerender(pour({ ready: true }))
    await advance(0)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('a tap skips to the hand-off, ready or not', async () => {
    await render(pour({ ready: false }))
    await fireEvent.press(screen.getByTestId('p-skip', HIDDEN))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(haptic.success).toHaveBeenCalledTimes(1)
    await advance(1000)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('Reduce Motion: a crossfade to the filled state, the same haptic and hand-off', async () => {
    reduceMotion.mockReturnValue(true)
    await render(pour())
    expect(sprungWith('settle')).toBe(false)
    await advance(700)
    expect(haptic.success).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})

function recap(props: Partial<MomentRecapProps> = {}) {
  const p: MomentRecapProps = {
    face: { kind: 'photo', uri: PHOTO },
    title: 'Vinyl Night',
    venue: 'Toit',
    minutes: 135,
    matches: 2,
    rated: false,
    onRate: jest.fn(),
    onBack: jest.fn(),
    onClose: jest.fn(),
    testID: 'w',
    ...props,
  }
  return { p, el: <MomentRecap {...p} /> }
}

describe('<MomentRecap> · That’s a wrap (#43)', () => {
  it('two numbers, already set, and the one thing left to do', async () => {
    const { p, el } = recap()
    await render(el)
    expect(screen.getByText('IT’S OVER')).toBeTruthy()
    expect(screen.getByText('That’s a wrap')).toBeTruthy()
    expect(screen.getByText('Vinyl Night · Toit')).toBeTruthy()
    expect(screen.getByLabelText('In the room, 2 hours 15 minutes')).toBeTruthy()
    expect(screen.getByText('2h 15m')).toBeTruthy()
    expect(screen.getByLabelText('Matches, 2')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Rate who you met' }))
    expect(p.onRate).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Back to tonight' }))
    expect(p.onBack).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }))
    expect(p.onClose).toHaveBeenCalledTimes(1)
    expect(announce).toHaveBeenCalledWith('That’s a wrap. Vinyl Night, Toit.', { queue: true })
    // No haptic on open.
    expect(haptic.success).not.toHaveBeenCalled()
    expect(haptic.match).not.toHaveBeenCalled()
  })

  it('no matches: Rate the night', async () => {
    await render(recap({ matches: 0 }).el)
    expect(screen.getByRole('button', { name: 'Rate the night' })).toBeTruthy()
  })

  it('rated: thanks once, and nothing else to do', async () => {
    await render(recap({ rated: true }).el)
    expect(screen.getByText('You rated this night. Thanks.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Rate/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Back to tonight' })).toBeTruthy()
  })

  it('R3: People from tonight sits between Rate and Back, and is absent without a deck', async () => {
    await render(recap().el)
    expect(screen.queryByRole('button', { name: 'People from tonight' })).toBeNull()
    const onPeople = jest.fn()
    await render(recap({ onPeople }).el)
    await fireEvent.press(screen.getByRole('button', { name: 'People from tonight' }))
    expect(onPeople).toHaveBeenCalledTimes(1)
    const order = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)
    expect(order.indexOf('People from tonight')).toBeGreaterThan(order.indexOf('Rate who you met'))
    expect(order.indexOf('People from tonight')).toBeLessThan(order.indexOf('Back to tonight'))
  })

  it('R6: offline, the page keeps what it had and says so; online, no banner', async () => {
    await render(recap().el)
    expect(screen.queryByTestId('w-offline', HIDDEN)).toBeNull()
    await act(async () => markOffline())
    expect(screen.getByText('Offline. Showing what loaded last.')).toBeTruthy()
    // Reads stay: the night and both actions are still there.
    expect(screen.getByText('That’s a wrap')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back to tonight' })).toBeTruthy()
    await act(async () => markOnline())
    expect(screen.queryByText('Offline. Showing what loaded last.')).toBeNull()
  })

  it('no photo: the creature; no check-in time: no time tile', async () => {
    await render(recap({ face: { kind: 'creature', pseudonym: 'Cosmic Panda' }, minutes: null }).el)
    expect(screen.queryByTestId('w-face-body', HIDDEN)).toBeNull()
    expect(screen.queryByLabelText(/In the room/)).toBeNull()
  })

  it('#43: the title rises 8 pt as it fades; Reduce Motion fades only', async () => {
    await render(recap().el)
    expect(flat('w-block-0').transform).toEqual([{ translateY: 8 }])
    reduceMotion.mockReturnValue(true)
    await render(recap().el)
    expect(flat('w-block-0').transform).toEqual([{ translateY: 0 }])
  })
})

describe('/preview/ds-p5', () => {
  it('replays every moment on demand', async () => {
    // Still orbs: a gallery of drifting ones would run the fake clock frame by frame.
    reduceMotion.mockReturnValue(true)
    await render(<DsP5Preview />)
    for (const [button, moment] of [
      ['ds-play-match-photo-photo', 'ds-moment-match'],
      ['ds-play-match-creature-creature', 'ds-moment-match'],
      ['ds-play-blend-cc', 'ds-moment-blend'],
      ['ds-play-blend-cpPerson', 'ds-moment-blend'],
      ['ds-play-ready', 'ds-moment-ready'],
      ['ds-play-pour', 'ds-moment-pour'],
      ['ds-play-pour-held', 'ds-moment-pour'],
      ['ds-play-pour-asks', 'ds-moment-pour'],
      ['ds-play-pour-pass', 'ds-moment-pour'],
    ]) {
      await fireEvent.press(screen.getByTestId(button))
      expect(screen.getByTestId(moment, HIDDEN)).toBeTruthy()
      await advance(1000)
    }
    expect(screen.getByTestId('ds-recap-rated', HIDDEN)).toBeTruthy()
    expect(screen.getByTestId('ds-orbs-feed-late', HIDDEN)).toBeTruthy()
    expect(screen.getByTestId('ds-emblem-orbit-field', HIDDEN)).toBeTruthy()
  })
})
