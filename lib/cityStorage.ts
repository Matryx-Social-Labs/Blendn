import AsyncStorage from '@react-native-async-storage/async-storage'

import { Logger } from './logger'

/**
 * Persisting the browsed city.
 *
 * Separate from `lib/city.ts` so the selection *rules* stay importable in a
 * plain node test. `jest-expo` runs on `testEnvironment: node`, where
 * AsyncStorage's native module does not exist — so a single file mixing the two
 * would make the rules untestable, which is how they became untested the first
 * time.
 *
 * Neither function throws. A storage failure on the launch path means falling
 * back to the busiest city, which is a worse default and not a broken app.
 */

const STORAGE_KEY = 'blendn.browse.city'

export async function readStoredCity(): Promise<string | null> {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEY)
    return value?.trim() || null
  } catch (error) {
    // A storage failure means we fall back to the busiest city, which is a
    // worse default and not a broken app. Never throw on the launch path.
    Logger.warn('events', 'Could not read the stored browse city', { error })
    return null
  }
}

export async function storeCity(city: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, city)
  } catch (error) {
    Logger.warn('events', 'Could not persist the browse city', { error })
  }
}
