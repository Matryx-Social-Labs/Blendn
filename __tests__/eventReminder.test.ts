/*
 * The one-hour reminder follows interest *and* RSVP.
 *
 * Only the Pulse's heart scheduled it, so "I'm going" got no reminder.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const mockSchedule = jest.fn(() => Promise.resolve('id'))
const mockCancel = jest.fn(() => Promise.resolve())
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: () => Promise.resolve({ status: 'granted' }),
  scheduleNotificationAsync: (...a: unknown[]) => mockSchedule(...(a as [])),
  cancelScheduledNotificationAsync: (...a: unknown[]) => mockCancel(...(a as [])),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  setNotificationHandler: jest.fn(),
}))
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: {}, TokenStorage: {} }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))

// eslint-disable-next-line import/first
import { syncEventReminder } from '../lib/notifications'

const flush = () => new Promise((r) => setTimeout(r, 0))
const inTwoDays = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString()

beforeEach(() => {
  mockSchedule.mockClear()
  mockCancel.mockClear()
})

describe('syncEventReminder', () => {
  it('schedules when wanted', async () => {
    syncEventReminder({ id: 'e1', title: 'Rooftop', start_time: inTwoDays, venue_name: null }, true)
    await flush()
    expect(mockSchedule).toHaveBeenCalledTimes(1)
  })

  it('cancels when not wanted', async () => {
    syncEventReminder({ id: 'e1', title: 'Rooftop', start_time: inTwoDays }, false)
    await flush()
    expect(mockSchedule).not.toHaveBeenCalled()
    expect(mockCancel).toHaveBeenCalledWith('event-reminder-e1')
  })
})

describe('the event screen', () => {
  const src = () =>
    readFileSync(join(__dirname, '..', 'components', 'screens', 'EventDetailScreen.tsx'), 'utf8')

  it('wants a reminder for interested, going and waitlisted', () => {
    expect(src()).toContain(
      "const reminderWanted = userInterested || rsvpStatus === 'going' || rsvpStatus === 'waitlisted'"
    )
    expect(src()).toContain('syncEventReminder(')
  })
})
