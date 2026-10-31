/*
 * <TonightCard> (guidelines/components/TonightCard.html): Tonight's deck. The
 * hero EventCard with a 2 pt ink outline, two fanned cards behind it (−5° and
 * 4°), pips. It is the Me tab's photo stack (SwipeDeck): the gesture and the
 * motion run on the UI thread from shared values, every card carries its own
 * cover, and the next covers are prefetched (SCRUM-964).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { act, render, screen } from '@testing-library/react-native'
import { Image } from 'expo-image'
import React from 'react'
import { StyleSheet } from 'react-native'

import { PREFETCH_AHEAD, TONIGHT_SCRIM_FOOT, TonightCard } from '../components/ds/TonightCard'
import { COLOR, RADIUS } from '../lib/design/tokens'
import { tint } from '../lib/theme'

jest.mock('expo-image', () => {
  const { View } = jest.requireActual('react-native')
  const Image = ({ source }: { source: { uri: string } }) => <View testID={`img:${source.uri}`} />
  Image.prefetch = jest.fn(async () => true)
  return { Image }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const query = (id: string) => screen.queryByTestId(id, { includeHiddenElements: true })

const EVENT = (title: string, cover?: string) => ({ title, time: '9 PM', venue: 'Toit', distance: '1.2 km', going: 42, cover })
const DECK = [EVENT('Vinyl Night'), EVENT('Open mic'), EVENT('Quiz night')]

const draw = (props: Partial<React.ComponentProps<typeof TonightCard>> = {}) =>
  render(<TonightCard events={DECK} onIndexChange={jest.fn()} onOpen={jest.fn()} width={322} height={280} testID="t" {...props} />)

describe('the deck', () => {
  it('one card: no pips', async () => {
    await draw({ events: DECK.slice(0, 1) })
    expect(query('t-pips')).toBeNull()
  })

  it('three: every card is a real card, and the pips lead with a long first one', async () => {
    await draw()
    for (const title of ['Vinyl Night', 'Open mic', 'Quiz night']) expect(screen.getByText(title, { includeHiddenElements: true })).toBeTruthy()
    expect(flat('t-pip-0').width).toBe(16)
    expect(flat('t-pip-1').width).toBe(6)
  })

  it('every card has the 2 pt ink outline and the card radius', async () => {
    await draw()
    for (const i of [0, 1, 2]) {
      const wrapper = StyleSheet.flatten(screen.getByTestId(`t-card-${i}`, { includeHiddenElements: true }).parent?.props.style)
      expect(wrapper).toMatchObject({ borderWidth: 2, borderColor: COLOR.ink, borderRadius: RADIUS.card })
    }
  })
})

describe('the same stack as the Me photo stack (SCRUM-964)', () => {
  const code = readFileSync(join(__dirname, '..', 'components', 'ds', 'TonightCard.tsx'), 'utf8')
  it('is a SwipeDeck: no gesture, shared value or spring of its own', () => {
    expect(code).toContain("from '../motion/SwipeDeck'")
    expect(code).toMatch(/<SwipeDeck/)
    expect(code).not.toMatch(/Gesture\.|useSharedValue|useAnimatedStyle|withSpring|scheduleOnRN/)
  })

  it('draws each card with its cover, so the ones behind are not blank', async () => {
    const covers = ['https://c/a.jpg', 'https://c/b.jpg', 'https://c/c.jpg']
    await draw({ events: DECK.map((e, i) => ({ ...e, cover: covers[i] })) })
    for (const c of covers) expect(screen.getByTestId(`img:${c}`, { includeHiddenElements: true })).toBeTruthy()
  })

  it('prefetches the top cover and the next few, once, into the disk cache', async () => {
    const prefetch = Image.prefetch as jest.Mock
    prefetch.mockClear()
    const covers = Array.from({ length: 7 }, (_, i) => `https://c/${i}.jpg`)
    const events = covers.map((c, i) => EVENT(`E${i}`, c))
    await draw({ events })
    expect(prefetch).toHaveBeenCalledTimes(1)
    expect(prefetch).toHaveBeenCalledWith(covers.slice(0, PREFETCH_AHEAD + 1), 'memory-disk')
  })

  it('no covers, no prefetch', async () => {
    const prefetch = Image.prefetch as jest.Mock
    prefetch.mockClear()
    await draw()
    expect(prefetch).not.toHaveBeenCalled()
  })
})

describe('moving it', () => {
  it('the next action moves the pips on and tells the parent', async () => {
    const onIndexChange = jest.fn()
    await draw({ onIndexChange })
    const deck = screen.getByLabelText('Vinyl Night, 9 PM, at Toit, 1.2 km, 42 going')
    await act(async () => deck.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }))
    expect(onIndexChange).toHaveBeenCalledWith(1)
    expect(flat('t-pip-1').width).toBe(16)
    expect(flat('t-pip-0').width).toBe(6)
  })
})

describe('a tap', () => {
  it('opens the event on top, silently', async () => {
    const onOpen = jest.fn()
    await draw({ onOpen })
    const deck = screen.getByLabelText('Vinyl Night, 9 PM, at Toit, 1.2 km, 42 going')
    await act(async () => deck.props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } }))
    expect(onOpen).toHaveBeenCalledWith(0)
  })
})

describe('a screen reader', () => {
  it('hears the card and where it is in the deck, and adjusts it', async () => {
    await draw()
    const deck = screen.getByLabelText('Vinyl Night, 9 PM, at Toit, 1.2 km, 42 going')
    expect(deck.props.accessibilityValue).toEqual({ text: '1 of 3' })
    expect(deck.props.accessibilityActions).toEqual([{ name: 'activate' }, { name: 'increment', label: 'Next event' }])
  })
})

/*
 * TG-14 (B-R9): a bright cover thinned the words at the card's foot. Tonight's scrim meets solid ink there. Negative
 * control: without `scrimFoot` the foot is PhotoScrim's 0.88 and the first expect fails.
 */
describe('the scrim carries the words over any cover', () => {
  const channel = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)
  const luminance = ([r, g, b]: number[]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  const rgb = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16))

  it('ends in solid ink, so white words at the foot hold 4.5:1 over a white photograph', async () => {
    await draw({ events: [{ ...EVENT('Vinyl Night'), cover: 'https://cdn.blendn.app/bright.jpg' }] })
    const colors = screen.getByTestId('t-card-scrim', { includeHiddenElements: true }).props.colors as string[]
    expect(colors[colors.length - 1]).toBe(tint(COLOR.ink, TONIGHT_SCRIM_FOOT))
    // The foot over pure white: ink at the foot's alpha, composited.
    const over = rgb(COLOR.ink).map((c) => c * TONIGHT_SCRIM_FOOT + 255 * (1 - TONIGHT_SCRIM_FOOT))
    const [hi, lo] = [luminance(rgb(COLOR.textPrimary)), luminance(over)].sort((x, y) => y - x)
    expect((hi + 0.05) / (lo + 0.05)).toBeGreaterThanOrEqual(4.5)
  })
})
