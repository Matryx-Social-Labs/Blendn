/** `POST /message-requests` refused the request's text: 400 VALIDATION_FAILED with this `reasonCode` and a human sentence in `error`. */
export const TEXT_NOT_ALLOWED = 'TEXT_NOT_ALLOWED'

/**
 * The server's own sentence when it refused the text of a message request, else `undefined`: a network failure or a 500
 * keeps the caller's generic line, which is all it can honestly say.
 */
export function requestTextRefusal(result: { reasonCode?: string; error?: string }): string | undefined {
  if (result.reasonCode !== TEXT_NOT_ALLOWED) return undefined
  return result.error?.trim() || undefined
}
