/*
 * The onboarding flow: what the steps are, where you are in them, and what
 * each one sends to the server.
 *
 * Pure. No AsyncStorage, no navigation, no `fetch` — those live in
 * `lib/onboardingStorage.ts` and in the screens, for the same reason
 * `lib/city.ts` and `lib/cityStorage.ts` are two files: AsyncStorage cannot be
 * imported under `testEnvironment: node`, and the logic worth testing is the
 * part that has no I/O in it.
 *
 * ## Why a step list and not eight screens that each know the next one
 *
 * Because resume-on-quit needs to answer "where was I?" from a stored value,
 * and skipping needs to answer "what comes after this?" without the skipped
 * screen being mounted. Both are one lookup against this array. Screens that
 * each hardcode their successor cannot answer either without every screen
 * knowing about every other one.
 */

/** One step, in order. The key is what gets stored, so it outlives a reorder. */
export const ONBOARDING_STEPS = [
  'basics',
  'notifications',
  'location',
  'preferences',
  'journey',
  'details',
  'media',
  'ready',
] as const

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

/**
 * The route each step lives at.
 *
 * Explicit rather than `/onboarding/${step}` so that renaming a file cannot
 * silently break resume — a missing key here is a type error.
 */
export const ONBOARDING_ROUTES: Record<OnboardingStep, string> = {
  basics: '/onboarding/basics',
  notifications: '/onboarding/notifications',
  location: '/onboarding/location',
  preferences: '/onboarding/preferences',
  journey: '/onboarding/journey',
  details: '/onboarding/details',
  media: '/onboarding/media',
  ready: '/onboarding/ready',
}

/**
 * Steps a person may pass without answering.
 *
 * The two permission screens, because the OS dialog is the real decision and
 * "not now" has to be a valid answer to it — and `media`, because a photo is
 * the highest-friction thing asked for and refusing to let anyone in without
 * one loses more people than the empty avatars cost.
 *
 * `basics` is not skippable: the age gate needs a birth date, and `ready` is
 * where `onboarded` is written, so skipping it would leave the account looking
 * unfinished forever.
 */
const SKIPPABLE: ReadonlySet<OnboardingStep> = new Set([
  'notifications',
  'location',
  'media',
  'preferences',
  'journey',
  'details',
])

export function isSkippable(step: OnboardingStep): boolean {
  return SKIPPABLE.has(step)
}

export function stepIndex(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step)
}

/** The step after this one, or `null` at the end. */
export function nextStep(step: OnboardingStep): OnboardingStep | null {
  return ONBOARDING_STEPS[stepIndex(step) + 1] ?? null
}

/** The step before this one, or `null` at the start. */
export function previousStep(step: OnboardingStep): OnboardingStep | null {
  const i = stepIndex(step)
  return i > 0 ? ONBOARDING_STEPS[i - 1] : null
}

/**
 * How far along, 0–1, for the bar in the header.
 *
 * Steps behind you over steps total — so the first screen shows a sliver
 * rather than zero, and `ready` shows full.
 *
 * The Figma frames disagree with each other about this and cannot all be
 * right: one header reads "STEP 02/05", another "Step 2 of 4", another
 * "Step 4 of 5", and the percentages run 30 / 70 / 80 / 100 across four
 * screens of eight. Those are mock values from separate design passes. One
 * honest computation is better than reproducing four contradictory ones, and
 * it stays right when a step is added.
 */
export function progress(step: OnboardingStep): number {
  return (stepIndex(step) + 1) / ONBOARDING_STEPS.length
}

export function progressPercent(step: OnboardingStep): number {
  return Math.round(progress(step) * 100)
}

export function isOnboardingStep(value: unknown): value is OnboardingStep {
  return typeof value === 'string' && (ONBOARDING_STEPS as readonly string[]).includes(value)
}

/* -------------------------------------------------------------------------- */
/* Resuming                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * What we remember between launches.
 *
 * `step` is where to return to, `completed` is which steps have been answered.
 * Both, because they are different questions: someone who skipped ahead and
 * came back has a `step` behind their furthest `completed`.
 */
export interface OnboardingProgress {
  step: OnboardingStep
  completed: OnboardingStep[]
}

export const EMPTY_PROGRESS: OnboardingProgress = { step: 'basics', completed: [] }

/**
 * Where to send someone who is opening the app mid-flow.
 *
 * `null` means "not in onboarding, go where you normally would". The two
 * conditions are deliberately different signals:
 *
 *  - `finishedOnServer` is `profiles.onboarded`, which is the truth and the
 *    thing the dashboard funnel counts. It wins over anything stored locally,
 *    so finishing on one device does not re-run onboarding on another.
 *  - `stored` is this device's progress, and it is what makes quitting on step
 *    five and coming back land on step five instead of step one.
 *
 * A brand-new account with neither starts at the beginning.
 */
export function resumeStep(args: {
  finishedOnServer: boolean
  stored: OnboardingProgress | null
  isNewAccount: boolean
}): OnboardingStep | null {
  if (args.finishedOnServer) return null
  if (args.stored) return args.stored.step
  return args.isNewAccount ? 'basics' : null
}

/**
 * Record a step as answered and move on.
 *
 * Returns the whole next progress rather than mutating, so the caller can hand
 * one object to storage and to state. `completed` is a set in spirit — a step
 * answered twice appears once, because someone going back to change their name
 * has not completed it a second time.
 */
export function advance(
  current: OnboardingProgress,
  step: OnboardingStep
): OnboardingProgress {
  const completed = current.completed.includes(step)
    ? current.completed
    : [...current.completed, step]
  return { step: nextStep(step) ?? step, completed }
}

/* -------------------------------------------------------------------------- */
/* What each step sends                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Everything onboarding can collect, all optional.
 *
 * One draft rather than a shape per step, because it is saved as one object and
 * because two steps write to the same profile: `journey` sets `location` and
 * `basics` sets `name`, and both end up in the same `PUT /profiles/:userId`.
 */
export type OnboardingGender = 'woman' | 'man' | 'non_binary' | 'prefer_not_to_say'

export interface OnboardingDraft {
  name?: string
  /*
   * The enum the API validates, not a loose string.
   *
   * `apiClient.updateProfile` types this field for a reason its own comment
   * spells out: the four preference booleans were once sent in twelve
   * camelCase spellings and matched none of them, because nothing was checking.
   * A draft typed `string` would have to be cast on the way out, which throws
   * that check away at exactly the point it is doing its job.
   */
  gender?: OnboardingGender
  dateOfBirth?: string
  /*
   * Plural, capped at three, "prefer not to say" exclusive — the rules live in
   * `lib/dating.ts` because the Settings editor writes this field too.
   */
  orientations?: string[]
  /*
   * Show `orientations` to people who can already see who you are.
   *
   * Not "make it public" — the server gates it a second time on
   * `maySeeIdentity`, so it reaches matches, open conversations, and rooms you
   * revealed yourself in, and nobody else. Sending `true` is consent to show
   * it, not a decision about who to.
   */
  show_orientation?: boolean
  /*
   * How you would like to enter rooms: named, or as a pseudonym.
   *
   * A *suggestion*, not a setting that acts at a distance — the server creates
   * every check-in row `revealed: false` whatever this says, so being named is
   * a tap in the room. What this changes is whether that tap is offered.
   */
  reveal_by_default?: boolean
  looking_for?: string[]
  location?: string
  occupation?: string
  education?: string
  work_field?: string
  interests?: string[]
  bio?: string
  photos?: string[]
  push_enabled?: boolean
  share_location?: boolean
}

/**
 * The fields each step owns.
 *
 * Used to build a partial `PUT` body: a step sends only what it collected, so
 * saving step one cannot blank a field step five had already filled in — which
 * is exactly what sending the whole draft every time would do the moment
 * someone goes back and edits.
 */
const STEP_FIELDS: Record<OnboardingStep, readonly (keyof OnboardingDraft)[]> = {
  basics: ['name', 'gender', 'dateOfBirth'],
  notifications: ['push_enabled'],
  location: ['share_location'],
  preferences: ['orientations', 'show_orientation', 'looking_for', 'reveal_by_default'],
  journey: ['location', 'occupation', 'education', 'work_field'],
  details: ['interests', 'bio'],
  media: ['photos'],
  ready: [],
}

/**
 * The body to `PUT` for one step: its own fields, and only the ones answered.
 *
 * `undefined` is dropped rather than sent, because the API treats an absent key
 * as "unchanged" and an explicit `null` as "clear this" — sending `undefined`
 * for a field the user left alone would serialise to nothing anyway on one
 * client and to `null` on another, and the difference is a wiped profile.
 */
export function stepPayload(
  step: OnboardingStep,
  draft: OnboardingDraft
): Partial<OnboardingDraft> {
  const body: Partial<OnboardingDraft> = {}
  for (const field of STEP_FIELDS[step]) {
    const value = draft[field]
    if (value !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(body as any)[field] = value
    }
  }
  return body
}

/**
 * Is this person anonymous in rooms?
 *
 * **The answer is yes unless they have explicitly said otherwise.** Anonymity
 * is the product, not a setting on it: the pseudonymous room is the reason
 * `maySeeIdentity` exists, the reason the roster returns "Attendee", and the
 * reason a check-in row is created `revealed: false` no matter what the profile
 * says. A default that leaned the other way would quietly undo all three.
 *
 * This is a function rather than a `useState(true)` in the screen for one
 * reason: a literal in a component is a thing any future edit can flip, and
 * nothing would fail. Here it is one line with a test on it, so flipping it
 * breaks the build instead of breaking somebody's anonymity.
 *
 * The stored column is `reveal_by_default`, so the two are inverses. Absent
 * means anonymous — `undefined` is a person who has not answered, and the
 * safe reading of silence is the private one.
 */
export function anonymousByDefault(draft: Pick<OnboardingDraft, 'reveal_by_default'>): boolean {
  return !(draft.reveal_by_default ?? false)
}

/**
 * Whether to record consent to show an orientation.
 *
 * `false` whenever there are no orientations, regardless of what the switch
 * says.
 *
 * The case this exists for: someone picks an orientation, turns the switch on,
 * then goes back and clears it. Leaving the stored `true` behind means the
 * consent outlives the thing it was consent *for* — so picking an orientation
 * again months later would silently republish it to everyone who had matched in
 * the meantime, with no second decision from the person.
 *
 * Clearing the *last* label is what drops the consent, not clearing any of
 * them. Going from three labels to two is an edit to something already
 * published, and re-asking there would make the switch feel like it resets
 * itself at random.
 *
 * A function rather than a ternary in the screen because it is a privacy
 * invariant and not a rendering detail: any future screen that writes these two
 * fields has to obey it, and one that inlines the rule is one that can forget.
 */
export function orientationConsent(
  orientations: readonly string[] | undefined,
  requested: boolean
): boolean {
  return orientations?.length ? requested : false
}

/**
 * Is this step answered well enough to continue?
 *
 * Only `basics` has a real requirement, and it is the one the server also
 * enforces: a name, and a birth date that parses. Everything else is optional
 * by design, so returning true for them is the rule and not an oversight.
 */
export function canContinue(step: OnboardingStep, draft: OnboardingDraft): boolean {
  if (step !== 'basics') return true
  return !!draft.name?.trim() && isCompleteDateOfBirth(draft.dateOfBirth)
}

/**
 * `YYYY-MM-DD`, a real calendar date, in the past, and at least 13 years ago.
 *
 * The same rule the server applies in `parseDateOfBirth`, checked here so the
 * Continue button can be disabled rather than the person tapping it and being
 * told no. Duplicated deliberately: the server is the authority and this is the
 * courtesy, and a courtesy that is wrong in the *permissive* direction just
 * shows the server's error, which is the safe way round.
 */
export function isCompleteDateOfBirth(value: string | undefined): boolean {
  if (!value) return false
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  // Catches 31 February: the constructor rolls it forward to 3 March, so a
  // round trip that changes the day means it was never a real date.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return false
  }

  const now = new Date()
  let age = now.getUTCFullYear() - year
  const monthDiff = now.getUTCMonth() - (month - 1)
  const dayDiff = now.getUTCDate() - day
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1
  return age >= 13 && age <= 120
}

/**
 * Assemble `DD`, `MM`, `YYYY` into what the API wants, or `undefined`.
 *
 * The design asks for three separate boxes, and the API takes one string. This
 * is where they meet, and it pads — someone typing `7` in the day box means the
 * 7th, and `2026-9-7` is not a date the server accepts.
 */
export function joinDateOfBirth(day: string, month: string, year: string): string | undefined {
  if (!day || !month || year.length !== 4) return undefined
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

/**
 * What lives on disk between launches: where they were, and what they had typed.
 */
export interface StoredOnboarding {
  progress: OnboardingProgress
  draft: OnboardingDraft
}

const EMPTY_STORED: StoredOnboarding = { progress: EMPTY_PROGRESS, draft: {} }

/** The inverse, for prefilling the three boxes when resuming. */
export function splitDateOfBirth(value: string | undefined): {
  day: string
  month: string
  year: string
} {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null
  if (!match) return { day: '', month: '', year: '' }
  return { day: match[3], month: match[2], year: match[1] }
}

/**
 * Parse whatever is on disk, defensively.
 *
 * Here rather than in `onboardingStorage.ts` for the reason that file's own
 * header gives: importing AsyncStorage into a module makes it unloadable under
 * `testEnvironment: node`, and this parser is the part worth testing. Anything
 * unrecognised
 * becomes the empty state rather than throwing: this runs on the launch path,
 * and a record written by an older build with a step that no longer exists must
 * not be able to crash the app or navigate to a route that is gone.
 */
export function parseStoredOnboarding(raw: string | null): StoredOnboarding | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null

    const record = parsed as Record<string, unknown>
    const progress = record.progress as Record<string, unknown> | undefined
    const step = progress?.step

    // A step this build does not know about means the flow was reordered or
    // renamed under a stored record. Starting over beats navigating to a route
    // that no longer exists.
    if (!isOnboardingStep(step)) return EMPTY_STORED

    const completed = Array.isArray(progress?.completed)
      ? progress.completed.filter(isOnboardingStep)
      : []

    return {
      progress: { step, completed },
      draft:
        record.draft && typeof record.draft === 'object'
          ? (record.draft as OnboardingDraft)
          : {},
    }
  } catch {
    return null
  }
}
