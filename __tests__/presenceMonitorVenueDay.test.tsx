import React from 'react'
import { act, render } from '@testing-library/react-native'

/**
 * A Go Live's venue day belongs to LiveAtVenue (its pings, its end), not to the
 * event presence monitor, which would ask for an event that 404s for a venue
 * day and fence-check it by the event's rules (step 5 review, L4).
 */
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getActiveCheckins: jest.fn(), getEvent: jest.fn() } }))
jest.mock('../lib/checkIn', () => ({ checkOutOf: jest.fn() }))
jest.mock('../components/ActionTray', () => ({ __esModule: true, default: () => null }))
jest.mock('expo-location', () => ({ getForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn(), Accuracy: { Balanced: 3 } }))

/* eslint-disable import/first */
import { PresenceMonitor } from '../components/PresenceMonitor'
import { apiClient } from '../lib/apiClient'
/* eslint-enable import/first */

const checkIn = (eventId: string, kind: string) => ({ id: `c-${eventId}`, eventId, kind, event: { id: eventId } })

it('watches the event check-in, never the venue day', async () => {
  ;(apiClient.getActiveCheckins as jest.Mock).mockResolvedValue({ success: true, data: { checkIns: [checkIn('day-1', 'venue_day'), checkIn('e1', 'event')] } })
  ;(apiClient.getEvent as jest.Mock).mockResolvedValue({ success: false })
  await render(<PresenceMonitor />)
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(apiClient.getEvent).toHaveBeenCalledWith('e1')
  expect(apiClient.getEvent).not.toHaveBeenCalledWith('day-1')
})

it('with only a Go Live, watches nothing', async () => {
  ;(apiClient.getActiveCheckins as jest.Mock).mockResolvedValue({ success: true, data: { checkIns: [checkIn('day-1', 'venue_day')] } })
  await render(<PresenceMonitor />)
  await act(async () => {
    await Promise.resolve()
  })
  expect(apiClient.getEvent).not.toHaveBeenCalled()
})
