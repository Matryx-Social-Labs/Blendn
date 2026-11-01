import type { CityCatalogue, CityOption } from '../lib/city'
import { MAP_THEME } from '../lib/mapTheme'
import { FLAT_VIEW, litUpTo, OPENING_VIEW, openingCentre } from '../lib/onboardingMap'

const city = (slug: string, latitude: number, longitude: number, over: Partial<CityOption> = {}): CityOption => ({
  city: slug,
  eventCount: 1,
  slug,
  centre: { latitude, longitude },
  ...over,
})

const catalogue: CityCatalogue = {
  cities: [city('bengaluru', 12.97, 77.59, { isDefault: true }), city('mumbai', 19.07, 72.87), city('toronto', 43.65, -79.38)],
  countries: [
    { code: 'IN', name: 'India', defaultCitySlug: 'bengaluru' },
    { code: 'CA', name: 'Canada', defaultCitySlug: 'toronto' },
  ],
  defaultCitySlug: 'bengaluru',
  device: null,
}

describe('openingCentre: where the location step opens before permission (the catalogue, never cities[0])', () => {
  it("takes the city the server made of the phone's country", () => {
    const withDevice = { ...catalogue, device: { country: 'IN', access: 'full' as const, citySlug: 'mumbai' } }
    expect(openingCentre(withDevice, 'IN')).toEqual([72.87, 19.07])
  })

  it("takes the region's default city when the server sent no device scope (an older server, or no X-Country)", () => {
    expect(openingCentre(catalogue, 'CA')).toEqual([-79.38, 43.65])
    expect(openingCentre(catalogue, 'ca')).toEqual([-79.38, 43.65])
  })

  it('takes the catalogue default for a country we do not serve, or when the server says none', () => {
    expect(openingCentre(catalogue, 'DE')).toEqual([77.59, 12.97])
    expect(openingCentre({ ...catalogue, device: { country: 'DE', access: 'none', citySlug: null } }, 'DE')).toEqual([77.59, 12.97])
    expect(openingCentre(catalogue, null)).toEqual([77.59, 12.97])
  })

  it('has no centre without a catalogue, or for a city with no centre: the still frame shows, never a map of nowhere', () => {
    expect(openingCentre(null, 'IN')).toBeNull()
    expect(openingCentre({ ...catalogue, cities: [city('bengaluru', 0, 0, { centre: null })] }, 'IN')).toBeNull()
    // Control: the same catalogue with the centre present does open there.
    expect(openingCentre({ ...catalogue, cities: [city('bengaluru', 12.97, 77.59)] }, 'IN')).toEqual([77.59, 12.97])
  })
})

describe('the landing sequence (BlendnLanding LiveMap.tsx)', () => {
  it("runs from the city, flat, to the app's own opening view turned -17°", () => {
    expect(FLAT_VIEW).toEqual({ zoom: 13.4, pitch: 0, bearing: 0 })
    expect(OPENING_VIEW).toEqual({ zoom: MAP_THEME.camera.zoom, pitch: MAP_THEME.camera.pitch, bearing: -17 })
  })
})

describe('litUpTo: the places light one by one, in the order given', () => {
  const f = (id: string) => ({ type: 'Feature' as const, properties: { id } })
  const features = [f('a'), f('a'), f('b'), f('c'), f('c')]

  it('draws only the first n places, every band of each', () => {
    expect(litUpTo(features, ['c', 'a', 'b'], 0)).toEqual([])
    expect(litUpTo(features, ['c', 'a', 'b'], 1)).toEqual([f('c'), f('c')])
    expect(litUpTo(features, ['c', 'a', 'b'], 2)).toEqual([f('a'), f('a'), f('c'), f('c')])
    expect(litUpTo(features, ['c', 'a', 'b'], 3)).toEqual(features)
  })
})
