/**
 * The prompt, and the automatic check-out that may follow it (`PresenceMonitor`, `PresenceSheets`).
 *
 * The server judges presence (`usePresence`); the app only asks, and says so when the server has checked somebody out.
 *
 * "Are you still at" rather than "you appear to have left", because the second
 * asserts something we are not sure about — and being told you left when you
 * did not is the moment someone stops trusting the app.
 *
 * The automatic message exists because a silent check-out is the worst version
 * of this: someone finds themselves out of the chat with no explanation and no
 * idea how to get back.
 */
export const PRESENCE_COPY = {
  ask: {
    title: 'Still at the event?',
    body: 'It looks like you’ve moved away. If you’ve left, we’ll check you out so the room stays accurate.',
    stay: 'I’m still here',
    leave: 'Check me out',
  },
  autoCheckedOut: {
    title: 'Checked out',
    body: 'You’ve been away from the venue for a while, so we checked you out. You can check back in any time you’re there.',
  },
} as const
