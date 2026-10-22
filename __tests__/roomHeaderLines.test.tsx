import { renderHook, render, screen } from '@testing-library/react-native'

import { CountLine } from '../components/chat/ChatParts'
import { usePreEventRoom } from '../lib/usePreEventRoom'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)

it('the live count has thousands separators', async () => {
  await render(<CountLine count={5000} />)
  expect(screen.getByText('5,000')).toBeTruthy()
})

const mockNow = jest.fn((_period: number) => Date.now())
jest.mock('../lib/useNow', () => ({ useNow: (period: number) => mockNow(period) }))

describe('the pre-event countdown only ticks where there is something to count down to', () => {
  it('a room with no start (a crew’s, a place’s) sets its clock so far out it never fires', async () => {
    await renderHook(() => usePreEventRoom(null))
    expect(mockNow).toHaveBeenLastCalledWith(24 * 60 * 60 * 1000)
  })

  it('an event with a start ticks once a minute', async () => {
    await renderHook(() => usePreEventRoom(new Date(Date.now() + 30 * 3600 * 1000).toISOString()))
    expect(mockNow).toHaveBeenLastCalledWith(60 * 1000)
  })
})
