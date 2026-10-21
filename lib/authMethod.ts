import { useEffect, useState } from 'react'

/**
 * How this phone signed the account in: the one fact Settings' Account card needs and the session does not carry.
 *
 * An email account has a password to change; a Google or Apple account does not, and offering a reset link to one is a
 * door to nowhere. The server's `/auth/session` has no field for it (see the report: `signInMethod`), so the phone
 * remembers what it did at sign-in. A session that predates this is `null`, and the card then offers nothing it cannot
 * be sure of: it names the email and has no Password row.
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

/** The method for the screen that asks (null until read, and for a session older than this). */
export function useAuthMethod(): AuthMethod | null {
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
  return method
}
