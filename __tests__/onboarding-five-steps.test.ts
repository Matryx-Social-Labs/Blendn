/**
 * Onboarding in five steps (Flow 2, SCRUM-1002).
 *
 * Notifications and "your journey" left the flow. Push is asked when somebody first says "I'm going", so
 * the tabs must not put the bare OS dialog in front of a brand-new account two seconds after it lands; and
 * anyone part-way through on an older build must land on a sensible step, not step one.
 *
 * Controls (recorded 2026-11-01, each assertion seen failing against the unchanged source):
 *  - with the old step list, the order and `Step N of 5` tests fail;
 *  - with the parser unmapped, a stored `notifications` / `journey` resets to `basics`;
 *  - with `clearPushDeclined` clearing only its own key, "a yes clears the deferral" fails;
 *  - with `_layout` still prompting on `!declined`, the wiring test fails.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('../lib/logger', () => ({
  Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

import { readFileSync } from 'fs'
import { join } from 'path'
import { ONBOARDING_STEPS, parseStoredOnboarding, progress, stepLabel } from '../lib/onboarding'
import {
  clearPushDeclined,
  hasDeferredPush,
  markPushDeclined,
  markPushDeferred,
  mayPromptAtStartUp,
} from '../lib/pushDecline'

const read = (file: string) =>
  readFileSync(join(__dirname, '..', file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const stored = (step: string, completed: string[]) =>
  JSON.stringify({ progress: { step, completed }, draft: { name: 'Émilie Tremblay' } })

describe('the steps', () => {
  it('are five questions and the payoff, in this order', () => {
    expect(ONBOARDING_STEPS).toEqual(['basics', 'preferences', 'details', 'media', 'location', 'ready'])
  })

  it('count the questions only: "Step 1 of 5" to "Step 5 of 5", and nothing on the payoff', () => {
    expect(stepLabel('basics')).toBe('Step 1 of 5')
    expect(stepLabel('location')).toBe('Step 5 of 5')
    expect(stepLabel('ready')).toBeNull()
  })

  it('fill the bar a fifth per question, and full from the last question on', () => {
    expect(progress('basics')).toBeCloseTo(0.2)
    expect(progress('location')).toBe(1)
    expect(progress('ready')).toBe(1)
  })
})

describe('a stored step from the eight-step flow', () => {
  it('resumes on the notifications step at preferences, the step that followed it', () => {
    expect(parseStoredOnboarding(stored('notifications', ['basics']))?.progress).toEqual({
      step: 'preferences',
      completed: ['basics'],
    })
  })

  it('resumes on the journey step at details', () => {
    expect(parseStoredOnboarding(stored('journey', ['basics', 'notifications', 'location', 'preferences']))?.progress).toEqual({
      step: 'details',
      completed: ['basics', 'location', 'preferences'],
    })
  })

  it('keeps the draft, so nothing typed is lost', () => {
    expect(parseStoredOnboarding(stored('journey', []))?.draft).toEqual({ name: 'Émilie Tremblay' })
  })

  it('still starts over on a name no build ever wrote (control)', () => {
    expect(parseStoredOnboarding(stored('somewhere', []))?.progress).toEqual({ step: 'basics', completed: [] })
  })
})

describe('push is asked later, in context', () => {
  it('a new account (deferred at the end of onboarding) is not prompted at start-up', async () => {
    await markPushDeferred('new')
    expect(await hasDeferredPush('new')).toBe(true)
    expect(await mayPromptAtStartUp('new')).toBe(false)
  })

  it('an account onboarded before this build still is, as today (control)', async () => {
    expect(await mayPromptAtStartUp('old')).toBe(true)
  })

  it('a declined account is not prompted, as today', async () => {
    await markPushDeclined('declined')
    expect(await mayPromptAtStartUp('declined')).toBe(false)
  })

  it('is per account', async () => {
    await markPushDeferred('a')
    expect(await hasDeferredPush('b')).toBe(false)
  })

  it('a yes (in-context sheet, crew ask, Settings) clears the deferral with the decline', async () => {
    await markPushDeferred('yes')
    await markPushDeclined('yes')
    await clearPushDeclined('yes')
    expect(await mayPromptAtStartUp('yes')).toBe(true)
  })
})

describe('wiring', () => {
  it('the tabs prompt only when start-up may', () => {
    expect(read('app/_layout.tsx')).toMatch(
      /mayPromptAtStartUp\(userId\)\s*\.then\(\(prompt\) => initializePushNotifications\(\{ prompt \}\)\)/
    )
  })

  it('finishing onboarding defers the ask, before the flow is left', () => {
    const hook = read('lib/useOnboarding.ts')
    const finish = hook.slice(hook.indexOf('const finish'))
    expect(finish.indexOf('await markPushDeferred(userId)')).toBeGreaterThan(-1)
    expect(finish.indexOf('await markPushDeferred(userId)')).toBeLessThan(finish.indexOf('return true'))
  })

  it('the first "I\'m going" still asks: the in-context ask reads the decline only', () => {
    const ask = read('lib/pushAsk.ts')
    expect(ask).toContain('hasDeclinedPush(user.id)')
    expect(ask).not.toContain('Deferred')
  })

  it('the removed screens are gone', () => {
    expect(() => read('app/onboarding/notifications.tsx')).toThrow()
    expect(() => read('app/onboarding/journey.tsx')).toThrow()
  })
})
