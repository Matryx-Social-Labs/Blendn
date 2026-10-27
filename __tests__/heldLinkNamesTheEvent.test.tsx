/** SYS-15: "Sign in to open this" names the held event from the public share read, and falls back to the generic line. */
import { render, screen, waitFor } from '@testing-library/react-native'

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
const mockRequest = jest.fn()
jest.mock('../lib/apiClient', () => ({ apiClient: { queuedRequest: (...a: unknown[]) => mockRequest(...a) } }))

import { HeldLink, heldEventLine, HELD_LINK_WHAT } from '../components/system/HeldLink'

beforeEach(() => mockRequest.mockReset())

it('reads the public share without a session and names the event and its day', async () => {
  mockRequest.mockResolvedValue({ success: true, data: { available: true, event: { title: 'Neon Nights', startsAt: '2026-10-04T16:00:00.000Z', timezone: 'Asia/Kolkata' } } })
  await render(<HeldLink eventId="e1" />)
  expect(await screen.findByText('Neon Nights · Sat 4 Oct · held for you')).toBeTruthy()
  expect(mockRequest).toHaveBeenCalledWith('/api/public/share/events/e1', {}, false)
})

it('keeps the generic line with no id, or when the read says unavailable or fails', async () => {
  await render(<HeldLink />)
  expect(screen.getByText(HELD_LINK_WHAT)).toBeTruthy()
  expect(mockRequest).not.toHaveBeenCalled()
  mockRequest.mockResolvedValue({ success: false, error: 'not found' })
  expect(await heldEventLine('gone')).toBeNull()
  mockRequest.mockRejectedValue(new Error('offline'))
  expect(await heldEventLine('x')).toBeNull()
  await render(<HeldLink eventId="x" />)
  await waitFor(() => expect(mockRequest).toHaveBeenCalled())
  expect(screen.getAllByText(HELD_LINK_WHAT).length).toBeGreaterThan(0)
})
