import AsyncStorage from '@react-native-async-storage/async-storage'

import { Logger } from './logger'

/**
 * Whether this person has seen the public check-in warning.
 *
 * Local rather than a server column, deliberately. "Have you read this" is a
 * fact about a device and a person, not about an account — and the cost of
 * getting it wrong is asymmetric in a way that favours local:
 *
 *  - A lost record shows the warning a second time. Mildly annoying.
 *  - A server column read on the check-in path adds a round trip to the one
 *    action that has to feel instant, and check-in already spends its latency
 *    budget on GPS.
 *
 * Per user id, because two accounts on one device is every tester's device, and
 * the second person has not read anything.
 *
 * Nothing throws. A storage failure means the warning shows again, which is the
 * safe direction.
 */

const KEY_PREFIX = 'blendn.checkinWarning.'

export async function hasSeenPublicCheckInWarning(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(`${KEY_PREFIX}${userId}`)) === 'seen'
  } catch (error) {
    Logger.warn('events', 'Could not read the check-in warning flag', { error })
    // Failing to "not seen" shows the warning again rather than silently
    // skipping it. On a consent dialog that is the only safe default.
    return false
  }
}

export async function markPublicCheckInWarningSeen(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`${KEY_PREFIX}${userId}`, 'seen')
  } catch (error) {
    Logger.warn('events', 'Could not persist the check-in warning flag', { error })
  }
}
