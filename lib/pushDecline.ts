import AsyncStorage from '@react-native-async-storage/async-storage'

import { Logger } from './logger'

/**
 * "Maybe later" on onboarding's notifications step, remembered per account.
 *
 * Push registration asks the OS for permission, and it starts the moment
 * somebody reaches the tabs. Without this, the person who had just said
 * "maybe later" got the system dialog a few seconds after saying it, which
 * made the explainer step pointless. A declined account registers only if the
 * permission is already granted and never asks; turning notifications on in
 * Settings clears this and asks.
 *
 * Only onboarding writes it, so accounts that onboarded before it existed
 * behave as they always did. Per account, because two people share a test
 * phone. Nothing here throws: a failed read means asking, as before.
 */
const keyFor = (userId: string) => `blendn.push.declined.${userId}`

export async function markPushDeclined(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId), '1')
  } catch (error) {
    Logger.warn('notifications', 'Could not record the push decline', { error })
  }
}

export async function clearPushDeclined(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(userId))
  } catch (error) {
    Logger.warn('notifications', 'Could not clear the push decline', { error })
  }
}

export async function hasDeclinedPush(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(keyFor(userId))) === '1'
  } catch {
    return false
  }
}
