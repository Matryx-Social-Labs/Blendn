/*
 * The onboarding step model.
 *
 * Two things here are worth testing and the rest is a list. The first is
 * **resume**: nine screens is long enough that quitting partway through is
 * normal, and the rule for where someone lands on relaunch has three inputs
 * that can each be wrong independently. The second is **partial saves**: each
 * step sends only its own fields, and getting that wrong does not fail loudly —
 * it silently blanks an answer given three screens ago.
 */

import {
  ONBOARDING_ROUTES,
  ONBOARDING_STEPS,
  advance,
  anonymousByDefault,
  canContinue,
  isCompleteDateOfBirth,
  isSkippable,
  joinDateOfBirth,
  nextStep,
  orientationConsent,
  parseStoredOnboarding,
  previousStep,
  progressPercent,
  resumeStep,
  splitDateOfBirth,
  stepPayload,
  type OnboardingDraft,
  type OnboardingProgress,
} from '../lib/onboarding'

// A birth date that is exactly `years` old today, whatever today is. One day
// back puts the birthday just behind us, which avoids both the leap-day roll
// and the boundary itself.
const dobForAge = (years: number) => {
  const n = new Date()
  const d = new Date(Date.UTC(n.getUTCFullYear() - years, n.getUTCMonth(), n.getUTCDate() - 1))
  return d.toISOString().slice(0, 10)
}

describe('the step list', () => {
  it('has a route for every step', () => {
    // A missing route is a dead end mid-flow, and `resumeStep` can name any of
    // them. The type already enforces this; the test catches a route string
    // that was typed wrong rather than left out.
    for (const step of ONBOARDING_STEPS) {
      expect(ONBOARDING_ROUTES[step]).toBe(`/onboarding/${step}`)
    }
  })

  it('walks forwards and backwards, and stops at both ends', () => {
    expect(nextStep('basics')).toBe('notifications')
    expect(nextStep('ready')).toBeNull()
    expect(previousStep('notifications')).toBe('basics')
    expect(previousStep('basics')).toBeNull()
  })

  it('will not let anyone skip the two steps that have to happen', () => {
    // `basics` carries the birth date the age gate needs; `ready` is where
    // `onboarded` is written, so skipping it leaves the account looking
    // unfinished forever and the dashboard funnel counting it as a drop-off.
    expect(isSkippable('basics')).toBe(false)
    expect(isSkippable('ready')).toBe(false)
    expect(isSkippable('notifications')).toBe(true)
    expect(isSkippable('media')).toBe(true)
  })

  it('reports progress that starts above zero and ends at a hundred', () => {
    // A bar showing 0% on a screen you are looking at reads as broken.
    expect(progressPercent('basics')).toBeGreaterThan(0)
    expect(progressPercent('ready')).toBe(100)
  })
})

describe('resuming', () => {
  const stored = (step: OnboardingProgress['step']): OnboardingProgress => ({
    step,
    completed: [],
  })

  it('sends a brand-new account to the first step', () => {
    expect(resumeStep({ finishedOnServer: false, stored: null, isNewAccount: true })).toBe('basics')
  })

  it('sends an existing account nowhere', () => {
    // `null` means "go where you normally would". Someone who signed up before
    // this flow existed must not be dropped into it on a routine launch.
    expect(resumeStep({ finishedOnServer: false, stored: null, isNewAccount: false })).toBeNull()
  })

  it('returns to the step someone quit on', () => {
    // The whole point. `isNewAccount` is false on relaunch — it is a
    // session-scoped fact about *this* sign-in — so without the stored record
    // this case is indistinguishable from an ordinary launch and the person
    // lands on the events tab with a half-filled profile.
    expect(
      resumeStep({ finishedOnServer: false, stored: stored('journey'), isNewAccount: false })
    ).toBe('journey')
  })

  it('lets the server override a stale local record', () => {
    /*
     * Finishing on a phone and then opening on a tablet: the tablet has no
     * stored progress, the phone has one that never got cleared. Whichever
     * device it is, `profiles.onboarded` is the truth and re-running a
     * completed flow is the worse failure — it asks for a birth date the
     * account already has.
     */
    expect(
      resumeStep({ finishedOnServer: true, stored: stored('media'), isNewAccount: false })
    ).toBeNull()
    expect(resumeStep({ finishedOnServer: true, stored: null, isNewAccount: true })).toBeNull()
  })
})

describe('advance', () => {
  it('records the step and moves to the next', () => {
    expect(advance({ step: 'basics', completed: [] }, 'basics')).toEqual({
      step: 'notifications',
      completed: ['basics'],
    })
  })

  it('does not record the same step twice', () => {
    // Going back to change your name has not completed `basics` a second time,
    // and a duplicate would make any count of completed steps wrong.
    const once = advance({ step: 'basics', completed: [] }, 'basics')
    const twice = advance({ ...once, step: 'basics' }, 'basics')
    expect(twice.completed).toEqual(['basics'])
  })

  it('stays put at the end rather than walking off it', () => {
    const done = advance({ step: 'ready', completed: [] }, 'ready')
    expect(done.step).toBe('ready')
  })
})

describe('stepPayload', () => {
  const full: OnboardingDraft = {
    name: 'Julian',
    gender: 'woman',
    dateOfBirth: '1998-04-17',
    bio: 'written on step six',
    photos: ['https://example.test/a.jpg'],
  }

  it('sends only the fields the step owns', () => {
    /*
     * The bug this prevents is silent and destructive. Sending the whole draft
     * on every step means going back to fix a typo in your name re-sends an
     * empty `bio`, and the API reads a present key as "set this" — so a
     * correction on step one wipes an answer from step six.
     */
    expect(stepPayload('basics', full)).toEqual({
      name: 'Julian',
      gender: 'woman',
      dateOfBirth: '1998-04-17',
    })
    expect(stepPayload('details', full)).toEqual({ bio: 'written on step six' })
  })

  it('omits fields nobody answered rather than sending undefined', () => {
    // An absent key means "unchanged" to the API. `undefined` serialises away
    // on one client and to `null` — which means *clear this* — on another.
    const body = stepPayload('basics', { name: 'Julian' })
    expect(body).toEqual({ name: 'Julian' })
    expect('gender' in body).toBe(false)
  })

  it('sends nothing for the review step', () => {
    // `ready` writes `onboarded`, which is not a draft field.
    expect(stepPayload('ready', full)).toEqual({})
  })
})

describe('the birth date', () => {
  it('accepts a real date for someone old enough', () => {
    expect(isCompleteDateOfBirth(dobForAge(25))).toBe(true)
  })

  it('rejects what the server would reject', () => {
    // Mirrors `parseDateOfBirth` on the API. Wrong in the permissive direction
    // only shows the server's error, which is the safe way round; wrong in the
    // strict direction refuses a date the server would have taken.
    expect(isCompleteDateOfBirth(undefined)).toBe(false)
    expect(isCompleteDateOfBirth('17/04/1998')).toBe(false)
    expect(isCompleteDateOfBirth('1998-02-30')).toBe(false) // rolls to 2 March
    expect(isCompleteDateOfBirth('3000-01-01')).toBe(false)
    expect(isCompleteDateOfBirth(dobForAge(9))).toBe(false)
  })

  it('pads a single-digit day and month', () => {
    // Three boxes on the screen, one string to the API. `2026-9-7` is not a
    // date it accepts, and typing `7` in a day box means the 7th.
    expect(joinDateOfBirth('7', '9', '1998')).toBe('1998-09-07')
    expect(joinDateOfBirth('17', '04', '1998')).toBe('1998-04-17')
  })

  it('refuses to assemble an incomplete date', () => {
    expect(joinDateOfBirth('7', '9', '99')).toBeUndefined()
    expect(joinDateOfBirth('', '9', '1998')).toBeUndefined()
  })

  it('splits back into three boxes for a resume', () => {
    expect(splitDateOfBirth('1998-04-17')).toEqual({ day: '17', month: '04', year: '1998' })
    expect(splitDateOfBirth(undefined)).toEqual({ day: '', month: '', year: '' })
  })
})

describe('canContinue', () => {
  it('holds the first step until there is a name and a usable birth date', () => {
    expect(canContinue('basics', {})).toBe(false)
    expect(canContinue('basics', { name: 'Julian' })).toBe(false)
    expect(canContinue('basics', { dateOfBirth: dobForAge(30) })).toBe(false)
    expect(canContinue('basics', { name: '   ', dateOfBirth: dobForAge(30) })).toBe(false)
    expect(canContinue('basics', { name: 'Julian', dateOfBirth: dobForAge(30) })).toBe(true)
  })

  it('lets every other step through', () => {
    // Optional by design, not by oversight: the rest of the profile is nice to
    // have and none of it gates anything.
    for (const step of ONBOARDING_STEPS.filter((s) => s !== 'basics')) {
      expect([step, canContinue(step, {})]).toEqual([step, true])
    }
  })
})

describe('parsing what is on disk', () => {
  it('reads back what was written', () => {
    const value = { progress: { step: 'journey', completed: ['basics'] }, draft: { name: 'A' } }
    expect(parseStoredOnboarding(JSON.stringify(value))).toEqual(value)
  })

  it('treats a step this build does not know as a fresh start', () => {
    /*
     * A record written by an older build naming a step that has since been
     * renamed. Navigating to a route that no longer exists lands on
     * expo-router's Unmatched Route with no way out — on the launch path, for
     * an account that cannot get past it by any other means.
     */
    const stale = JSON.stringify({ progress: { step: 'welcome', completed: [] }, draft: {} })
    expect(parseStoredOnboarding(stale)).toEqual({
      progress: { step: 'basics', completed: [] },
      draft: {},
    })
  })

  it('survives junk without throwing', () => {
    expect(parseStoredOnboarding(null)).toBeNull()
    expect(parseStoredOnboarding('')).toBeNull()
    expect(parseStoredOnboarding('{oh no')).toBeNull()
    expect(parseStoredOnboarding('"a string"')).toBeNull()
  })

  it('drops unknown steps out of the completed list', () => {
    const mixed = JSON.stringify({
      progress: { step: 'journey', completed: ['basics', 'welcome', 'notifications'] },
      draft: {},
    })
    expect(parseStoredOnboarding(mixed)?.progress.completed).toEqual(['basics', 'notifications'])
  })
})

describe('orientationConsent', () => {
  it('records consent when there is an orientation and the switch is on', () => {
    expect(orientationConsent('bisexual', true)).toBe(true)
  })

  it('records none when the switch is off', () => {
    expect(orientationConsent('bisexual', false)).toBe(false)
  })

  it('drops consent when the orientation is cleared', () => {
    /*
     * Pick an orientation, turn the switch on, then go back and clear the
     * orientation. A stored `true` would outlive the thing it was consent for —
     * so answering the question again months later would republish it to
     * everyone who had matched in the meantime, without a second decision from
     * the person.
     */
    expect(orientationConsent(undefined, true)).toBe(false)
    expect(orientationConsent('', true)).toBe(false)
  })
})

/*
 * Anonymity is the product, not a setting on it.
 *
 * The pseudonymous room is why `maySeeIdentity` exists, why the roster returns
 * "Attendee", and why a check-in row is created `revealed: false` whatever the
 * profile says. A default leaning the other way undoes all three at once, and
 * it would do it silently — nobody's screen breaks, people are just visible who
 * did not ask to be.
 *
 * These exist because the default used to live as `useState(true)` inside a
 * component, where any edit could flip it and nothing would fail.
 */
describe('anonymousByDefault', () => {
  it('is anonymous for a brand-new account', () => {
    expect(anonymousByDefault({})).toBe(true)
  })

  it('is anonymous when the field is explicitly absent', () => {
    // `undefined` is somebody who has not answered, and the safe reading of
    // silence is the private one.
    expect(anonymousByDefault({ reveal_by_default: undefined })).toBe(true)
  })

  it('is anonymous when the stored answer is not to reveal', () => {
    expect(anonymousByDefault({ reveal_by_default: false })).toBe(true)
  })

  it('is the only case that is not anonymous: an explicit yes', () => {
    expect(anonymousByDefault({ reveal_by_default: true })).toBe(false)
  })

  it('round-trips against what the screen writes back', () => {
    // The screen stores `reveal_by_default: !anonymous`. If these two ever
    // disagree, a person who chose one thing is saved as the other.
    for (const anonymous of [true, false]) {
      expect(anonymousByDefault({ reveal_by_default: !anonymous })).toBe(anonymous)
    }
  })
})
