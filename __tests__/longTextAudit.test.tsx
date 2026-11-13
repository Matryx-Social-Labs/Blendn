/*
 * The long-text audit of every redesign built so far (owner, 2026-11-05): each data-driven string on each surface, at its
 * worst (`WORST`), bounded the way its board says, and no row able to push it over a sibling. Static copy is designed in
 * place and is not proofed here.
 *
 * Surfaces with no variable text and so nothing to proof: the landing (#484/#487: the lockup and the tagline are static,
 * its error and notice are server copy in a free-wrapping line) and the location step (#479: the map names no city,
 * SCRUM-997). The forgot sheet's echoed address is in forgotPasswordScreen.test.tsx, where the screen is already mocked.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'

import { RequestCard } from '../components/banter/BanterParts'
import { LockScreenPreview } from '../components/ds/LockScreenPreview'
import { Sheet } from '../components/ds/Sheet'
import { PayoffCard } from '../components/onboarding/PayoffCard'
import { askSamples } from '../lib/pushAsk'
import { AX_XXXL, atScale, resetScale } from './helpers/ax'
import { rowThatOverflows, slotOf, WORST, WORST_NAMES } from './helpers/longText'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn() }))
jest.mock('../lib/notifications', () => ({ initializePushNotifications: jest.fn() }))
jest.mock('../lib/apiClient', () => ({ TokenStorage: { getUser: jest.fn() } }))
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} />, isGlassEffectAPIAvailable: () => true, isLiquidGlassAvailable: () => true }
})
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }))

const hidden = { includeHiddenElements: true }
const text = (s: string) => screen.getByText(s, hidden) as never

afterEach(() => resetScale())

describe('onboarding payoff card (#477): the first name', () => {
  it.each(WORST_NAMES)('%s takes at most two lines, cut at its end, and never runs under the card edge', async (first) => {
    await render(<PayoffCard first={first} age={27} interest="Live music" />)
    const name = text(`${first}, 27`)
    expect(slotOf(name)).toEqual({ lines: 2, ellipsize: 'tail' })
    expect(rowThatOverflows(name)).toBeNull()
    // Read whole, whatever the card shows.
    expect(screen.getByTestId('ready-card').props.accessibilityLabel).toBe(`Your card: ${first}, 27, Live music`)
  })

  it('at the largest text size the name still stops at two lines', async () => {
    await atScale(AX_XXXL)
    await render(<PayoffCard first={WORST.firstNameHyphenated} age={27} />)
    expect(slotOf(text(`${WORST.firstNameHyphenated}, 27`)).lines).toBe(2)
  })
})

describe('push ask (#481): the event title in the sample notifications', () => {
  const samples = askSamples('rsvp', WORST.eventTitle)

  it('the update sample carries the title as its one-line, cut title', async () => {
    await render(<LockScreenPreview samples={samples} testID="lock" />)
    const title = text(WORST.eventTitle)
    expect(slotOf(title)).toEqual({ lines: 1, ellipsize: 'tail' })
    expect(rowThatOverflows(title)).toBeNull()
  })

  it('the match sample says "liked you back" before the title, so a two-line cut only ever falls on the title', async () => {
    const match = samples.find((s) => s.title === 'You both waved')!
    // The static words lead and the variable title ends the line: the ellipsis can only take the title's tail.
    expect(match.body).toBe(`Someone waved back at ${WORST.eventTitle}.`)
    await render(<LockScreenPreview samples={samples} testID="lock" />)
    const body = text(match.body)
    expect(slotOf(body)).toEqual({ lines: 2, ellipsize: 'tail' })
    expect(rowThatOverflows(body)).toBeNull()
  })

  it('without an event the match names none', () => {
    expect(askSamples('like').find((s) => s.title === 'You both waved')!.body).toBe('Someone waved back.')
  })
})

describe('sheets (#480): a title from data', () => {
  it('a three-line event title wraps whole, held to the sheet, and pushes no note or action over it', async () => {
    await render(
      <Sheet visible onClose={() => {}} title={WORST.eventTitle} headerAction={{ label: 'Clear all', onPress: () => {} }} testID="sheet">
        <Text>Body</Text>
      </Sheet>
    )
    const title = text(WORST.eventTitle)
    expect(slotOf(title).lines).toBeUndefined()
    expect(rowThatOverflows(title)).toBeNull()
  })
})

describe('Banter requests (#468): who is asking', () => {
  it.each(WORST_NAMES.flatMap((name) => [[name, 1, 1], [name, AX_XXXL, 2]] as const))('%s on a request card at text size %s is capped at %s line(s) and gives way to the time and ⋯', async (name, scale, lines) => {
    await atScale(scale)
    await render(
      <RequestCard
        testID="req"
        face={null}
        name={name}
        note={`${WORST.firstNameHyphenated} invited you to the crew`}
        time="2m"
        onAccept={() => {}}
        onDecline={() => {}}
        onMore={() => {}}
      />
    )
    const shown = text(name)
    expect(slotOf(shown).lines).toBe(lines)
    expect(rowThatOverflows(shown)).toBeNull()
    expect(rowThatOverflows(text(`${WORST.firstNameHyphenated} invited you to the crew`))).toBeNull()
  })
})

describe('the overlap check itself (control)', () => {
  it('names a row whose text branch would not give way', async () => {
    const { View } = jest.requireActual('react-native')
    await render(
      <View style={{ flexDirection: 'row' }}>
        <View>
          <Text>{WORST.venue}</Text>
        </View>
        <Text>2.4 km</Text>
      </View>
    )
    expect(rowThatOverflows(text(WORST.venue))).toEqual({ flexDirection: 'row' })
  })
})
