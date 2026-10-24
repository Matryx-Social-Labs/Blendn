/**
 * Tonight, every state Flow 4 draws (guidelines/flow-4 "Blend’n · Tonight",
 * R3-D4 4.7, Room #15): loading, the deck (1, 3, 10), saved today, the pass,
 * the pass only, empty, error, location off, offline, approximate location,
 * and the Room's error as a quiet line over it.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Linking } from 'react-native'

import { TonightView, deckEvent, type TonightViewProps } from '../components/blendn/TonightView'
import type { TonightEvent } from '../lib/useTonight'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}))
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
jest.mock('../components/blendn/RoomStage', () => ({
  useStageScroll: () => ({ onScroll: undefined, native: {}, scrollEventThrottle: 16 }),
}))

const HIDDEN = { includeHiddenElements: true }
const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()
const event = (id: string, o: Partial<TonightEvent> = {}): TonightEvent => ({
  id,
  title: `Event ${id}`,
  venue: 'That Comedy Club',
  photo: null,
  startsAt: at(25),
  endsAt: at(200),
  distanceKm: 2.1,
  hereCount: 0,
  capacity: null,
  going: false,
  tasteMatchCount: null,
  goingCount: 9,
  ...o,
})

const draw = (props: Partial<TonightViewProps> = {}) =>
  render(
    <TonightView
      events={[event('a'), event('b'), event('c')]}
      loading={false}
      error={false}
      onRetry={jest.fn()}
      insideEvent={null}
      checkingIn={false}
      onOpenEvent={jest.fn()}
      onSeeAll={jest.fn()}
      onBrowse={jest.fn()}
      onCheckIn={jest.fn()}
      topInset={124}
      bottomInset={34}
      {...props}
    />
  )

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false)
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false)
})

describe('the head', () => {
  it('"Tonight", See all, and what to do here', async () => {
    await draw()
    expect(screen.getByText('Tonight')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'See all' })).toBeTruthy()
    expect(screen.getByText('Check in at an event to open its room.')).toBeTruthy()
  })

  it('at a door: the full stop, not a dash (DESIGN-DIFFS)', async () => {
    await draw({ insideEvent: event('door') })
    expect(screen.getByText('You’re at an event. Hold the pass below to check in.')).toBeTruthy()
  })

  it('no See all when there is nothing to see', async () => {
    await draw({ events: [] })
    expect(screen.queryByRole('button', { name: 'See all' })).toBeNull()
  })
})

describe('the deck (#02–#05)', () => {
  it('the card reads the design’s one date grammar and "N going"', () => {
    const card = deckEvent(event('a', { startsAt: at(25) }), Date.now())
    expect(card).toMatchObject({ time: 'In 25 min', going: 9, venue: 'That Comedy Club', distance: '2.1 km' })
  })

  it('saved today: "You’re going · 9 PM" (the ribbon), and only for tonight', () => {
    const nine = new Date()
    nine.setHours(21, 0, 0, 0)
    expect(deckEvent(event('a', { going: true, startsAt: nine.toISOString() }), nine.getTime() - 3600_000).saved).toBe('9 PM')
    expect(deckEvent(event('a', { going: true, startsAt: new Date(nine.getTime() + 86_400_000).toISOString() }), nine.getTime()).saved).toBeUndefined()
    expect(deckEvent(event('a', { going: false }), Date.now()).saved).toBeUndefined()
  })

  it('one card: no pips; three: three pips', async () => {
    await draw({ events: [event('a')] })
    expect(screen.queryByTestId('tonight-deck-pips', HIDDEN)).toBeNull()
    await draw()
    expect(screen.getByTestId('tonight-deck-pip-2', HIDDEN)).toBeTruthy()
  })

  it('ten at most (DECK_MAX)', async () => {
    await draw({ events: Array.from({ length: 14 }, (_, i) => event(`e${i}`)) })
    expect(screen.getByTestId('tonight-deck-pip-9', HIDDEN)).toBeTruthy()
    expect(screen.queryByTestId('tonight-deck-pip-10', HIDDEN)).toBeNull()
  })
})

describe('the states with nothing to deal', () => {
  it('loading: one static card, nothing loops (#01)', async () => {
    await draw({ events: [], loading: true })
    expect(screen.getByTestId('tonight-skeleton', HIDDEN)).toBeTruthy()
  })

  it('empty: "Nothing on near you right now" and Browse the Pulse (#08)', async () => {
    const onBrowse = jest.fn()
    await draw({ events: [], onBrowse })
    expect(screen.getByText('Nothing on near you right now')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Browse the Pulse' }))
    expect(onBrowse).toHaveBeenCalled()
  })

  it('error: a failed load is not "nothing on", and offers Try again (#09)', async () => {
    const onRetry = jest.fn()
    await draw({ events: [], error: true, onRetry })
    expect(screen.getByText('Couldn’t load tonight’s events')).toBeTruthy()
    expect(screen.queryByText('Nothing on near you right now')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })
})

describe('the banners', () => {
  it('location off: listed by city, with Turn on to Settings (#10)', async () => {
    const settings = jest.spyOn(Linking, 'openSettings').mockResolvedValue()
    await draw({ location: 'off' })
    expect(screen.getByText('Location is off. Events are listed by city, without distances.')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Turn on' }))
    expect(settings).toHaveBeenCalled()
  })

  it('offline: what loaded earlier stays, and says so (#11)', async () => {
    await draw({ offline: true })
    expect(screen.getByText('Offline. Showing what loaded earlier.')).toBeTruthy()
    expect(screen.getByTestId('tonight-deck', HIDDEN)).toBeTruthy()
  })

  it('the Room failed: Tonight stays, with a quiet line and Try again (Room #15)', async () => {
    const onRoomRetry = jest.fn()
    await draw({ onRoomRetry })
    expect(screen.getByText('Couldn’t check your room. You can still browse tonight.')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(onRoomRetry).toHaveBeenCalled()
  })
})

describe('the pass (#06, #07)', () => {
  it('docks the door’s VenuePass, the copy as drawn, and keeps its event off the deck', async () => {
    await draw({ insideEvent: event('door', { title: 'Vinyl Night', hereCount: 12, tasteMatchCount: 3 }) })
    expect(screen.getByTestId('tonight-pass', HIDDEN)).toBeTruthy()
    expect(screen.getByText('YOU’RE HERE', HIDDEN)).toBeTruthy()
    expect(screen.getByText('3 people here share your taste', HIDDEN)).toBeTruthy()
    expect(screen.getByText('Checks you in. Other people at this event will see you.', HIDDEN)).toBeTruthy()
    expect(screen.queryByText('Event door', HIDDEN)).toBeNull()
  })

  it('the pass alone when nothing else is on', async () => {
    await draw({ events: [event('door')], insideEvent: event('door') })
    expect(screen.getByTestId('tonight-pass', HIDDEN)).toBeTruthy()
    expect(screen.queryByText('Nothing on near you right now')).toBeNull()
  })

  it('approximate location: one quiet line instead, and no pass (R3-D4 4.7)', async () => {
    await draw({ insideEvent: event('door'), location: 'approximate' })
    expect(screen.getByText('Approximate location. Check-in needs your exact spot: turn on Precise Location for Blend’n.')).toBeTruthy()
    expect(screen.queryByTestId('tonight-pass', HIDDEN)).toBeNull()
    // ROUND4 8.3 #08: where the pass would dock, why, and Turn on.
    expect(screen.getByText('No pass without precise location', HIDDEN)).toBeTruthy()
    expect(screen.getByLabelText('Turn on Precise Location', HIDDEN)).toBeTruthy()
  })

  it('in another room already: the hold is a switch out of it (ROUND4 8.3 #06)', async () => {
    await draw({ insideEvent: event('door'), switchFrom: 'Vinyl Night' })
    expect(screen.getAllByText('Hold to switch', HIDDEN).length).toBeGreaterThan(0)
    expect(screen.getByText('You’ll leave Vinyl Night', HIDDEN)).toBeTruthy()
  })

  it('after the server’s yes the pass holds "You’re in" and Tell your crew (R2-D1 "success")', async () => {
    const { Text } = jest.requireActual('react-native')
    await draw({ insideEvent: event('door'), checkingIn: true, youreIn: true, crewStrip: <Text>Tell your crew</Text> })
    expect(screen.getAllByText('You’re in', HIDDEN).length).toBeGreaterThan(0)
    expect(screen.getByText('Tell your crew', HIDDEN)).toBeTruthy()
  })

  it('the strip is the success’s only: not before the hold', async () => {
    const { Text } = jest.requireActual('react-native')
    await draw({ insideEvent: event('door'), crewStrip: <Text>Tell your crew</Text> })
    expect(screen.queryByText('Tell your crew', HIDDEN)).toBeNull()
  })
})

describe('a Tonight event with no cover (rc7 ruling 5)', () => {
  it('hands its category to the card, so the plate carries the category glyph', () => {
    expect(deckEvent(event('a', { photo: null, category: 'music' }), Date.now())).toMatchObject({ cover: null, category: 'music' })
  })
})
