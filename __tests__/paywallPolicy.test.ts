/**
 * MN-U06 — when the Blendn+ paywall may open by itself (plan v1 "Upgrade
 * prompts"; plan v2 step 11). The windows are written out as literals here,
 * never read from the module under test: a cooldown that drifted from days to
 * hours must fail this file, not move it.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))

/* eslint-disable import/first */
import {
  EMPTY_MEMORY,
  isPaywallTrigger,
  mayOpenPaywall,
  nightOf,
  readPaywallMemory,
  rememberPaywallEvent,
  writePaywallMemory,
  type PaywallContext,
  type PaywallMemory,
} from '../lib/paywallPolicy'
/* eslint-enable import/first */

const HOUR = 60 * 60 * 1000
const DAY = 24 * 60 * 60 * 1000
/** Local times, so the 06:00 reset is tested in whatever zone the runner is in. */
const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime()
const NOW = local(10, 22)

const AUTO: PaywallContext = { userInitiated: false, automaticShownThisSession: false, pathname: '/(tabs)/events', roomOpen: false }
const TAP: PaywallContext = { ...AUTO, userInitiated: true }
const memory = (patch: Partial<PaywallMemory>): PaywallMemory => ({ ...EMPTY_MEMORY, ...patch })

describe('go_live_expiry: once a night, the night ending at 06:00 local', () => {
  it('opens the first time, not again the same night', () => {
    expect(mayOpenPaywall('go_live_expiry', EMPTY_MEMORY, NOW, AUTO)).toBe(true)
    const shown = memory({ shown: { go_live_expiry: local(10, 21) } })
    expect(mayOpenPaywall('go_live_expiry', shown, NOW, AUTO)).toBe(false)
  })

  it('01:30 is still the night before; 06:00 is a new night', () => {
    const shown = memory({ shown: { go_live_expiry: local(10, 23) } })
    expect(mayOpenPaywall('go_live_expiry', shown, local(11, 1, 30), AUTO)).toBe(false)
    expect(mayOpenPaywall('go_live_expiry', shown, local(11, 5, 59), AUTO)).toBe(false)
    expect(mayOpenPaywall('go_live_expiry', shown, local(11, 6, 0), AUTO)).toBe(true)
  })

  it('nightOf counts 00:00–05:59 as the night before', () => {
    expect(nightOf(local(11, 5, 59))).toBe(nightOf(local(10, 20)))
    expect(nightOf(local(11, 6))).not.toBe(nightOf(local(10, 20)))
  })
})

describe('second_event / first_match: 14 days after a dismiss — one offer, two moments', () => {
  it('opens with no dismiss; stays quiet until 14 whole days after one', () => {
    expect(mayOpenPaywall('second_event', EMPTY_MEMORY, NOW, AUTO)).toBe(true)
    const dismissed = memory({ dismissed: { second_event: NOW - 14 * DAY + HOUR } })
    expect(mayOpenPaywall('second_event', dismissed, NOW, AUTO)).toBe(false)
    expect(mayOpenPaywall('second_event', memory({ dismissed: { second_event: NOW - 14 * DAY } }), NOW, AUTO)).toBe(true)
  })

  it('13 days is not enough (a cooldown in hours would pass here)', () => {
    const dismissed = memory({ dismissed: { first_match: NOW - 13 * DAY } })
    expect(mayOpenPaywall('first_match', dismissed, NOW, AUTO)).toBe(false)
  })

  it('a dismiss of either quiets both', () => {
    const dismissed = memory({ dismissed: { first_match: NOW - 2 * DAY } })
    expect(mayOpenPaywall('second_event', dismissed, NOW, AUTO)).toBe(false)
  })

  it('being shown without a dismiss starts no cooldown', () => {
    expect(mayOpenPaywall('second_event', memory({ shown: { second_event: NOW - HOUR } }), NOW, AUTO)).toBe(true)
  })
})

describe('recap: weekly', () => {
  it('quiet for 7 days after it was shown', () => {
    expect(mayOpenPaywall('recap', EMPTY_MEMORY, NOW, AUTO)).toBe(true)
    expect(mayOpenPaywall('recap', memory({ shown: { recap: NOW - 6 * DAY } }), NOW, AUTO)).toBe(false)
    expect(mayOpenPaywall('recap', memory({ shown: { recap: NOW - 7 * DAY } }), NOW, AUTO)).toBe(true)
  })
})

describe('perk and profile: only ever on a tap, and then always', () => {
  it('never open by themselves', () => {
    expect(mayOpenPaywall('perk', EMPTY_MEMORY, NOW, AUTO)).toBe(false)
    expect(mayOpenPaywall('profile', EMPTY_MEMORY, NOW, AUTO)).toBe(false)
  })

  it('a tap opens any trigger, whatever the cooldowns, the session or the surface', () => {
    const quiet = memory({ shown: { go_live_expiry: NOW - HOUR, recap: NOW - HOUR }, dismissed: { second_event: NOW - HOUR } })
    const everything = { ...TAP, automaticShownThisSession: true, pathname: '/chat/g1' }
    for (const t of ['go_live_expiry', 'second_event', 'first_match', 'recap', 'perk', 'profile'] as const) {
      expect(mayOpenPaywall(t, quiet, NOW, everything)).toBe(true)
    }
  })
})

describe('over all of them', () => {
  it('at most one automatic paywall per app session', () => {
    expect(mayOpenPaywall('second_event', EMPTY_MEMORY, NOW, { ...AUTO, automaticShownThisSession: true })).toBe(false)
    expect(mayOpenPaywall('go_live_expiry', EMPTY_MEMORY, NOW, { ...AUTO, automaticShownThisSession: true })).toBe(false)
  })

  it.each([
    ['/onboarding/basics'],
    ['/chat/g1'],
    ['/private-chat/c1'],
    ['/room'],
    ['/event/e1'],
  ])('never by itself over %s (onboarding, a chat, the room, a check-in)', (pathname) => {
    expect(mayOpenPaywall('go_live_expiry', EMPTY_MEMORY, NOW, { ...AUTO, pathname })).toBe(false)
  })

  it('never by itself over the Blend\'n room overlay, whatever the route', () => {
    expect(mayOpenPaywall('go_live_expiry', EMPTY_MEMORY, NOW, { ...AUTO, roomOpen: true })).toBe(false)
  })

  it('a place, a tab or settings is fine', () => {
    for (const pathname of ['/venue/v1', '/(tabs)/going', '/settings', '/events']) {
      expect(mayOpenPaywall('go_live_expiry', EMPTY_MEMORY, NOW, { ...AUTO, pathname })).toBe(true)
    }
  })
})

describe('the memory', () => {
  it('shown and dismissed stamp their trigger; the rest change nothing', () => {
    const shown = rememberPaywallEvent(EMPTY_MEMORY, 'recap', 'shown', 5)
    expect(shown).toEqual({ shown: { recap: 5 }, dismissed: {} })
    expect(rememberPaywallEvent(shown, 'recap', 'dismissed', 6)).toEqual({ shown: { recap: 5 }, dismissed: { recap: 6 } })
    expect(rememberPaywallEvent(shown, 'recap', 'purchased', 7)).toBe(shown)
    expect(EMPTY_MEMORY).toEqual({ shown: {}, dismissed: {} })
  })

  it('survives a restart, and a garbled one reads as empty', async () => {
    await writePaywallMemory(memory({ shown: { go_live_expiry: NOW } }))
    expect(await readPaywallMemory()).toEqual({ shown: { go_live_expiry: NOW }, dismissed: {} })
    await require('@react-native-async-storage/async-storage').setItem('blendn.paywall.memory', '{nope')
    expect(await readPaywallMemory()).toEqual({ shown: {}, dismissed: {} })
  })

  it('the triggers are exactly the six the server accepts', () => {
    for (const t of ['go_live_expiry', 'second_event', 'first_match', 'recap', 'perk', 'profile']) expect(isPaywallTrigger(t)).toBe(true)
    expect(isPaywallTrigger('boost')).toBe(false)
    expect(isPaywallTrigger(undefined)).toBe(false)
  })
})
