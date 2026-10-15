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
import { Platform, StyleSheet } from 'react-native'

import { PersonCard, PersonCardContent, type PersonCardPerson } from '../components/ds/PersonCard'
import { COLOR, FONT_FAMILY, MATERIAL, TYPE } from '../lib/design/tokens'
import { H } from '../lib/haptics'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false) }
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

let haptics: Record<string, jest.SpyInstance>
beforeEach(() => {
  on('ios')
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
  it('liked: a white “Liked”, selected, still: no second H.like', async () => {
    const onLike = jest.fn()
    await draw({ state: 'liked', onLike })
    const liked = screen.getByRole('button', { name: 'Liked' })
    expect(liked.props.accessibilityState).toMatchObject({ selected: true })
    expect(flat('p-liked').backgroundColor).toBe(COLOR.textPrimary)
    await fireEvent.press(liked)
    expect(onLike).not.toHaveBeenCalled()
    silent()
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

  it('waved: a still “Waved” with the word, not a dimmed button (Flow 15 #18)', async () => {
    await draw({ state: 'waved' })
    expect(screen.queryByRole('button', { name: /Wave/ })).toBeNull()
    expect(text('Waved')).toBeTruthy()
    expect(flat('p-waved')).toMatchObject({ borderColor: COLOR.inputBorder })
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
