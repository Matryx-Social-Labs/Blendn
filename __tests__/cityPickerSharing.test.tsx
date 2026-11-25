/**
 * "Use my current location" is not offered while "Share location for nearby events" is off (SCRUM-908): it would ask the
 * phone for a fix, name it as a city and set it as the browse city.
 */
import { render, screen } from '@testing-library/react-native'

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('../components/cityArt/CityArtCard', () => ({ CityArtCard: () => null }))
jest.mock('../components/cityArt/drawable', () => ({ drawableCityArt: () => null }))

/* eslint-disable import/first */
import { CityPicker } from '../components/pulse/CityPicker'
import { setLocationSharing } from '../lib/shareLocation'
/* eslint-enable import/first */

const picker = () => (
  <CityPicker visible onClose={jest.fn()} cities={[{ city: 'Bengaluru', eventCount: 4 }]} selectedCity="Bengaluru" deviceCity={null} onChoose={jest.fn()} onLocate={jest.fn()} />
)
afterEach(() => setLocationSharing(true))

it('offers the phone’s location when sharing is on (the control)', async () => {
  await render(picker())
  expect(screen.getByTestId('city-locate')).toBeTruthy()
})

it('does not offer it when sharing is off, and does not tell somebody to turn location on', async () => {
  setLocationSharing(false)
  await render(picker())
  expect(screen.queryByTestId('city-locate')).toBeNull()
  expect(screen.getByText('Bengaluru')).toBeTruthy()
})
