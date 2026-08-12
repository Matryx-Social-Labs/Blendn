import AsyncStorage from '@react-native-async-storage/async-storage'

import { parseStoredCity, type CitySource, type StoredCity } from './city'
import { Logger } from './logger'

/**
 * Persisting the browsed city, and how it got there.
 *
 * Separate from `lib/city.ts` so the selection *rules* stay importable in a
 * plain node test. `jest-expo` runs on `testEnvironment: node`, where
 * AsyncStorage's native module does not exist — so a single file mixing the two
 * would make the rules untestable, which is how they became untested the first
 * time.
 *
 * Neither function throws. A storage failure on the launch path means falling
 * back to the busiest city, which is a worse default and not a broken app.
 *
 * The stored shape changed between versions; `parseStoredCity` in `lib/city.ts`
 * handles both, and lives there so the migration can be tested.
 */

const STORAGE_KEY = 'blendn.browse.city'

export async function readStoredCity(): Promise<StoredCity | null> {
  try {
    return parseStoredCity(await AsyncStorage.getItem(STORAGE_KEY))
  } catch (error) {
    Logger.warn('events', 'Could not read the stored browse city', { error })
    return null
  }
}

export async function storeCity(city: string, source: CitySource): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ city, source }))
  } catch (error) {
    Logger.warn('events', 'Could not persist the browse city', { error })
  }
}
