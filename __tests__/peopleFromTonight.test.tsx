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
  await render(<PeopleFromTonight people={[person(1), person(2), person(3)]} onBack={onBack} />)
  expect(screen.getAllByText('Was here')).toHaveLength(3)
  expect(screen.queryByTestId('people-from-tonight-0-here', { includeHiddenElements: true })).toBeNull()
  await fireEvent.press(screen.getByRole('button', { name: /back/i }))
  expect(onBack).toHaveBeenCalled()
})

it('thousands: the list is virtualised, so only a window is mounted', async () => {
  await render(<PeopleFromTonight people={Array.from({ length: 5000 }, (_, i) => person(i))} onBack={jest.fn()} />)
  expect(screen.getAllByText('Was here').length).toBeLessThan(200)
})

describe('the Room hands the Recap its venue and its People row', () => {
  const code = readFileSync(join(__dirname, '..', 'components', 'blendn', 'BlendnScreen.tsx'), 'utf8')
  it('venue={room.event?.venueName} and onPeople behind recapPeopleOpen', () => {
    expect(code).toContain('venue={room.event?.venueName}')
    expect(code).toMatch(/onPeople=\{[^}]*recapPeopleOpen\(room\.event\.endsAt, now\)/)
  })
})
