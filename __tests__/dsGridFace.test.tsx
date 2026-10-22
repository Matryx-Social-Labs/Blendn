/*
 * <GridFace> (guidelines/components/GridFace.html): "Everyone here", a face at
 * the column width less 16, the name and one reason; three marks and nothing
 * else (the live dot at the rim, the heart, the message), away faces at 60%
 * with "Was here". Tap opens the PersonCard, silently.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, StyleSheet } from 'react-native'

import { DOUBLE_TAP_MS, GridFace } from '../components/ds/GridFace'
import { COLOR, TYPE } from '../lib/design/tokens'
import { H } from '../lib/haptics'

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const query = (id: string) => screen.queryByTestId(id, { includeHiddenElements: true })
const PRIYA = { face: { kind: 'creature', pseudonym: 'Cosmic Panda' } as const, name: 'Cosmic Panda', reason: 'Both into vinyl', width: 110 }

it('the face is the column less 16; name and reason one line each, capped at 1.3×', async () => {
  await render(<GridFace {...PRIYA} testID="g" />)
  expect(flat('g-face')).toMatchObject({ width: 94, height: 94 })
  const name = screen.getByText('Cosmic Panda', { includeHiddenElements: true })
  const reason = screen.getByText('Both into vinyl', { includeHiddenElements: true })
  expect(name.props).toMatchObject({ numberOfLines: 1, maxFontSizeMultiplier: 1.3 })
  expect(reason.props).toMatchObject({ numberOfLines: 1, maxFontSizeMultiplier: 1.3 })
  expect(StyleSheet.flatten(reason.props.style)).toMatchObject({ fontSize: TYPE.caption.fontSize, color: COLOR.textSecondary })
})

it('here now: the live dot at the rim, ringed in ink; read “here now”', async () => {
  await render(<GridFace {...PRIYA} testID="g" />)
  expect(flat('g-here')).toMatchObject({ width: 12, height: 12, backgroundColor: COLOR.live, borderColor: COLOR.ink })
  expect(screen.getByRole('button', { name: 'Cosmic Panda, Both into vinyl, here now' })).toBeTruthy()
})

it('liked: the heart mark, and the dot gives way; matched: the message mark wins', async () => {
  await render(<GridFace {...PRIYA} liked testID="g" />)
  expect(query('g-mark-disc')).toBeTruthy()
  expect(query('g-here')).toBeNull()
  expect(screen.getByRole('button', { name: 'Cosmic Panda, Both into vinyl, here now, liked' })).toBeTruthy()
  await render(<GridFace {...PRIYA} liked matched testID="g" />)
  expect(screen.getByRole('button', { name: 'Cosmic Panda, Both into vinyl, here now, matched' })).toBeTruthy()
})

it('away: the face at 60% and “Was here” instead of the reason', async () => {
  await render(<GridFace {...PRIYA} here={false} testID="g" />)
  expect(flat('g-face-wrap').opacity).toBe(0.6)
  expect(screen.getByText('Was here', { includeHiddenElements: true })).toBeTruthy()
  expect(query('g-here')).toBeNull()
  expect(screen.getByRole('button', { name: 'Cosmic Panda, was here' })).toBeTruthy()
})

it('a tap opens the card, silently; pressed scales; focused rings the face', async () => {
  const onPress = jest.fn()
  const haptics = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
  await render(<GridFace {...PRIYA} onPress={onPress} />)
  await fireEvent.press(screen.getByRole('button'))
  expect(onPress).toHaveBeenCalledTimes(1)
  for (const spy of haptics) expect(spy).not.toHaveBeenCalled()
  await render(<GridFace {...PRIYA} previewState="pressed" testID="g" />)
  expect(flat('g-scale').transform).toEqual([{ scale: 0.97 }])
  await render(<GridFace {...PRIYA} previewState="focused" testID="g" />)
  expect(query('g-focus')).toBeTruthy()
})

it('Increase Contrast sets the reason in white', async () => {
  jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
  await render(<GridFace {...PRIYA} />)
  await act(async () => {})
  expect(StyleSheet.flatten(screen.getByText('Both into vinyl', { includeHiddenElements: true }).props.style).color).toBe(COLOR.textPrimary)
})

describe('Flow 4 Room: the double tap likes; arrivals and waves show on the face', () => {
  const advance = (ms: number) => act(async () => jest.advanceTimersByTime(ms))
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('a double tap likes: H.like and the HeartPop, and does not open the card', async () => {
    const onPress = jest.fn()
    const onLike = jest.fn()
    const like = jest.spyOn(H, 'like').mockImplementation(() => {})
    await render(<GridFace {...PRIYA} onPress={onPress} onLike={onLike} testID="g" />)
    await fireEvent.press(screen.getByRole('button'))
    await fireEvent.press(screen.getByRole('button'))
    expect(onLike).toHaveBeenCalledTimes(1)
    expect(like).toHaveBeenCalledTimes(1)
    expect(query('g-heart')).toBeTruthy()
    await advance(1000)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('one tap opens the card once the double-tap window has passed', async () => {
    const onPress = jest.fn()
    await render(<GridFace {...PRIYA} onPress={onPress} onLike={jest.fn()} />)
    await fireEvent.press(screen.getByRole('button'))
    expect(onPress).not.toHaveBeenCalled()
    await advance(DOUBLE_TAP_MS)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('with no like on offer (liked, matched, or the card would ask) a tap opens at once', async () => {
    const onPress = jest.fn()
    await render(<GridFace {...PRIYA} liked onPress={onPress} />)
    await fireEvent.press(screen.getByRole('button'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('a screen reader likes from the actions menu, and activate opens at once', async () => {
    const onPress = jest.fn()
    const onLike = jest.fn()
    await render(<GridFace {...PRIYA} onPress={onPress} onLike={onLike} />)
    const face = screen.getByRole('button')
    expect(face.props.accessibilityActions).toEqual([{ name: 'activate' }, { name: 'like', label: 'Like' }])
    await fireEvent(face, 'accessibilityAction', { nativeEvent: { actionName: 'like' } })
    expect(onLike).toHaveBeenCalledTimes(1)
    await fireEvent(face, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } })
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('a wave from them rings the face (#51); none before one arrives', async () => {
    const view = await render(<GridFace {...PRIYA} testID="g" />)
    expect(query('g-wave-ring')).toBeNull()
    await view.rerender(<GridFace {...PRIYA} waveKey={1} testID="g" />)
    expect(query('g-wave-ring')).toBeTruthy()
  })
})

it('says Matching v2’s sentence as the visible reason, in two lines, when the server sent one (R7)', async () => {
  await render(<GridFace {...PRIYA} overlap="Both CSK, in RCB country" testID="g" />)
  const line = screen.getByText('Both CSK, in RCB country', { includeHiddenElements: true })
  expect(line.props.numberOfLines).toBe(2)
  expect(screen.queryByText('Both into vinyl', { includeHiddenElements: true })).toBeNull()
  expect(screen.getByRole('button', { name: 'Cosmic Panda, Both CSK, in RCB country, here now' })).toBeTruthy()
})

it('a face that has gone says Was here, never the overlap', async () => {
  await render(<GridFace {...PRIYA} here={false} overlap="Both CSK, in RCB country" testID="g" />)
  expect(screen.getByText('Was here', { includeHiddenElements: true })).toBeTruthy()
  expect(screen.queryByText('Both CSK, in RCB country', { includeHiddenElements: true })).toBeNull()
})

it('a hold opens the card at once with H.longPress, and a tap stays silent (H1)', async () => {
  const onPress = jest.fn()
  const spy = jest.spyOn(H, 'longPress').mockImplementation(() => {})
  await render(<GridFace {...PRIYA} onPress={onPress} testID="g" />)
  await fireEvent(screen.getByTestId('g'), 'longPress')
  expect(spy).toHaveBeenCalledTimes(1)
  expect(onPress).toHaveBeenCalledTimes(1)
  spy.mockClear()
  await fireEvent.press(screen.getByTestId('g'))
  expect(spy).not.toHaveBeenCalled()
})

it('a hold after a first tap opens once, not twice (the tap’s pending open is cancelled)', async () => {
  jest.useFakeTimers()
  const onPress = jest.fn()
  jest.spyOn(H, 'longPress').mockImplementation(() => {})
  await render(<GridFace {...PRIYA} onPress={onPress} onLike={jest.fn()} testID="g" />)
  await fireEvent.press(screen.getByTestId('g'))
  await fireEvent(screen.getByTestId('g'), 'longPress')
  await act(async () => jest.advanceTimersByTime(DOUBLE_TAP_MS * 2))
  expect(onPress).toHaveBeenCalledTimes(1)
  jest.useRealTimers()
})
