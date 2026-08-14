import AsyncStorage from '@react-native-async-storage/async-storage'

import { parseStoredOnboarding, type StoredOnboarding } from './onboarding'
import { Logger } from './logger'

/**
 * Onboarding progress and the answers so far, across launches.
 *
 * Separate from `lib/onboarding.ts` for the same reason `cityStorage` is
 * separate from `city`: `jest-expo` runs on `testEnvironment: node`, where
 * AsyncStorage's native module does not exist, so mixing the two would make the
 * step logic untestable.
 *
 * ## Why anything is stored at all
 *
 * Because the server cannot answer "which screen were you on?". It holds the
 * *answers* — each step `PUT`s its own fields as it goes — but a half-filled
 * profile does not say whether the person stopped at step five or chose to
 * leave those fields empty. Nine screens is long enough that quitting partway
 * through is normal, and coming back to the first screen after answering five
 * is the kind of thing people do not do twice.
 *
 * The draft is stored alongside for the fields not yet sent — the ones on the
 * screen someone was looking at when they quit.
 *
 * ## Why it is per-account
 *
 * Keyed by user id. Two accounts on one device — which is every tester's
 * device — would otherwise share one progress record, and the second person to
 * sign in would resume into the first one's half-finished flow.
 *
 * Nothing here throws. A storage failure means starting onboarding at the
 * beginning, which is a worse experience and not a broken app.
 */

const KEY_PREFIX = 'blendn.onboarding.'

const keyFor = (userId: string) => `${KEY_PREFIX}${userId}`

export async function readOnboarding(userId: string): Promise<StoredOnboarding | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId))
    if (!raw) return null
    return parseStoredOnboarding(raw)
  } catch (error) {
    Logger.warn('auth', 'Could not read stored onboarding progress', { error })
    return null
  }
}

export async function writeOnboarding(
  userId: string,
  value: StoredOnboarding
): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(value))
  } catch (error) {
    Logger.warn('auth', 'Could not persist onboarding progress', { error })
  }
}

/**
 * Forget this account's progress.
 *
 * Called when onboarding finishes, so a later launch does not find a stale
 * record and try to resume a flow that is over. `profiles.onboarded` is the
 * durable answer from that point on.
 */
export async function clearOnboarding(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(userId))
  } catch (error) {
    Logger.warn('auth', 'Could not clear onboarding progress', { error })
  }
}
