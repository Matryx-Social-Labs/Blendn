/* The not-found screen echoes a path only when it is shaped like one of our links (security review, 2026-10-22). */
jest.mock('expo-router', () => ({ router: { replace: jest.fn() }, usePathname: jest.fn() }))
import { echoable } from '../app/+not-found'

it.each([
  ['/event/abc123', true],
  ['/e/a1b2', true],
  ['/crews/xyz/members', true],
  ['/Your-account-is-locked-call-1800', false],
  ['/event/Your account is locked', false],
  ['/event/a/b/c/d', false],
  ['/', false],
  [null, false],
  ['/' + 'x'.repeat(80), false],
])('%s → %s', (path, ok) => expect(echoable(path as string | null)).toBe(ok))
