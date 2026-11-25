import { readFileSync } from 'fs'
import { join } from 'path'
import { fireEvent, render, screen } from '@testing-library/react-native'

import { PeopleFromTonight } from '../components/blendn/PeopleFromTonight'
import type { RoomPerson } from '../lib/useRoom'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)

/** ROOM-06 / ROOM-09: the Recap offers the night's people, read-only and marked "Was here", and names the venue. */
const person = (i: number) => ({ id: `p${i}`, name: `Cosmic Panda ${i}`, photo: null, matched: false, liked: false }) as unknown as RoomPerson

it('is a read-only grid of the night: every face "Was here", none a live dot, back returns', async () => {
  const onBack = jest.fn()
  await render(<PeopleFromTonight people={[person(1), person(2), person(3)]} onBack={onBack} hasMore={false} loadingMore={false} onMore={jest.fn()} />)
  expect(screen.getAllByText('Was here')).toHaveLength(3)
  expect(screen.queryByTestId('people-from-tonight-0-here', { includeHiddenElements: true })).toBeNull()
  await fireEvent.press(screen.getByRole('button', { name: /back/i }))
  expect(onBack).toHaveBeenCalled()
})

it('thousands: the list is virtualised, so only a window is mounted', async () => {
  await render(<PeopleFromTonight people={Array.from({ length: 5000 }, (_, i) => person(i))} onBack={jest.fn()} hasMore={false} loadingMore={false} onMore={jest.fn()} />)
  expect(screen.getAllByText('Was here').length).toBeLessThan(200)
})

describe('the Room hands the Recap its venue and its People row', () => {
  const code = readFileSync(join(__dirname, '..', 'components', 'blendn', 'BlendnScreen.tsx'), 'utf8')
  it('venue={room.event?.venueName} and onPeople behind recapPeopleOpen', () => {
    expect(code).toContain('venue={room.event?.venueName}')
    expect(code).toMatch(/onPeople=\{[^}]*recapPeopleOpen\(room\.event\.endsAt, now, room\.chatClosesAt\)/)
  })
})


describe('a page of a bigger crowd (M4): never a count that is only the page', () => {
  const some = Array.from({ length: 12 }, (_, i) => person(i))
  it('more to load: no count in the head (12 would be a lie), and Show more asks for the next page', async () => {
    const onMore = jest.fn()
    await render(<PeopleFromTonight people={some} onBack={jest.fn()} hasMore loadingMore={false} onMore={onMore} />)
    expect(screen.queryByText('12')).toBeNull()
    await fireEvent.press(screen.getByTestId('room-show-more'))
    expect(onMore).toHaveBeenCalled()
  })
  it('the whole crowd loaded: the count is the number, and there is nothing to ask for', async () => {
    await render(<PeopleFromTonight people={some} onBack={jest.fn()} hasMore={false} loadingMore={false} onMore={jest.fn()} />)
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.queryByTestId('room-show-more')).toBeNull()
  })
})

describe('the People layer is a modal over the Recap, and Android back closes it first (M5)', () => {
  const code = readFileSync(join(__dirname, '..', 'components', 'blendn', 'BlendnScreen.tsx'), 'utf8')
  it('marks itself modal, hides the Recap from a screen reader while open, and back closes it before the overlay', () => {
    expect(code).toContain('accessibilityViewIsModal')
    expect(code).toMatch(/importantForAccessibility=\{peopleOpen \? 'no-hide-descendants' : 'auto'\}/)
    expect(code).toMatch(/backGuardRef\.current\?\.\(\)/)
    // SCRUM-812 drive: the deck has no background of its own, so the Recap showed through it unless it is drawn away.
    expect(code).toMatch(/style=\{\[styles\.layer, peopleOpen && styles\.underPeople\]\}/)
    expect(code).toMatch(/underPeople: \{ opacity: 0 \}/)
    expect(code).toMatch(/if \(peopleOpen\) \{\s*setPeopleOpen\(false\)\s*return true\s*\}/)
  })
})
