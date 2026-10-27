import * as AppleAuthentication from 'expo-apple-authentication'

import { Logger } from './logger'

/**
 * Sign in with Apple, once more, on the way out (App Review 5.1.1(v)).
 *
 * Deleting an account that signed in with Apple has to revoke the app's Apple grant, and the server can only revoke
 * it with a fresh `authorizationCode`, which only the Apple sheet hands out. So deleting an Apple account opens the
 * sheet first, and the code goes with the delete (`appleAuthorizationCode`, `DELETE /api/mobile/account`).
 *
 * Deleting never waits on Apple: a cancelled sheet, a phone without Sign in with Apple (Android) or any other failure
 * answers `null`, the account is deleted anyway, and the person is told how to remove the grant themselves
 * (`APPLE_UNLINK_HINT`).
 */
export async function appleCodeForDeletion(): Promise<string | null> {
  try {
    if (!(await AppleAuthentication.isAvailableAsync())) return null
    const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] })
    return credential.authorizationCode || null
  } catch (error) {
    const cancelled = (error as { code?: string } | null)?.code === 'ERR_REQUEST_CANCELED'
    if (!cancelled) Logger.warn('auth', 'Apple re-authentication for deletion failed', { error })
    return null
  }
}

/** Said after a deletion whose Apple grant could not be revoked from here. */
export const APPLE_UNLINK_HINT = 'You can also remove Blend’n from Apple ID › Sign in with Apple.'
