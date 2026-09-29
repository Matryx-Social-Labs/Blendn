import { sendOutcome } from '../lib/sendOutcome'

/**
 * What became of one send — the decision the room and the direct message share.
 *
 * Two ways the composer lied, both invisible to the type checker:
 *
 * - A message moderation withheld came back as a 200, so a caller that read only
 *   `success` left the sender looking at their own words while nobody received
 *   them: accidental shadowbanning. The room was fixed and the DM, whose
 *   screening came later, was not.
 * - Every refusal read as one generic failure, so a muted user retried forever.
 */
describe('sendOutcome', () => {
  it('calls an accepted message sent', () => {
    expect(sendOutcome({ success: true, data: { id: 'm1', content: 'hi' } })).toEqual({ kind: 'sent' })
    expect(sendOutcome({ success: true })).toEqual({ kind: 'sent' })
  })

  it('calls a 200 with moderation_hidden withheld, not sent', () => {
    // `success` is true here, which is exactly why reading it alone was the bug.
    expect(sendOutcome({ success: true, data: { content: null, moderation_hidden: true } })).toEqual({
      kind: 'withheld',
    })
  })

  it('does not call a message withheld because the flag is false', () => {
    expect(sendOutcome({ success: true, data: { id: 'm1', moderation_hidden: false } })).toEqual({ kind: 'sent' })
  })

  it.each([
    ['USER_MUTED', "You're muted in this room."],
    ['CHAT_CLOSED', 'This chat has closed.'],
    ['SPAM_BLOCKED', 'Slow down a little.'],
  ])("keeps the server's own sentence for %s", (errorCode, error) => {
    expect(sendOutcome({ success: false, error, errorCode })).toEqual({ kind: 'failed', reason: error })
  })

  it("replaces a developer's message with the app's own sentence", () => {
    expect(sendOutcome({ success: false, error: 'Network request failed' })).toEqual({
      kind: 'failed',
      reason: "Couldn't send. Try again.",
    })
    expect(sendOutcome({ success: false, error: 'Invalid input: expected string', errorCode: 'VALIDATION' })).toEqual({
      kind: 'failed',
      reason: "Couldn't send. Try again.",
    })
  })

  it('fails a refusal even if it carries a moderation flag', () => {
    // A failure is a failure: the bubble is kept as "Not sent · Tap to retry",
    // never dropped as though moderation had removed it.
    expect(
      sendOutcome({ success: false, error: 'x', errorCode: 'USER_MUTED', data: { moderation_hidden: true } })
    ).toMatchObject({ kind: 'failed' })
  })
})
