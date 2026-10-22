/*
 * <PersonCard> (guidelines/components/PersonCard.html; ROUND3 D · 4.1–4.3, the
 * R3-D4 delta; Flow 15 #18): the L3 sheet for a person from every entry point.
 * Variants a here · b was · d pre · e matched · f friend · g gone · h thin;
 * states liked · requested · wave sending · waved (still, with the word);
 * waved at you; a refusal line. Like is the gradient primary (H.like); Say hi
 * is H.primary; Wave, Message and ⋯ are silent; View profile on all but gone.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'

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
  reason: 'Both open to dating',
  reasons: ['Both open to dating', 'Both at 3 nights before'],
  chips: ['Vinyl', 'Techno'],
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
      onLike={jest.fn()}
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

describe('a · here now', () => {
  it('the 112 face, the name with the age in Geist Mono, why, and “Here now”, read as one', async () => {
    await draw()
    expect(flat('p-face')).toMatchObject({ width: 112, height: 112 })
    expect(StyleSheet.flatten(text('27')!.props.style)).toMatchObject({ fontFamily: FONT_FAMILY.mono[700], fontSize: TYPE.title.fontSize })
    expect(screen.getByLabelText('Priya, 27, Both open to dating, here now')).toBeTruthy()
    expect(flat('p-presence-dot').backgroundColor).toBe(COLOR.live)
  })

  it('the reasons panel and the chips', async () => {
    await draw()
    expect(text('Both at 3 nights before')).toBeTruthy()
    expect(flat('p-reasons').backgroundColor).toBe(MATERIAL.fillOnGlass)
    expect(text('Techno')).toBeTruthy()
  })

  it('Like (the gradient primary) · Wave · Message · ⋯, the consequence, View profile', async () => {
    await draw()
    const like = screen.getByRole('button', { name: 'Like' })
    expect(screen.getAllByTestId('gradient', { includeHiddenElements: true }).length).toBeGreaterThan(0)
    expect(like.props.accessibilityHint).toBe('They’re only told if they like you back.')
    expect(screen.getByRole('button', { name: 'Wave at Priya' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Message' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Block or report Priya' })).toBeTruthy()
    expect(text('Message sends a request and reveals you to Priya.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'View profile' })).toBeTruthy()
  })

  it('Like plays H.like and nothing else; Wave, Message, ⋯ and View profile are silent', async () => {
    const calls = { onLike: jest.fn(), onWave: jest.fn(), onMessage: jest.fn(), onMore: jest.fn(), onViewProfile: jest.fn() }
    await draw(calls)
    const like = screen.getByRole('button', { name: 'Like' })
    await fireEvent(like, 'pressIn')
    await fireEvent.press(like)
    expect(haptics.like).toHaveBeenCalledTimes(1)
    for (const name of ['Wave at Priya', 'Message', 'Block or report Priya', 'View profile']) {
      const b = screen.getByRole('button', { name })
      await fireEvent(b, 'pressIn')
      await fireEvent.press(b)
    }
    silent(['like'])
    for (const fn of Object.values(calls)) expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('the states', () => {
  it('liked: a lit “Liked” (direction C: no white selection), selected, still: no second H.like', async () => {
    const onLike = jest.fn()
    await draw({ state: 'liked', onLike })
    const liked = screen.getByRole('button', { name: 'Liked' })
    expect(liked.props.accessibilityState).toMatchObject({ selected: true })
    expect(flat('p-liked')).toMatchObject({ backgroundColor: COLOR.selectionEmberFill, borderWidth: 1, borderColor: COLOR.brandOrange, height: SIZE.control })
    expect(StyleSheet.flatten(text('Liked')!.props.style).color).toBe(COLOR.textPrimary)
    await fireEvent.press(liked)
    expect(onLike).not.toHaveBeenCalled()
    silent()
  })

  it('#15: Liked pops in, 0.85 → 1 on M.pop; Reduce Motion places it', async () => {
    const card = (state: 'none' | 'liked') => <PersonCardContent person={PRIYA} variant="here" state={state} testID="p" />
    await render(card('none'))
    jest.mocked(Reanimated.withSpring).mockClear()
    await screen.rerender(card('liked'))
    expect(Reanimated.withSpring).toHaveBeenCalledWith(1, expect.objectContaining({ stiffness: SPRING.pop.stiffness }))
    reduceMotion.mockReturnValue(true)
    await render(card('none'))
    jest.mocked(Reanimated.withSpring).mockClear()
    await screen.rerender(card('liked'))
    expect(Reanimated.withSpring).not.toHaveBeenCalledWith(1, expect.objectContaining({ stiffness: SPRING.pop.stiffness }))
  })

  it('requested: a check and “Requested” in place of Message, and the line says so', async () => {
    await draw({ state: 'requested' })
    expect(screen.queryByRole('button', { name: 'Message' })).toBeNull()
    expect(screen.getByLabelText('Request sent to Priya')).toBeTruthy()
    expect(text('Request sent to Priya. They’ll see your name and photo.')).toBeTruthy()
  })

  it('wave sending: the circle is busy and takes no second tap', async () => {
    const onWave = jest.fn()
    await draw({ state: 'waveBusy', onWave })
    const wave = screen.getByRole('button', { name: 'Wave at Priya' })
    expect(wave.props.accessibilityState).toMatchObject({ busy: true, disabled: true })
    await fireEvent.press(wave)
    expect(onWave).not.toHaveBeenCalled()
  })

  it('waved: the label settles to a still lit “Waved” with a check (R3-D4 12, 15), selected, not a dimmed button', async () => {
    await draw({ state: 'waved' })
    expect(screen.queryByRole('button', { name: /Wave/ })).toBeNull()
    expect(StyleSheet.flatten(text('Waved')!.props.style).color).toBe(COLOR.textPrimary)
    expect(flat('p-waved')).toMatchObject({ backgroundColor: COLOR.selectionEmberFill, borderWidth: 1, borderColor: COLOR.brandOrange })
    expect(screen.getByLabelText('Waved').props.accessibilityState).toMatchObject({ selected: true })
    expect(text('Waved. Message sends a request and reveals you to Priya.')).toBeTruthy()
  })

  it('waved at you: the still chip, and the button reads Wave back', async () => {
    const onWave = jest.fn()
    await draw({ wavedAtYou: '2 min', onWave })
    expect(text('Waved at you · 2 min')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Wave back at Priya' }))
    expect(onWave).toHaveBeenCalledTimes(1)
    silent()
  })

  it('a refusal is announced as it arrives, so a screen reader hears why nothing happened', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
    await draw()
    await screen.rerender(
      <PersonCardContent person={PRIYA} variant="here" refusal={{ text: 'That didn’t go through.' }} onLike={jest.fn()} testID="p" />
    )
    expect(announce).toHaveBeenCalledTimes(1)
    expect(announce).toHaveBeenCalledWith('That didn’t go through.')
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
  it('b · was here: no Wave; “Was here”', async () => {
    await draw({ variant: 'was' })
    expect(screen.queryByRole('button', { name: /Wave/ })).toBeNull()
    expect(screen.getByLabelText('Priya, 27, Both open to dating, was here')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Like' })).toBeTruthy()
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

  it('matched and friend say “Here now” only when they are (`here`); never by default', async () => {
    await draw({ variant: 'matched' })
    expect(screen.getByLabelText('Priya, 27, Both open to dating')).toBeTruthy()
    expect(query('p-presence-dot')).toBeNull()
    await draw({ variant: 'friend', here: true })
    expect(screen.getByLabelText('Priya, 27, Friend, here now')).toBeTruthy()
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
    await draw({ variant: 'thin', person: { face: { kind: 'creature', pseudonym: 'Cosmic Panda' }, name: 'Cosmic Panda', age: 27, city: 'Bengaluru', reasons: ['x'], chips: ['y'] } })
    expect(text('Bengaluru')).toBeTruthy()
    expect(text('x')).toBeNull()
    expect(text('y')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Like' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Wave/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Message' })).toBeTruthy()
  })
})

it('the hand-drawn controls take the focus ring and, on Android, ripple instead of scaling', async () => {
  await draw()
  const wave = screen.getByRole('button', { name: 'Wave at Priya' })
  await fireEvent(wave, 'focus')
  expect(query('p-hand-focus')).toBeTruthy()
  const more = screen.getByRole('button', { name: 'View profile' })
  await fireEvent(more, 'focus')
  expect(query('p-view-profile-focus')).toBeTruthy()
})

it('the action row wraps rather than truncating a label at large text or on a narrow phone', async () => {
  await draw()
  expect(flat('p-actions')).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' })
})

it('Android: the panels are sunken, not 8% white', async () => {
  on('android')
  await draw()
  expect(flat('p-reasons').backgroundColor).toBe(COLOR.surfaceSunken)
})

it('<PersonCard> presents it in the sheet, with no title of its own', async () => {
  await render(
    <PersonCard
      visible
      onClose={jest.fn()}
      person={PRIYA}
      variant="here"
      onLike={jest.fn()}
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
  expect(screen.getByLabelText('Priya, 27, Both open to dating, here now')).toBeTruthy()
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
  it('a wave on its way: the hand waves ±14° (#51), never a spinner, and is busy', async () => {
    await draw({ waving: true, testID: 'c' })
    expect(query('c-hand-waving')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Wave at Priya' }).props.accessibilityState).toMatchObject({ busy: true, disabled: true })
    silent()
  })

  it('Reduce Motion: the hand stays still while the wave goes', async () => {
    reduceMotion.mockReturnValue(true)
    await draw({ waving: true, testID: 'c' })
    expect(Reanimated.getAnimatedStyle(screen.getByTestId('c-hand-waving', { includeHiddenElements: true })).transform).toEqual([{ rotate: '0deg' }])
  })

  it('liked, requested and waved are each their own: one never hides another', async () => {
    await draw({ liked: true, requested: true, waved: true, testID: 'c' })
    expect(query('c-liked')).toBeTruthy()
    expect(query('c-waved')).toBeTruthy()
    expect(screen.getByLabelText('Request sent to Priya')).toBeTruthy()
  })

  it('Message says what it costs to a screen reader', async () => {
    await draw({ testID: 'c' })
    expect(screen.getByRole('button', { name: 'Message' }).props.accessibilityHint).toBe('Sends a request, which shows them your name and photo.')
  })

  it('a crew here: "Like for Nebula" with its emblem, "Like as yourself" under the row, and who they see', async () => {
    const crewLike = jest.fn()
    const onLike = jest.fn()
    await draw({ crewLike: { name: 'Nebula', emblemSeed: 'nebula', onPress: crewLike }, onLike, testID: 'c' })
    await fireEvent.press(screen.getByRole('button', { name: 'Like for Nebula' }))
    expect(crewLike).toHaveBeenCalledTimes(1)
    expect(onLike).not.toHaveBeenCalled()
    expect(haptics.like).toHaveBeenCalledTimes(1)
    expect(text('A crew like is shown to Priya as Nebula, never as you.')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Like as yourself' }))
    expect(onLike).toHaveBeenCalledTimes(1)
  })

  it('several crews may like: "Like for your crew", a heart rather than an emblem', async () => {
    await draw({ crewLike: { name: 'your crew', onPress: jest.fn() }, testID: 'c' })
    expect(screen.getByRole('button', { name: 'Like for your crew' })).toBeTruthy()
  })

  it('once liked, no crew like is offered again', async () => {
    await draw({ liked: true, crewLike: { name: 'Nebula', emblemSeed: 'nebula', onPress: jest.fn() }, testID: 'c' })
    expect(screen.queryByRole('button', { name: 'Like for Nebula' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Like as yourself' })).toBeNull()
  })
})

describe('the action row is one height (M4)', () => {
  it('Like, Message, the pills and the circles are all 48', async () => {
    await draw({ onLike: jest.fn(), onWave: jest.fn(), onMore: jest.fn() })
    for (const id of ['p-like', 'p-message', 'p-hand', 'p-ellipsis']) expect(flat(id).height).toBe(SIZE.control)
  })

  it('under rose, Liked lights in rose', async () => {
    await render(
      <HueProvider value="rose">
        <PersonCardContent person={PRIYA} variant="here" state="liked" testID="p" />
      </HueProvider>
    )
    expect(flat('p-liked').backgroundColor).toBe(COLOR.selectionRoseFill)
  })
})

describe('Matching v2 overlap (Flow 14 · 14.1, R7)', () => {
  const LABELS = [
    { text: 'Friendship', shared: true },
    { text: 'CSK', shared: true },
    { text: 'Filter coffee', shared: true },
    { text: 'Leo', shared: false },
  ]
  const overlap = { line: 'Both CSK, in RCB country', labels: LABELS }

  it('draws the server’s line and two labels before a reveal; the plain chips give way', async () => {
    await draw({ person: { ...PRIYA, overlap } })
    expect(text('Both CSK, in RCB country')).toBeTruthy()
    expect(text('Friendship')).toBeTruthy()
    expect(text('CSK')).toBeTruthy()
    expect(text('Filter coffee')).toBeNull()
    expect(text('Vinyl')).toBeNull()
  })

  it('four labels after a reveal (matched)', async () => {
    await draw({ person: { ...PRIYA, overlap }, variant: 'matched' })
    expect(text('Leo')).toBeTruthy()
  })

  it('no line: nothing new, and the plain chips stay', async () => {
    await draw({ person: { ...PRIYA, overlap: { line: null, labels: [] } } })
    expect(query('p-overlap')).toBeNull()
    expect(text('Vinyl')).toBeTruthy()
  })

  it('the thin card never says what you share', async () => {
    await draw({ person: { ...PRIYA, overlap }, variant: 'thin' })
    expect(query('p-overlap')).toBeNull()
  })
})
