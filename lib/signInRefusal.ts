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

/**
 * What the form says when the server refused for too many tries (SCRUM-487).
 *
 * The 429 carries `retryAfter` in seconds, and the form used to show only the
 * server's "Too many requests": try again now, later, or never? The limit is
 * keyed on the network (the IP), which is why it says so — on venue Wi-Fi it
 * is somebody else's sign-ups that used it up.
 */
export function rateLimitedMessage(what: 'sign-ups' | 'sign-in attempts', retryAfter: number | undefined): string {
  return `Too many ${what} from this network. Try again ${waitPhrase(retryAfter)}.`
}

function waitPhrase(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return 'later'
  const minutes = Math.ceil(seconds / 60)
  if (minutes <= 1) return 'in a minute'
  if (minutes < 60) return `in ${minutes} minutes`
  const hours = Math.ceil(minutes / 60)
  return hours === 1 ? 'in an hour' : `in ${hours} hours`
}
