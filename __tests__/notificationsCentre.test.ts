import { readFileSync } from 'fs'
import { join } from 'path'

import { badgeLabel, notificationAge } from '../lib/notificationFormat'

const SRC = () => readFileSync(join(__dirname, '..', 'lib', 'notifications.ts'), 'utf8')
const BELL = () =>
  readFileSync(join(__dirname, '..', 'components', 'pulse', 'NotificationBell.tsx'), 'utf8')

/**
 * Declarations only.
 *
 * These blocks carry comments explaining *why* a route is not used, and those
 * comments name the very things the assertions forbid — so a plain substring
 * match finds the word in the prose and fails on correct code.
 */
const codeOnly = (block: string) =>
  block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('*') && !l.startsWith('/*') && !l.startsWith('//'))
    .join('\n')

describe('notificationAge', () => {
  const now = Date.parse('2026-08-16T12:00:00Z')
  const ago = (ms: number) => new Date(now - ms).toISOString()

  it('reads as a scannable column, not a sentence', () => {
    // `Intl.RelativeTimeFormat` gives "2 minutes ago", which wraps at this
    // width and pushes the title around. The bell is scanned, not read.
    expect(notificationAge(ago(30_000), now)).toBe('now')
    expect(notificationAge(ago(5 * 60_000), now)).toBe('5m')
    expect(notificationAge(ago(3 * 3600_000), now)).toBe('3h')
    expect(notificationAge(ago(2 * 86400_000), now)).toBe('2d')
    expect(notificationAge(ago(10 * 86400_000), now)).toBe('1w')
    expect(notificationAge(ago(60 * 86400_000), now)).toBe('2mo')
    expect(notificationAge(ago(400 * 86400_000), now)).toBe('1y')
  })

  it('does not go backwards on a clock skew', () => {
    // The server stamps `created_at`; the device supplies `now`. A phone whose
    // clock is a few seconds behind must not render "-1m".
    expect(notificationAge(new Date(now + 5000).toISOString(), now)).toBe('now')
  })

  it('returns empty rather than NaN for an unparseable date', () => {
    expect(notificationAge('not a date', now)).toBe('')
  })
})

describe('badgeLabel', () => {
  it('caps at 9+, because the badge is 18pt wide', () => {
    expect(badgeLabel(0)).toBeNull()
    expect(badgeLabel(1)).toBe('1')
    expect(badgeLabel(9)).toBe('9')
    expect(badgeLabel(10)).toBe('9+')
    expect(badgeLabel(1284)).toBe('9+')
  })

  it('draws nothing at zero or on nonsense', () => {
    // `null` rather than "0": a badge showing zero is a badge that is always
    // there, which is the thing people stop seeing.
    expect(badgeLabel(-3)).toBeNull()
    expect(badgeLabel(NaN)).toBeNull()
  })
})

describe('every kind the server can send goes somewhere', () => {
  /**
   * The eleven in `notification_kind` / `NotificationData["type"]`.
   *
   * Five of these — the ones marked below — fell straight through
   * `navigateFromNotificationData` and navigated nowhere. They are kinds
   * `sendPushNotification` actually emits, so tapping one of those pushes
   * opened the app and left you where you were, which reads as the
   * notification being broken.
   */
  const KINDS = [
    'private_message',
    'group_message',
    'event_checkin',
    'event_update',
    'announcement',
    'message_request', // was falling through
    'message_request_response', // was falling through
    'waitlist_promoted', // was falling through
    'match',
    'reveal_request', // was falling through
    'reveal', // was falling through
  ]

  it('has a case in the switch for all eleven', () => {
    const switchBody = SRC().slice(
      SRC().indexOf('export function navigateFromNotificationData'),
      SRC().indexOf('export function setupNotificationResponseListener')
    )
    const missing = KINDS.filter((k) => !switchBody.includes(`case '${k}'`))
    // Listed rather than counted, so a failure names the kind to write up.
    expect(missing).toEqual([])
  })

  it('never deep-links a reveal to a profile', () => {
    /*
     * The reveal gate decides what you may see of somebody and is enforced by
     * the screens that ask the server. Routing `reveal`/`reveal_request` to a
     * profile keyed on `senderId` would be the app asserting an entitlement
     * the server has not granted — the same class as the `interestedPreview`
     * leak.
     */
    const src = SRC()
    const reveal = src.slice(src.indexOf("case 'reveal_request':"))
    const block = codeOnly(reveal.slice(0, reveal.indexOf('break')))
    expect(block).not.toContain('/user/')
    expect(block).not.toContain('senderId')
    expect(block).toContain("router.push('/room')")
  })

  it('never deep-links a message request to the sender', () => {
    // A request from somebody you have not accepted must not open a profile
    // you are not yet entitled to see. The decision is accept-or-decline.
    const src = SRC()
    const req = src.slice(src.indexOf("case 'message_request':"))
    const block = codeOnly(req.slice(0, req.indexOf('break')))
    expect(block).not.toContain('/user/')
    expect(block).toContain("router.push('/(tabs)/chat')")
  })
})

describe('the bell reuses the push switch rather than copying it', () => {
  it('calls navigateFromNotificationData', () => {
    /*
     * A bell row and a tapped push describe the same event and carry the same
     * payload — the server stores exactly what it sent. Two switches would be
     * two places to add a case, and the one nobody remembered would quietly
     * open the wrong screen.
     */
    const bell = BELL()
    expect(bell).toContain('navigateFromNotificationData')
    // No second switch on `kind` in the component.
    expect(bell).not.toMatch(/switch\s*\(\s*item\.kind/)
  })

  it('marks everything read on open, not per row', () => {
    /*
     * The badge answers one question — "is there something I have not seen" —
     * and looking at the list is the act that answers it. Per-row marking
     * leaves a badge lit after you have read everything in it, which teaches
     * people to ignore the badge.
     */
    expect(BELL()).toContain('apiClient.markNotificationsRead()')
  })

  it('does not poll', () => {
    // A poll costs a request every few seconds on the app's busiest screen for
    // a number that changes a handful of times a day.
    const bell = BELL()
    expect(bell).not.toContain('setInterval')
  })
})
