/**
 * What the sign-in form held, kept in memory across a remount (a text-size change re-lays the screen out from scratch,
 * Opus review M4). Never the password, and never on disk.
 *
 * It is one person's: dropped whenever an account comes in (email, Google, Apple, a restored session) or goes out
 * (`useAuth`), so the next person to open the form on this phone finds it empty (re-review M1).
 */
export type HeldSignInForm = { mode: 'signin' | 'signup'; email: string; name: string; age: string }

const EMPTY: HeldSignInForm = { mode: 'signin', email: '', name: '', age: '' }

export const heldForm: HeldSignInForm = { ...EMPTY }

export function forgetHeldForm(): void {
  Object.assign(heldForm, EMPTY)
}
