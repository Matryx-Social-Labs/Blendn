/*
 * Are they still at the event, and what should we do about it?
 *
 * ## The asymmetry that decides every parameter below
 *
 * A stale check-in is mildly wrong: an attendance count is a few too high, and
 * someone appears `insideNow` in the match pool who has gone home. Annoying.
 *
 * A false check-out is actively harmful: it removes someone who is *standing in
 * the venue* from the room and the chat, mid-conversation, because their phone
 * lost GPS in a basement. They did nothing and the app evicted them.
 *
 * These are not close. So every threshold here is biased hard toward doing
 * nothing, and the one rule that matters most is: **no fix is not the same as
 * outside.** A phone that cannot see satellites is a phone in a building, which
 * is where the event is.
 *
 * ## What is deliberately not built
 *
 * **Background location.** Catching someone who left with the app closed needs
 * the *always* permission — gated hard by iOS, questioned in App Review, and a
 * battery cost users notice. It also buys the least: the app-closed case is
 * exactly where a false eviction is least recoverable, because nobody is
 * looking at the phone to say "no, I'm still here".
 *
 * The app-closed case is already handled by something simpler: the event ends,
 * and the chat lifecycle sweeper closes the room. Someone who leaves and never
 * reopens the app is checked out when the event is over, which is correct and
 * costs nothing.
 *
 * So this runs in the foreground only, while the app is open and they are
 * checked in.
 */

/** One location reading. `distanceM` is null when there was no usable fix. */
export interface PresenceSample {
  at: number
  distanceM: number | null
}

export type PresenceAction = 'none' | 'ask' | 'checkOut'

/**
 * How far outside the fence counts as outside.
 *
 * Not zero, and not a fixed number. Consumer GPS is ±5–20m in the open and far
 * worse indoors, which is where events are — a phone against a concrete wall
 * routinely reports a position a street away. A 100m fence with no margin would
 * evict people standing at the bar.
 *
 * The larger of 150m and half the radius: small venues get a floor that covers
 * ordinary GPS noise, large ones scale with their own size.
 */
export function outsideThresholdM(fenceRadiusM: number): number {
  return fenceRadiusM + Math.max(150, fenceRadiusM * 0.5)
}

/** A reading older than this tells us nothing about now. */
export const STALE_FIX_MS = 5 * 60 * 1000

/** Consecutive outside readings before we will even ask. */
export const MIN_OUTSIDE_SAMPLES = 3

/**
 * ...and they have to span this long.
 *
 * Three readings in twenty seconds is one bad GPS moment. Three across ten
 * minutes is someone who left. The duration is doing the real work; the count
 * only stops a single outlier from starting the clock.
 */
export const MIN_OUTSIDE_MS = 10 * 60 * 1000

/**
 * After they say "I'm still here", how long before we act on our own.
 *
 * Long, on purpose. They have told us they are present and we are overriding a
 * human answer with a sensor reading, which we should be slow and reluctant
 * about. Half an hour of *continued* absence after saying otherwise is a person
 * who left right after answering, not a person we misread.
 */
export const REPRIEVE_MS = 30 * 60 * 1000

/**
 * How often to take a reading, while the app is open and they are checked in.
 *
 * Two minutes, which is slower than it could be and deliberately so. The
 * decision below needs **six** of these to span the ten minutes it requires, so
 * the interval is not what makes an eviction fast — nothing here is fast. What
 * it controls is battery, and a GPS fix every two minutes for the length of one
 * evening is a cost nobody notices.
 *
 * Faster sampling would only make a *false* eviction arrive sooner, which is the
 * one outcome every threshold in this file is written to avoid.
 */
export const SAMPLE_INTERVAL_MS = 2 * 60 * 1000

/**
 * How much history to keep.
 *
 * Thirty minutes, against a ten-minute decision window. The extra is slack for
 * missed ticks — a backgrounded app takes no readings, and coming back to a
 * buffer with a hole in it should still leave enough recent history to be
 * useful.
 *
 * Bounded at all because an evening is long: unbounded, a five-hour event on an
 * open phone accumulates 150 readings that nothing will ever read.
 */
export const SAMPLE_WINDOW_MS = 30 * 60 * 1000

/**
 * Drop readings too old to matter, newest last.
 *
 * Kept separate from `presenceAction` because that function must stay a pure
 * decision over whatever it is handed — a caller passing full history should get
 * the same answer as one passing a trimmed buffer, and folding the trim inside
 * would hide a second policy inside the first.
 */
export function trimSamples(
  samples: readonly PresenceSample[],
  now: number
): PresenceSample[] {
  return samples.filter((s) => now - s.at <= SAMPLE_WINDOW_MS)
}

/**
 * What to do right now.
 *
 * `samples` newest last. `saidStillHereAt` is when they last answered the
 * prompt with "stay", or null if they never have.
 */
export function presenceAction(input: {
  samples: readonly PresenceSample[]
  now: number
  fenceRadiusM: number
  saidStillHereAt: number | null
}): PresenceAction {
  const { samples, now, fenceRadiusM, saidStillHereAt } = input
  const threshold = outsideThresholdM(fenceRadiusM)

  const latest = samples[samples.length - 1]

  // No readings, or nothing recent. We do not know where they are, and "we do
  // not know" must never become "check them out".
  if (!latest || now - latest.at > STALE_FIX_MS) return 'none'

  // Any reading inside clears everything, including a reprieve in progress.
  // Walking back in is the strongest possible evidence and it should win
  // immediately rather than after another ten minutes.
  if (latest.distanceM !== null && latest.distanceM <= threshold) return 'none'

  // Count backwards through consecutive outside readings. A `null` distance
  // breaks the run rather than extending it — losing signal is not evidence of
  // leaving, and treating it as such is precisely the basement failure.
  let run = 0
  let runStartedAt = latest.at
  for (let i = samples.length - 1; i >= 0; i -= 1) {
    const s = samples[i]
    if (s.distanceM === null || s.distanceM <= threshold) break
    run += 1
    runStartedAt = s.at
  }

  const sustained = run >= MIN_OUTSIDE_SAMPLES && now - runStartedAt >= MIN_OUTSIDE_MS
  if (!sustained) return 'none'

  if (saidStillHereAt === null) return 'ask'
  return now - saidStillHereAt >= REPRIEVE_MS ? 'checkOut' : 'none'
}

/**
 * The prompt, and the automatic check-out that may follow it.
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
    body: "It looks like you've moved away. If you've left, we'll check you out so the room stays accurate.",
    stay: "I'm still here",
    leave: 'Check me out',
  },
  autoCheckedOut: {
    title: 'Checked out',
    body: "You've been away from the venue for a while, so we checked you out. You can check back in any time you're there.",
  },
} as const
