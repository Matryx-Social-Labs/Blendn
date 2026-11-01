import * as AppleAuthentication from 'expo-apple-authentication'
import { Platform } from 'react-native'

import { googleSignInConfig } from './googleConfig'
import { Logger } from './logger'

/**
 * What deleting an account proves (SCRUM-944 (3), owner row A-18): a bearer token alone no longer erases an account.
 * An account with a password sends the password; a Google or Apple account signs in with its provider once more, and the
 * fresh token goes with the delete (the server takes one no older than 15 minutes, whose subject is one of the account's
 * links). Apple's sheet also hands out the `authorizationCode` the server needs to revoke the Apple grant (5.1.1(v)).
 *
 * `DELETE /api/mobile/account`; the server answers 403 `PASSWORD_INCORRECT` or `REAUTH_REQUIRED` and erases nothing
 * when the proof is missing or wrong.
 */
export type DeletionProof = {
  password?: string
  googleIdToken?: string
  appleIdentityToken?: string
  appleAuthorizationCode?: string
}

export { DELETION_REFUSED } from './signInRefusal'

/**
 * The Apple sheet once more. Null when it is cancelled, unavailable or fails: then nothing is deleted. Android has no Sign
 * in with Apple, and the app offers none there, so an Apple-only account never holds an Android session to delete from.
 */
export async function appleProofForDeletion(): Promise<DeletionProof | null> {
  try {
    if (!(await AppleAuthentication.isAvailableAsync())) return null
    const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] })
    if (!credential.identityToken) return null
    return {
      appleIdentityToken: credential.identityToken,
      ...(credential.authorizationCode ? { appleAuthorizationCode: credential.authorizationCode } : {}),
    }
  } catch (error) {
    const cancelled = (error as { code?: string } | null)?.code === 'ERR_REQUEST_CANCELED'
    if (!cancelled) Logger.warn('auth', 'Apple re-authentication for deletion failed', { error })
    return null
  }
}

/**
 * The Google sheet once more. Configured here too: a session restored at launch never mounts the sign-in screen that
 * configures it. Null when cancelled or failed. Loaded at call time, so Settings does not pull the native module into
 * every import of it (jest's node environment has none).
 */
export async function googleProofForDeletion(): Promise<DeletionProof | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GoogleSignin } = require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin')
    GoogleSignin.configure(googleSignInConfig())
    if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
    const result = await GoogleSignin.signIn()
    const idToken = result.data?.idToken
    return idToken ? { googleIdToken: idToken } : null
  } catch (error) {
    Logger.warn('auth', 'Google re-authentication for deletion failed', { error })
    return null
  }
}
