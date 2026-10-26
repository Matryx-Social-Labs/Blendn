import { readFileSync } from 'fs'
import { join } from 'path'

import { roundCoord } from '../lib/geo'

/**
 * The Pulse feed no longer waits on the network to learn which city it is in,
 * and no longer fires an unscoped /events that a city-scoped one replaces.
 *
 * Before: `Promise.all([readStoredCity(), getEventCities()])` held a stored city
 * back behind a round trip (~200-250 ms from Canada); the feed effect fired
 * /events with no city at once, then again with it (second skeleton, 720 ms
 * floor); and lastKnown vs live GPS differed in the 6th decimal, so the
 * location-arrived refetch was a third request under a different key.
 */
const src = readFileSync(join(__dirname, '..', 'app', '(tabs)', 'events.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

describe('roundCoord', () => {
  it('collapses a last-known fix and a live fix a few metres apart into one value', () => {
    expect(roundCoord(12.971599)).toBe(roundCoord(12.971604))
    expect(roundCoord(77.594566)).toBe(77.595)
  })
  it('leaves undefined alone', () => {
    expect(roundCoord(undefined)).toBeUndefined()
  })
})

describe('Pulse launch', () => {
  it('reads the stored city on its own, before the cities request', () => {
    expect(src).not.toMatch(/Promise\.all\(\[\s*readStoredCity\(\)/)
    const effect = src.slice(src.indexOf('const stored = await readStoredCity()'))
    expect(effect.indexOf('setSelection')).toBeGreaterThan(-1)
    expect(effect.indexOf('setSelection')).toBeLessThan(effect.indexOf('apiClient.getEventCities()'))
  })

  it('fires the feed only once the city is known', () => {
    expect(src).toMatch(/if \(!authLoading && user && feedCityReady\) \{/)
    expect(src).toMatch(/\}, \[user, authLoading, feedCityReady, selectedCity, searchTerm, filters\]\)/)
  })

  it('persists an inferred city so the next launch starts scoped', () => {
    expect(src).toMatch(/selection\?\.source === 'inferred'[\s\S]{0,120}storeCity\(selection\.city, 'inferred'\)/)
  })

  it('keys every location-scoped read on the same rounded fix', () => {
    expect(src).toMatch(/const lat = roundCoord\(userLocation\?\.latitude\)/)
    expect(src).toMatch(/const key = `\$\{roundCoord\(userLocation\.latitude\)\},\$\{roundCoord\(userLocation\.longitude\)\}`/)
    expect(src).not.toMatch(/lat: userLocation\?\.latitude/)
  })
})
