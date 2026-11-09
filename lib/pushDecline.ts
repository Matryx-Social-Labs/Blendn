import AsyncStorage from '@react-native-async-storage/async-storage'

import { Logger } from './logger'

/**
 * A "not now" to push, remembered per account: from the in-context sheet (`lib/pushAsk.ts`) and, on builds before
 * Flow 2's five steps, from onboarding's notifications step.
 *
 * Push registration asks the OS for permission, and it starts the moment
 * somebody reaches the tabs. Without this, the person who had just said
 * "maybe later" got the system dialog a few seconds after saying it, which
 * made the explainer step pointless. A declined account registers only if the
 * permission is already granted and never asks; turning notifications on in
 * Settings clears this and asks.
 *
 * Accounts that never said no behave as they always did. Per account, because
 * two people share a test phone. Nothing here throws: a failed read means
 * asking, as before.
 */
const keyFor = (userId: string) => `blendn.push.declined.${userId}`

/*
 * "Ask later", set where onboarding finishes (Flow 2, 2026-11). The notifications step is gone: push is asked the first
 * time somebody says "I'm going" (`lib/pushAsk.ts`), when the reason is obvious. Without this a brand-new account would
 * get the bare OS dialog two seconds after reaching the tabs. Unlike a decline it is not a no: the in-context ask
 * ignores it, and any yes clears it with the decline (`clearPushDeclined`).
 */
const deferredKeyFor = (userId: string) => `blendn.push.deferred.${userId}`

export async function markPushDeclined(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId), '1')
  } catch (error) {
    Logger.warn('notifications', 'Could not record the push decline', { error })
  }
}

/** A yes, from wherever it came (the in-context sheet, the crew ask, Settings): neither the no nor the "later" stands. */
export async function clearPushDeclined(userId: string): Promise<void> {
  try {
    await AsyncStorage.multiRemove([keyFor(userId), deferredKeyFor(userId)])
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

export async function markPushDeferred(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(deferredKeyFor(userId), '1')
  } catch (error) {
    Logger.warn('notifications', 'Could not record the push deferral', { error })
  }
}

export async function hasDeferredPush(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(deferredKeyFor(userId))) === '1'
  } catch {
    return false
  }
}

/**
 * Whether the tabs' start-up may show the OS dialog. It registers either way when permission is already granted.
 * Accounts onboarded before the deferral existed hold neither key, so they are asked as they always were.
 */
export async function mayPromptAtStartUp(userId: string): Promise<boolean> {
  const [declined, deferred] = await Promise.all([hasDeclinedPush(userId), hasDeferredPush(userId)])
  return !declined && !deferred
}
