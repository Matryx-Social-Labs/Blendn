/*
 * <PersonCard> (guidelines/components/PersonCard.html; ROUND3 D · 4.1–4.3, the
 * R3-D4 delta; Flow 15 #18): the L3 sheet for a person from every entry point.
 * Variants a here · b was · d pre · e matched · f friend · g gone · h thin;
 * Wave dock A (SCRUM-1042): Wave (lit, H.select) + Message; Wave back (the filled
 * one) when they waved at you; a still ✓ Waved; mutual is "You both waved" and
 * Say hi only. No person Like anywhere; a crew's "Like for {crew}" is a row.
 * Requested; a refusal line. Message and ⋯ are silent; View profile on all but gone.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Dimensions, Platform, StyleSheet } from 'react-native'

import { PersonCard, PersonCardContent, type PersonCardPerson } from '../components/ds/PersonCard'
import { HueProvider } from '../components/ds/shared'
import * as Reanimated from 'react-native-reanimated'

import { COLOR, FONT_FAMILY, MATERIAL, SIZE, SPRING, TYPE } from '../lib/design/tokens'
import { H } from '../lib/haptics'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return {
    ...actual,
    __esModule: true,
    useReducedMotion: jest.fn(() => false),
    withSpring: jest.fn(actual.withSpring),
  }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} testID="gradient" /> }
})

const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const query = (id: string) => screen.queryByTestId(id, { includeHiddenElements: true })
const text = (t: string | RegExp) => screen.queryByText(t, { includeHiddenElements: true })

const PRIYA: PersonCardPerson = {
  face: { kind: 'photo', uri: 'https://example.com/priya.jpg' },
  name: 'Priya',
  age: 27,
  meta: 'Anonymous · 27',
  lead: [{ icon: 'users', label: 'Here for friends', lit: true }],
  common: { label: 'In common', items: ['Vinyl', 'Techno'] },
}

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
let haptics: Record<string, jest.SpyInstance>
beforeEach(() => {
  on('ios')
  reduceMotion.mockReturnValue(false)
  haptics = Object.fromEntries(Object.keys(H).map((k) => [k, jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {})]))
})
const silent = (except: string[] = []) => {
  for (const [k, spy] of Object.entries(haptics)) if (!except.includes(k)) expect(spy).not.toHaveBeenCalled()
}

const draw = (props: Partial<React.ComponentProps<typeof PersonCardContent>> = {}) =>
  render(
    <PersonCardContent
      person={PRIYA}
      variant="here"
      onWave={jest.fn()}
      onMessage={jest.fn()}
      onSayHi={jest.fn()}
      onMore={jest.fn()}
      onViewProfile={jest.fn()}
      onClose={jest.fn()}
      testID="p"
      {...props}
    />
  )

describe('a · here now (P-A)', () => {
  it('the 72 face, the name and the meta line, read as one head', async () => {
    await draw()
    expect(flat('p-face')).toMatchObject({ width: 72, height: 72 })
    expect(screen.getByLabelText('Priya, Anonymous, 27')).toBeTruthy()
    expect(text('Anonymous · 27')).toBeTruthy()
  })

  it('the lead pills and In common, the shared ones said as shared', async () => {
    await draw()
    expect(text('Here for friends')).toBeTruthy()
    expect(screen.getByLabelText('Techno, shared')).toBeTruthy()
  })

  it('Wave (lit) + Message, two-up; no Like; ⋯ in the head', async () => {
    await render(<HueProvider value="rose"><PersonCardContent person={PRIYA} variant="here" onWave={jest.fn()} onMessage={jest.fn()} testID="p" /></HueProvider>)
    expect(screen.getByRole('button', { name: 'Wave at Priya' })).toBeTruthy()
    expect(JSON.stringify(screen.getByTestId('p-wave', { includeHiddenElements: true }).props.style)).toContain(COLOR.selectionRoseFill)
    expect(screen.getByRole('button', { name: 'Message' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Like/ })).toBeNull()
    expect(screen.queryAllByTestId('gradient', { includeHiddenElements: true })).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Block or report Priya' })).toBeTruthy()
    expect(text('View profile')).toBeNull()
  })

  it('Wave plays H.select and nothing else; Message, ⋯ and the head (their profile) are silent', async () => {
    const calls = { onWave: jest.fn(), onMessage: jest.fn(), onMore: jest.fn(), onViewProfile: jest.fn() }
    await draw(calls)
    for (const name of ['Wave at Priya', 'Message', 'Block or report Priya']) {
      const b = screen.getByRole('button', { name })
      await fireEvent(b, 'pressIn')
      await fireEvent.press(b)
    }
    await fireEvent.press(screen.getByTestId('p-head'))
    expect(haptics.select).toHaveBeenCalledTimes(1)
    silent(['select'])
    for (const fn of Object.values(calls)) expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('the states', () => {
  it('requested: a check and “Requested” in place of Message, and the line says so', async () => {
    await draw({ state: 'requested' })
    expect(screen.queryByRole('button', { name: 'Message' })).toBeNull()
    expect(screen.getByLabelText('Request sent to Priya')).toBeTruthy()
    expect(text('Request sent to Priya. They’ll see your name and photo.')).toBeTruthy()
  })

  it('wave sending: busy, the hand swings, and no second tap', async () => {
    const onWave = jest.fn()
    await draw({ wave: 'sending', onWave })
    const wave = screen.getByRole('button', { name: 'Waving at Priya' })
    expect(wave.props.accessibilityState).toMatchObject({ disabled: true })
    expect(query('p-hand-waving')).toBeTruthy()
    await fireEvent.press(wave)
    expect(onWave).not.toHaveBeenCalled()
  })

  it('waved: a still lit “✓ Waved”, selected, not a button, and never “Wave again”', async () => {
    await draw({ wave: 'waved' })
    expect(screen.queryByRole('button', { name: /Wave/ })).toBeNull()
    expect(text('Wave again')).toBeNull()
    expect(flat('p-waved')).toMatchObject({ backgroundColor: COLOR.selectionEmberFill, borderWidth: 1, borderColor: COLOR.brandOrange })
    expect(screen.getByLabelText('Waved at Priya').props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByRole('button', { name: 'Message' })).toBeTruthy()
  })

  it('waved at you: the chip “Waved at you · 2 min”, and Wave back is the filled one', async () => {
    const onWave = jest.fn()
    await draw({ wave: 'wavedAtYou', wavedAtYou: '2 min', onWave })
    expect(text('Waved at you · 2 min')).toBeTruthy()
    expect(screen.queryAllByTestId('gradient', { includeHiddenElements: true }).length).toBeGreaterThan(0)
    await fireEvent.press(screen.getByRole('button', { name: 'Wave back at Priya' }))
    expect(onWave).toHaveBeenCalledTimes(1)
  })

  it('waved at you with no time known: the chip says “Waved at you”', async () => {
    await draw({ wave: 'wavedAtYou' })
    expect(text('Waved at you')).toBeTruthy()
  })

  it('you both waved: the chip, and Say hi only (Message goes)', async () => {
    const onSayHi = jest.fn()
    await draw({ variant: 'matched', wave: 'mutual', onSayHi })
    expect(text('You both waved')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Message' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Wave/ })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Say hi' }))
    expect(onSayHi).toHaveBeenCalledTimes(1)
  })

  it('a refusal is announced as it arrives, so a screen reader hears why nothing happened', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
    await draw()
    await screen.rerender(
      <PersonCardContent person={PRIYA} variant="here" refusal={{ text: 'That didn’t go through.' }} onWave={jest.fn()} testID="p" />
    )
    expect(announce).toHaveBeenCalledTimes(1)
    expect(announce).toHaveBeenCalledWith('That didn’t go through.')
  })

  it('Waved is said as it lands, once; a card opened already waved says nothing (drive, TalkBack)', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
    await draw({ wave: 'waved' })
    expect(announce).not.toHaveBeenCalled()
    await draw({ wave: 'sending' })
    await screen.rerender(<PersonCardContent person={PRIYA} variant="here" wave="waved" onWave={jest.fn()} testID="p" />)
    expect(announce).toHaveBeenCalledTimes(1)
    expect(announce).toHaveBeenCalledWith('Waved at Priya')
    expect(screen.getByTestId('p-actions').props.accessibilityLiveRegion).toBe('polite')
    announce.mockRestore()
  })

  it('a refusal is one neutral line under the actions, with its action, and no haptic', async () => {
    const onPress = jest.fn()
    await draw({ refusal: { text: 'Check in to wave at people here.', action: { label: 'Check in', onPress } } })
    expect(text('Check in to wave at people here.')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Check in' }))
    expect(onPress).toHaveBeenCalledTimes(1)
    silent()
  })
})

describe('the variants', () => {
  it('b · was here: no new Wave (both must be inside), no Like; “Was here”', async () => {
    await draw({ variant: 'was' })
    expect(screen.queryByRole('button', { name: /Wave/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Like/ })).toBeNull()
    expect(screen.getByLabelText('Priya, Anonymous, 27, was here')).toBeTruthy()
  })

  it('b · was here and waved at you: Wave back still answers it until the room closes', async () => {
    await draw({ variant: 'was', wave: 'wavedAtYou' })
    expect(screen.getByRole('button', { name: 'Wave back at Priya' })).toBeTruthy()
  })

  it('d · pre-event: ⋯ only, with the server’s sentence; no reasons, no Like', async () => {
    await draw({ variant: 'pre' })
    expect(screen.queryByRole('button', { name: 'Like' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Message' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Block or report Priya' })).toBeTruthy()
    expect(query('p-reasons')).toBeNull()
    expect(text('You can only message people from an event you have both attended.')).toBeTruthy()
  })

  it('e · matched: Say hi is the primary and plays H.primary', async () => {
    const onSayHi = jest.fn()
    await draw({ variant: 'matched', onSayHi })
    expect(screen.queryByRole('button', { name: 'Like' })).toBeNull()
    const hi = screen.getByRole('button', { name: 'Say hi' })
    await fireEvent(hi, 'pressIn')
    await fireEvent.press(hi)
    expect(haptics.primary).toHaveBeenCalledTimes(1)
    expect(onSayHi).toHaveBeenCalledTimes(1)
  })

  it('matched and friend: the head says who they are to you, and P-A draws no presence line', async () => {
    await draw({ variant: 'matched' })
    expect(screen.getByLabelText('Priya, Anonymous, 27')).toBeTruthy()
    await draw({ variant: 'friend', here: true })
    expect(screen.getByLabelText('Priya, Anonymous, 27, friend')).toBeTruthy()
  })

  it('f · friend: “Friend”, no Like, Message opens your chat', async () => {
    await draw({ variant: 'friend' })
    expect(text('Friend')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Like' })).toBeNull()
    expect(text('Message opens your chat with Priya.')).toBeTruthy()
  })

  it('g · gone: identical for every cause, Close, no View profile', async () => {
    const onClose = jest.fn()
    await draw({ variant: 'gone', onClose })
    expect(text('This profile isn’t available.')).toBeTruthy()
    expect(text('It may have been removed, or one of you has blocked the other.')).toBeTruthy()
    expect(text('Priya')).toBeNull()
    expect(screen.queryByRole('button', { name: 'View profile' })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('h · thin: the pseudonym, age and city; Message and ⋯; never why', async () => {
    await draw({ variant: 'thin', person: { face: { kind: 'creature', pseudonym: 'Cosmic Panda' }, name: 'Cosmic Panda', age: 27, city: 'Bengaluru', lead: [{ icon: 'users', label: 'x', lit: true }], common: { label: 'In common', items: ['y'] }, tonight: { question: 'q', answer: 'z' } } })
    expect(text('z')).toBeNull()
    expect(text('27 · Bengaluru')).toBeTruthy()
    expect(text('x')).toBeNull()
    expect(text('y')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Like' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Wave/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Message' })).toBeTruthy()
  })
})

it('the hand-drawn controls take the focus ring and, on Android, ripple instead of scaling', async () => {
  await draw()
  const more = screen.getByRole('button', { name: 'Block or report Priya' })
  await fireEvent(more, 'focus')
  expect(query('p-ellipsis-focus')).toBeTruthy()
})

it('the action row stacks at the largest text rather than truncating a label (P-A ax)', async () => {
  const window = Dimensions.get('window')
  await act(async () => Dimensions.set({ window: { ...window, fontScale: 1 }, screen: { ...window, fontScale: 1 } }))
  await draw()
  expect(flat('p-actions')).toMatchObject({ flexDirection: 'row' })
  await act(async () => Dimensions.set({ window: { ...window, fontScale: 3 }, screen: { ...window, fontScale: 3 } }))
  await draw()
  expect(flat('p-actions')).toMatchObject({ flexDirection: 'column' })
  // Drive, Android 2.0: a zero flex-basis in the column collapsed each pill behind its label.
  // The Button's style sits on the view around its pressable.
  const outer = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).parent?.props.style)
  for (const id of ['p-wave', 'p-message']) expect(outer(id)).toMatchObject({ alignSelf: 'stretch' })
  for (const id of ['p-wave', 'p-message']) expect(outer(id).flexBasis).toBeUndefined()
  await act(async () => Dimensions.set({ window, screen: window }))
})

it('Android: the panels are sunken, not 8% white', async () => {
  on('android')
  await draw()
  expect(flat('p-ellipsis').backgroundColor).toBe(COLOR.surfaceSunken)
})

it('<PersonCard> presents it in the sheet, with no title of its own', async () => {
  await render(
    <PersonCard
      visible
      onClose={jest.fn()}
      person={PRIYA}
      variant="here"
      onWave={jest.fn()}
      onMessage={jest.fn()}
      onSayHi={jest.fn()}
      onMore={jest.fn()}
      onViewProfile={jest.fn()}
      testID="s"
    />
  )
  await act(async () => {})
  expect(screen.getByTestId('s-modal', { includeHiddenElements: true }).props.visible).toBe(true)
  expect(screen.getByLabelText('Priya, Anonymous, 27')).toBeTruthy()
})

it('<PersonCard> sends a screen reader to the person, not the handle, as it opens', async () => {
  const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {})
  await render(<PersonCard visible onClose={jest.fn()} person={PRIYA} variant="here" testID="s" />)
  await act(async () => {})
  await fireEvent(screen.getByTestId('s-modal', { includeHiddenElements: true }), 'show')
  expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus')
})

it('<PersonCard>: the unavailable card’s Close closes the sheet', async () => {
  const onClose = jest.fn()
  await render(<PersonCard visible onClose={onClose} person={PRIYA} variant="gone" testID="s" />)
  await act(async () => {})
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }))
  expect(onClose).toHaveBeenCalledTimes(1)
})

describe('Flow 4: the room’s card (R2-D1, R3-D4, #51)', () => {
  it('a wave on its way: the hand swings ±14° three times (07-motion), never a spinner, and is busy', async () => {
    await draw({ wave: 'sending', testID: 'c' })
    expect(query('c-hand-waving')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Waving at Priya' }).props.accessibilityState).toMatchObject({ disabled: true })
    silent()
  })

  it('Reduce Motion: the hand stays still while the wave goes', async () => {
    reduceMotion.mockReturnValue(true)
    await draw({ wave: 'sending', testID: 'c' })
    expect(Reanimated.getAnimatedStyle(screen.getByTestId('c-hand-waving', { includeHiddenElements: true })).transform).toEqual([{ rotate: '0deg' }])
  })

  it('requested and waved are each their own: one never hides another', async () => {
    await draw({ requested: true, wave: 'waved', testID: 'c' })
    expect(query('c-waved')).toBeTruthy()
    expect(screen.getByLabelText('Request sent to Priya')).toBeTruthy()
  })

  it('Message says what it costs to a screen reader', async () => {
    await draw({ testID: 'c' })
    expect(screen.getByRole('button', { name: 'Message' }).props.accessibilityHint).toBe('Sends a request, which shows them your name and photo.')
  })

  it('a crew here: a "Like for Nebula" row under the dock (H.like), the dock only Wave + Message, and who they see', async () => {
    const crewLike = jest.fn()
    await draw({ crewLike: { name: 'Nebula', emblemSeed: 'nebula', onPress: crewLike }, testID: 'c' })
    await fireEvent.press(screen.getByRole('button', { name: 'Like for Nebula' }))
    expect(crewLike).toHaveBeenCalledTimes(1)
    expect(haptics.like).toHaveBeenCalledTimes(1)
    expect(text('A crew like is shown to Priya as Nebula, never as you.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Like as yourself' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Wave at Priya' })).toBeTruthy()
  })

  it('several crews may like: "Like for your crew"', async () => {
    await draw({ crewLike: { name: 'your crew', onPress: jest.fn() }, testID: 'c' })
    expect(screen.getByRole('button', { name: 'Like for your crew' })).toBeTruthy()
  })

  it('once you both waved, no crew like is offered', async () => {
    await draw({ variant: 'matched', wave: 'mutual', crewLike: { name: 'Nebula', emblemSeed: 'nebula', onPress: jest.fn() }, testID: 'c' })
    expect(screen.queryByRole('button', { name: 'Like for Nebula' })).toBeNull()
  })
})

describe('the action row is one height (M4)', () => {
  it('Message is the board’s quiet .db.q (fill-on-glass), visible on Android’s solid sheet too', async () => {
    on('android')
    await draw()
    // Drive, Android: a plain secondary is COLOR.surface, the solid sheet's own colour, and the pill vanished.
    for (const id of ['p-message']) expect(JSON.stringify(screen.getByTestId(id, { includeHiddenElements: true }).props.style)).toContain(MATERIAL.fillOnGlass)
  })

  it('Wave and Message are 52 (the board’s .db), and so is ✓ Waved; ⋯ is a 44 target', async () => {
    await draw({ onWave: jest.fn(), onMore: jest.fn() })
    for (const id of ['p-message', 'p-wave']) expect(flat(id).height).toBe(SIZE.tabBarCompact)
    await draw({ wave: 'waved' })
    expect(flat('p-waved').height).toBe(SIZE.tabBarCompact)
    await draw({ onMore: jest.fn() })
    expect(flat('p-ellipsis').height).toBe(SIZE.targetIos)
  })

  it('under rose, ✓ Waved lights in rose', async () => {
    await render(
      <HueProvider value="rose">
        <PersonCardContent person={PRIYA} variant="here" wave="waved" testID="p" />
      </HueProvider>
    )
    expect(flat('p-waved').backgroundColor).toBe(COLOR.selectionRoseFill)
  })
})
