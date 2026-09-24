/**
 * What the entry screen says when "Sign in with Google" or "Sign in with Apple"
 * reached our server and did not come back with a session.
 *
 * A **refusal** (`FORBIDDEN`: a suspended account, or a staff account in the
 * attendee app) is the server telling this person something they can act on,
 * so its sentence is shown as it is. Anything else — the network, a 5xx, a
 * token that would not verify — gets the generic line, because the raw text
 * ("HTTP 502 …") is not written for them.
 *
 * Both social handlers used to show the generic line for everything, so a
 * dashboard admin tapping Google read "Couldn't sign in with Google. Please try
 * again." and reported the button as broken (SCRUM-289). Email sign-in showed
 * the server's sentence all along.
 */
export function socialSignInMessage(
  provider: 'Google' | 'Apple',
  result: { error?: string; errorCode?: string }
): string {
  if (result.errorCode === 'FORBIDDEN' && result.error) return result.error
  return `Couldn't sign in with ${provider}. Please try again.`
}
