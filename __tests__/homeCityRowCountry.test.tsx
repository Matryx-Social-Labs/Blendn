/**
 * Settings › Home city ranks the phone's country second, as the Pulse's picker does: with location denied, the one its
 * time zone and region point to (SCRUM-1037). A Toronto phone setting a home saw India first.
 */
import { act, render } from '@testing-library/react-native'

let mockPickerCountry: string | null | undefined
jest.mock('../components/pulse/CityPicker', () => ({
  CityPicker: (p: { deviceCountry?: string | null }) => {
    mockPickerCountry = p.deviceCountry
    return null
  },
}))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('../lib/homeCity', () => ({ saveHomeCity: jest.fn(), useHomeCitySlug: () => null }))
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getEventCities: jest.fn(async () => ({
      success: true,
      data: {
        cities: [
          { city: 'Bengaluru', slug: 'bengaluru', country: 'IN', timezone: 'Asia/Kolkata', eventCount: 4 },
          { city: 'Toronto', slug: 'toronto', country: 'CA', timezone: 'America/Toronto', eventCount: 0, access: 'comingSoon' },
        ],
        countries: [
          { code: 'IN', name: 'India', defaultCitySlug: 'bengaluru' },
          { code: 'CA', name: 'Canada', defaultCitySlug: 'toronto' },
        ],
      },
    })),
  },
}))

/* eslint-disable import/first */
import { HomeCityRow } from '../components/settings/HomeCityRow'
import { refreshPhoneZone } from '../lib/time'
/* eslint-enable import/first */

const zoneBefore = process.env.TZ
afterEach(() => {
  process.env.TZ = zoneBefore
  refreshPhoneZone()
})

async function rankedIn(zone: string) {
  process.env.TZ = zone
  refreshPhoneZone()
  await render(<HomeCityRow userId="u-a" />)
  for (let i = 0; i < 4; i += 1) await act(async () => {})
  return mockPickerCountry
}

it('a Toronto phone ranks Canada next', async () => {
  expect(await rankedIn('America/Toronto')).toBe('CA')
})

it('a zone we list nothing in ranks no country (the control)', async () => {
  expect(await rankedIn('Europe/Berlin')).toBeNull()
})
