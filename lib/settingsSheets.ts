import { Linking } from 'react-native'

import { H } from './haptics'
import type { Sheet } from './sheet'
import { forgotPasswordMessage } from './signInRefusal'

/**
 * The sheets Settings opens, as the frames draw them (guidelines/flow-7: 10, 11, 12 and the R4.1 Account card 03, 05).
 * Plain `Sheet` values for `showSheet`, so each can be read, and tested, without rendering the screen.
 */

/** "Notifications are off": the phone says no, and only the phone's Settings can undo it. */
export const PUSH_BLOCKED_SHEET: Sheet = {
  kind: 'actions',
  hue: 'violet',
  icon: 'bell-off',
  title: 'Notifications are off',
  message: 'Turn them on in your phone’s Settings to get them from Blend’n.',
  actions: [
    { label: 'Open Settings', variant: 'primary', then: () => void Linking.openSettings().catch(() => {}) },
    { label: 'Not now', cancel: true },
  ],
}

type Toaster = (message: string, variant?: 'success' | 'error' | 'info') => void
type SignOut = (revokeAll?: boolean) => Promise<{ success: boolean; error?: string }>

/** What the landing says when the server did not confirm a sign-out: this phone is out, others may not be. */
export const SIGNED_OUT_UNCONFIRMED =
  'Signed out on this phone. We couldn’t reach the server, so you may stay signed in elsewhere for a while.'

/**
 * "Sign out?" asks first (one stray tap used to end the session). The affirmative is the sheet's white button, not red:
 * Sign out is routine and reversible. It plays `H.primary` on press-in (Flow 7 frame 11) and nothing on the sign-out
 * itself. Local state is gone either way; a server that did not confirm is a toast on the landing the guard moves to.
 */
export function signOutSheet({ signOut, showToast }: { signOut: SignOut; showToast: Toaster }): Sheet {
  return {
    kind: 'actions',
    hue: 'violet',
    icon: 'log-out',
    title: 'Sign out?',
    message: 'You’ll need to sign in again to see your events, friends and messages.',
    actions: [
      {
        label: 'Sign out',
        variant: 'primary',
        pressHaptic: () => H.primary(),
        /*
         * Not held on the server (RC drive D1): `signOut` clears this phone before its first await and the guard routes to
         * the entry screen, so the sheet closes now. The server's answer arrives later, as the toast.
         */
        run: async () => {
          void signOut()
            .then((result) => {
              if (!result.success) showToast(SIGNED_OUT_UNCONFIRMED, 'info')
            })
            .catch(() => showToast(SIGNED_OUT_UNCONFIRMED, 'info'))
          return { ok: true }
        },
      },
      { label: 'Cancel', cancel: true },
    ],
  }
}

/**
 * "Sign out everywhere?" (R4.1 7.1 frame 05): every session the account has, this one too, and the push tokens with
 * them. The affirmative is the strong white button and never red (R7); no haptic of its own. The server answers first and
 * nothing is cleared until it has: a failure keeps the sheet, says nothing was signed out, and Try again is honest.
 */
export function signOutEverywhereSheet({ signOutEverywhere }: { signOutEverywhere: () => Promise<{ success: boolean; error?: string }> }): Sheet {
  return {
    kind: 'actions',
    hue: 'violet',
    icon: 'smartphone',
    title: 'Sign out everywhere?',
    message: 'Every phone signed in to this account is signed out, this one too. Notifications stop on all of them.',
    actions: [
      {
        label: 'Sign out everywhere',
        variant: 'primary',
        run: async () => {
          try {
            const result = await signOutEverywhere()
            if (!result.success) return { ok: false, error: NOT_SIGNED_OUT_EVERYWHERE }
            return { ok: true }
          } catch {
            return { ok: false, error: NOT_SIGNED_OUT_EVERYWHERE }
          }
        },
      },
      { label: 'Cancel', cancel: true },
    ],
  }
}

/** What the sheet says when the server could not be reached: this phone is still signed in, and so is every other. */
export const NOT_SIGNED_OUT_EVERYWHERE = 'Couldn’t reach Blend’n, so nothing was signed out. Try again.'

/**
 * "Change your password?" (R4.1 7.1 frame 03): an email with a link, never a password typed here. Send link has no
 * haptic (an email is not a success). A refusal keeps the sheet and says why in the sheet's own words: the wait for a
 * 429 (`forgotPasswordMessage`), otherwise the server's sentence.
 */
export function passwordLinkSheet({
  email,
  sendLink,
  showToast,
}: {
  email: string
  sendLink: (email: string) => Promise<{ success: boolean; error?: string; errorCode?: string; retryAfter?: number }>
  showToast: Toaster
}): Sheet {
  return {
    kind: 'actions',
    hue: 'violet',
    icon: 'key-round',
    title: 'Change your password?',
    message: `We’ll email a link to ${email}. Reset links work once, and for an hour.`,
    actions: [
      {
        label: 'Send link',
        variant: 'primary',
        run: async () => {
          try {
            const result = await sendLink(email)
            if (!result.success) return { ok: false, error: forgotPasswordMessage(result) }
            showToast(`Check ${email} for the link`, 'info')
            return { ok: true }
          } catch {
            return { ok: false, error: 'Couldn’t send the reset link. Try again.' }
          }
        },
      },
      { label: 'Cancel', cancel: true },
    ],
  }
}
