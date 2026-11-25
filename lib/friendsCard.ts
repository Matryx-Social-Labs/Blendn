import AsyncStorage from '@react-native-async-storage/async-storage'

import { Logger } from './logger'

/**
 * "Bring your friends" on the Pulse (ledger row 14): retired for good once the link was shared or the card dismissed,
 * per account (two people can share a test phone). Nothing here throws: a failed read shows the card, which can be
 * dismissed again; a failed write costs one more showing.
 */
const keyFor = (userId: string) => `blendn.friendsCard.done.${userId}`

export async function friendsCardDone(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(keyFor(userId))) === '1'
  } catch (error) {
    Logger.warn('general', 'Could not read the friends card state', { error })
    return false
  }
}

export async function retireFriendsCard(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId), '1')
  } catch (error) {
    Logger.warn('general', 'Could not record the friends card as done', { error })
  }
}
