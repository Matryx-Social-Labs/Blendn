/**
 * Bugs found driving the app on the simulator against staging (2026-09-29),
 * pinned where a render test would cost more than the bug.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { CHECK_IN_CODES, isExpectedRefusal } from '../lib/checkInRefusal'
import { notificationLabel } from '../lib/notificationFormat'

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')

describe('check-in refusals are not errors', () => {
  it('treats every refusal the door gives as expected', () => {
    for (const code of Object.values(CHECK_IN_CODES)) expect(isExpectedRefusal(code)).toBe(true)
  })

  it('keeps an unknown or missing code an error', () => {
    expect(isExpectedRefusal(undefined)).toBe(false)
    expect(isExpectedRefusal('INTERNAL_ERROR')).toBe(false)
  })

  it('logs expected refusals at info and only the rest at error', () => {
    const src = read('lib', 'useCheckInFlow.ts')
    expect(src).toMatch(/isExpectedRefusal\(outcome\.errorCode\)[\s\S]{0,80}Logger\.info\('events', 'checkin:refused'/)
  })
})

describe('the Going count follows an RSVP', () => {
  it('applies the rsvpCount the server returns, on RSVP and on cancel', () => {
    const src = read('components', 'screens', 'EventDetailScreen.tsx')
    expect(src).toContain('if (typeof result.data.rsvpCount === \'number\') setGoingCount(result.data.rsvpCount)')
    expect(src).toMatch(/cancelRsvp[\s\S]{0,400}setGoingCount\(result\.data\.rsvpCount\)/)
  })
})

describe('notification rows for VoiceOver', () => {
  it('puts one full stop between parts, never two', () => {
    expect(notificationLabel('Board Game Night', "The night's over. Only you see what you say.", '8h')).toBe(
      "Board Game Night. The night's over. Only you see what you say. 8h"
    )
    expect(notificationLabel('Tuesday Stand-up', 'Starting in ~60 minutes', '14h')).toBe(
      'Tuesday Stand-up. Starting in ~60 minutes. 14h'
    )
    expect(notificationLabel('Hi!', '', '1h')).toBe('Hi! 1h')
  })
})

describe('the room chat dock', () => {
  it('says "1 message", not "1 messages"', () => {
    expect(read('components', 'blendn', 'ChatDock.tsx')).toContain("count === 1 ? 'message' : 'messages'")
  })
})

describe('the conversation ⋮ menu', () => {
  const src = read('lib', 'safetyUtils.ts')
  it('opens a neutral menu with leaving one step in', () => {
    expect(src).toMatch(/export const showConversationOptions/)
    expect(src).toMatch(/label: fromMatch \? 'Unmatch…' : 'End conversation…',\s*variant: 'destructive',\s*next: \(\) => leaveConversationSheet/)
    expect(read('app', 'private-chat', '[conversationId].tsx')).toContain('showConversationOptions(')
  })
})

describe('action trays', () => {
  it('scroll their buttons rather than run off the bottom of the screen', () => {
    const src = read('components', 'ActionTray.tsx')
    expect(src).toMatch(/<ScrollView\s+style=\{styles\.buttonsScroll\}/)
    expect(src).toContain('buttonsScroll: { flexShrink: 1, flexGrow: 0 }')
  })
})
