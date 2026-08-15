/*
 * The presence policy, and mostly the cases where it must do nothing.
 *
 * A stale check-in is mildly wrong. A false check-out removes someone standing
 * in the venue from the room and the chat, because their phone lost GPS in a
 * basement. Those are not close, so most of these tests assert `'none'` — the
 * dangerous direction is acting, not waiting.
 */

import {
  MIN_OUTSIDE_MS,
  MIN_OUTSIDE_SAMPLES,
  REPRIEVE_MS,
  SAMPLE_INTERVAL_MS,
  SAMPLE_WINDOW_MS,
  STALE_FIX_MS,
  outsideThresholdM,
  presenceAction,
  trimSamples,
  type PresenceSample,
} from '../lib/presence'

const NOW = 1_800_000_000_000
const RADIUS = 200
// 200 + max(150, 100) = 350
const FAR = outsideThresholdM(RADIUS) + 100
const NEAR = 50

/** `count` outside readings, the oldest `spanMs` ago, ending now. */
const outsideRun = (count: number, spanMs: number): PresenceSample[] =>
  Array.from({ length: count }, (_, i) => ({
    at: NOW - spanMs + (spanMs / Math.max(count - 1, 1)) * i,
    distanceM: FAR,
  }))

const call = (samples: PresenceSample[], saidStillHereAt: number | null = null) =>
  presenceAction({ samples, now: NOW, fenceRadiusM: RADIUS, saidStillHereAt })

describe('outsideThresholdM', () => {
  it('gives a small venue a floor that covers ordinary GPS noise', () => {
    // A 100m fence with no margin evicts people standing at the bar.
    expect(outsideThresholdM(100)).toBe(250)
  })

  it('scales with a large venue rather than staying flat', () => {
    expect(outsideThresholdM(1000)).toBe(1500)
  })
})

describe('presenceAction — when it must do nothing', () => {
  it('does nothing with no readings at all', () => {
    expect(call([])).toBe('none')
  })

  it('does nothing when the newest fix is stale', () => {
    // We do not know where they are, and "we do not know" must never become
    // "check them out".
    const old = [{ at: NOW - STALE_FIX_MS - 1000, distanceM: FAR }]
    expect(call(old)).toBe('none')
  })

  it('does nothing on a single outside reading', () => {
    expect(call([{ at: NOW, distanceM: FAR }])).toBe('none')
  })

  it('does nothing when three readings arrive too fast to mean anything', () => {
    // Three in twenty seconds is one bad GPS moment, not a person leaving.
    expect(call(outsideRun(3, 20_000))).toBe('none')
  })

  it('does nothing when the latest reading is back inside', () => {
    // Walking back in is the strongest evidence available and should win
    // immediately, not after another ten minutes.
    const samples = [...outsideRun(4, MIN_OUTSIDE_MS * 2), { at: NOW, distanceM: NEAR }]
    expect(call(samples)).toBe('none')
  })

  it('does nothing when the signal was lost rather than the person', () => {
    /*
     * The basement case, and the whole reason `distanceM` is nullable. A phone
     * that cannot see satellites is a phone inside a building, which is where
     * the event is. A null must break the run, never extend it.
     */
    const samples = [...outsideRun(4, MIN_OUTSIDE_MS * 2), { at: NOW, distanceM: null }]
    expect(call(samples)).toBe('none')
  })

  it('does not count readings from before a gap in coverage', () => {
    // Outside, lost signal, outside once. That is one outside reading with a
    // hole in front of it, not a sustained absence.
    const samples: PresenceSample[] = [
      { at: NOW - MIN_OUTSIDE_MS * 2, distanceM: FAR },
      { at: NOW - MIN_OUTSIDE_MS, distanceM: null },
      { at: NOW, distanceM: FAR },
    ]
    expect(call(samples)).toBe('none')
  })

  it('treats a reading exactly on the threshold as inside', () => {
    // Boundaries belong to the safe side.
    const edge = [{ at: NOW, distanceM: outsideThresholdM(RADIUS) }]
    expect(call(edge)).toBe('none')
  })
})

describe('presenceAction — asking', () => {
  it('asks after a sustained absence', () => {
    expect(call(outsideRun(3, MIN_OUTSIDE_MS + 1000))).toBe('ask')
  })

  it('asks once, then waits rather than nagging', () => {
    // They answered. Asking again five minutes later is how a safety prompt
    // becomes something people dismiss without reading.
    expect(call(outsideRun(3, MIN_OUTSIDE_MS + 1000), NOW - 5 * 60 * 1000)).toBe('none')
  })
})

describe('presenceAction — checking out', () => {
  it('checks out only after the reprieve has run out', () => {
    /*
     * This overrides a human answer with a sensor reading, so it is slow and
     * reluctant on purpose. Half an hour of continued absence after saying "I'm
     * still here" is someone who left right after answering.
     */
    const samples = outsideRun(4, REPRIEVE_MS + MIN_OUTSIDE_MS)
    expect(call(samples, NOW - REPRIEVE_MS - 1000)).toBe('checkOut')
  })

  it('does not check out if they came back during the reprieve', () => {
    const samples = [...outsideRun(4, REPRIEVE_MS), { at: NOW, distanceM: NEAR }]
    expect(call(samples, NOW - REPRIEVE_MS - 1000)).toBe('none')
  })

  it('does not check out on a lost fix during the reprieve', () => {
    // The most dangerous moment for the basement case: the reprieve has
    // expired and the phone has no signal. Still not evidence of leaving.
    const samples = [...outsideRun(4, REPRIEVE_MS), { at: NOW, distanceM: null }]
    expect(call(samples, NOW - REPRIEVE_MS - 1000)).toBe('none')
  })
})

/*
 * The sampling policy, which is separate from the decision on purpose.
 *
 * `presenceAction` is a pure decision over whatever it is handed. These control
 * what it gets handed, and they are the half that has to survive an app being
 * backgrounded for an hour in the middle of an evening.
 */
describe('trimSamples', () => {
  const now = 10_000_000

  it('keeps everything inside the window', () => {
    const samples = [
      { at: now - SAMPLE_WINDOW_MS, distanceM: 10 },
      { at: now - 60_000, distanceM: 20 },
      { at: now, distanceM: 30 },
    ]
    expect(trimSamples(samples, now)).toHaveLength(3)
  })

  it('drops readings older than the window', () => {
    const samples = [
      { at: now - SAMPLE_WINDOW_MS - 1, distanceM: 10 },
      { at: now, distanceM: 30 },
    ]
    expect(trimSamples(samples, now)).toEqual([{ at: now, distanceM: 30 }])
  })

  it('bounds an evening', () => {
    /*
     * A five-hour event on an open phone is 150 readings at this interval, and
     * nothing will ever look at the first 140. The window is what stops the
     * buffer growing for the length of a night out.
     */
    const evening = Array.from({ length: 150 }, (_, i) => ({
      at: now - i * SAMPLE_INTERVAL_MS,
      distanceM: 40,
    }))
    const kept = trimSamples(evening, now)
    expect(kept.length).toBeLessThanOrEqual(Math.ceil(SAMPLE_WINDOW_MS / SAMPLE_INTERVAL_MS) + 1)
  })

  it('leaves more history than the decision needs', () => {
    // The slack is for missed ticks: a backgrounded app takes no readings, and
    // coming back to a buffer with a hole in it must still have enough recent
    // history to be worth anything.
    expect(SAMPLE_WINDOW_MS).toBeGreaterThan(MIN_OUTSIDE_MS)
  })

  it('samples often enough for the window to fill', () => {
    // Six readings are needed to span the ten minutes the decision requires.
    // If the interval ever grew past that, no eviction could ever fire.
    expect(SAMPLE_INTERVAL_MS * MIN_OUTSIDE_SAMPLES).toBeLessThanOrEqual(MIN_OUTSIDE_MS)
  })
})
