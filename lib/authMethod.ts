import { useEffect, useState } from 'react'

/**
 * What the account signs in with: the one fact Settings' Account card needs to show or hide the Password row.
 *
 * An email account has a password to change; a Google or Apple account does not, and offering a reset link to one is a
 * door to nowhere. The server answers for the account (`GET /auth/session` `signInMethod`: a password first, else the
 * provider linked most recently) and that answer wins, so a session that predates this app version, or an account that
 * added a password since, is right as soon as the session is read. What the phone did at sign-in is the fallback until
 * then. With neither it is `null`, and the card offers nothing it cannot be sure of: it names the email and has no
 * Password row.
 *
 * AsyncStorage is loaded at call time, as `lib/sessionEvents.ts` does: `useAuth` imports this module, and the native
 * module is null under jest's node environment the moment it is imported.
 */
export type AuthMethod = 'password' | 'google' | 'apple'

const KEY = 'blendn.auth.method'
const storage = (): typeof import('@react-native-async-storage/async-storage').default => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@react-native-async-storage/async-storage')
  return mod.default ?? mod
}

export const isAuthMethod = (value: unknown): value is AuthMethod => value === 'password' || value === 'google' || value === 'apple'

export async function rememberAuthMethod(method: AuthMethod): Promise<void> {
  try {
    await storage().setItem(KEY, method)
  } catch {
    // Not remembering costs the Password row, never the sign-in.
  }
}

export async function readAuthMethod(): Promise<AuthMethod | null> {
  try {
    const stored = await storage().getItem(KEY)
    return isAuthMethod(stored) ? stored : null
  } catch {
    return null
  }
}

/** With the session: the next person on this phone did not sign in the way the last one did. */
export async function forgetAuthMethod(): Promise<void> {
  try {
    await storage().removeItem(KEY)
  } catch {
    // Read back as null at worst.
  }
}

/** The method for the screen that asks: the server's answer when the session has one, else what this phone remembered. */
export function useAuthMethod(fromServer?: unknown): AuthMethod | null {
  const [method, setMethod] = useState<AuthMethod | null>(null)
  useEffect(() => {
    let live = true
    void readAuthMethod().then((m) => {
      if (live) setMethod(m)
    })
    return () => {
      live = false
    }
  }, [])
  return isAuthMethod(fromServer) ? fromServer : method
}
