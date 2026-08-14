import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'

import { apiClient } from './apiClient'
import { Logger } from './logger'
import {
  EMPTY_PROGRESS,
  ONBOARDING_ROUTES,
  advance,
  nextStep,
  stepPayload,
  type OnboardingDraft,
  type OnboardingProgress,
  type OnboardingStep,
} from './onboarding'
import { clearOnboarding, readOnboarding, writeOnboarding } from './onboardingStorage'
import { useAuth } from './useAuth'

/**
 * The draft, and moving through the flow.
 *
 * One hook rather than a context provider, because expo-router gives each step
 * its own route and therefore its own mount — there is no common React parent
 * to hold state in that survives navigation. Storage is the shared parent
 * instead, which is what makes resume work at all: the same mechanism that
 * carries an answer from step three to step seven carries it across a quit.
 *
 * ## The save rule
 *
 * Two writes per step, and they are different in kind:
 *
 *  - **Local, always.** The whole draft, so nothing typed is lost, including
 *    the answers on a step that was never submitted.
 *  - **Server, only this step's fields.** `stepPayload` narrows it. Sending the
 *    whole draft each time would mean going back to fix a typo in your name
 *    re-sends an empty `bio`, and the API reads a present key as "set this" —
 *    so a correction on step one silently wipes an answer from step six.
 *
 * A failed server save does **not** block the person. The local draft is
 * intact, `onboarded` is not written until the last step, and every field is
 * re-sent on that final save — so the recovery is automatic and the alternative
 * is trapping someone on a screen because their train went into a tunnel.
 */
export function useOnboarding(step: OnboardingStep) {
  const { user } = useAuth()
  const userId = user?.id

  const [draft, setDraft] = useState<OnboardingDraft>({})
  const [progress, setProgress] = useState<OnboardingProgress>(EMPTY_PROGRESS)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  // Rehydrate on mount. Every step does this rather than only the first,
  // because every step can be the one someone resumes onto.
  useEffect(() => {
    let cancelled = false
    if (!userId) return
    readOnboarding(userId).then((stored) => {
      if (cancelled) return
      if (stored) {
        setDraft(stored.draft)
        setProgress(stored.progress)
      }
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  /**
   * Merge a change into the draft and persist it.
   *
   * Persisting on every keystroke is deliberate. The alternative — saving on
   * navigate — loses everything typed on the screen someone was looking at when
   * they force-quit, which is precisely the screen they will be annoyed to
   * retype. AsyncStorage writes are cheap and off the render path.
   */
  const update = useCallback(
    (patch: Partial<OnboardingDraft>) => {
      setDraft((current) => {
        const merged = { ...current, ...patch }
        if (userId) void writeOnboarding(userId, { progress, draft: merged })
        return merged
      })
    },
    [userId, progress]
  )

  const goTo = useCallback((target: OnboardingStep) => {
    router.replace(ONBOARDING_ROUTES[target] as never)
  }, [])

  /**
   * Save this step and move on.
   *
   * `patch` is the screen's current field values, applied before saving so a
   * caller does not have to `update()` and then `commit()` and hope the state
   * has settled — React batches, and reading `draft` immediately after setting
   * it is the classic way to save the previous value.
   */
  const commit = useCallback(
    async (patch: Partial<OnboardingDraft> = {}) => {
      if (!userId) return
      const merged = { ...draft, ...patch }
      const nextProgress = advance(progress, step)

      setSaving(true)
      setDraft(merged)
      setProgress(nextProgress)
      await writeOnboarding(userId, { progress: nextProgress, draft: merged })

      /*
       * Everything from here is best-effort, and the `try` is load-bearing.
       *
       * The rule this file states is "a failed server save does not block
       * anyone" — and the first version only honoured it for a *returned*
       * error. `apiClient.updateProfile` throws on a non-2xx, so a rejected
       * field or a dropped connection skipped `setSaving(false)` and skipped
       * the navigation, leaving the Continue button spinning with no way past
       * it. A validation error the person cannot see or fix became a wall.
       *
       * Catching is the whole fix. The draft is already in storage two lines
       * above, and the last step re-sends every field, so the recovery is
       * automatic and the cost of failing here is that the dashboard sees the
       * profile a few minutes late.
       */
      try {
        const body = stepPayload(step, merged)
        if (Object.keys(body).length > 0) {
          const result = await apiClient.updateProfile(userId, body)
          if (!result.success) {
            Logger.warn('auth', 'Onboarding step did not save to the server', {
              step,
              error: result.error,
            })
          }
        }
      } catch (error) {
        Logger.warn('auth', 'Onboarding step threw while saving', { step, error })
      } finally {
        // In `finally` rather than after the call: a throw here used to leave
        // this stuck true, which is what made the button spin forever.
        setSaving(false)
      }

      // Outside the try, deliberately. Moving on is not conditional on the
      // network — that is the entire point of saving the draft first.
      const after = nextStep(step)
      if (after) goTo(after)
    },
    [draft, goTo, progress, step, userId]
  )

  /**
   * Pass without answering.
   *
   * Records the step as seen so the progress bar does not walk backwards, and
   * sends nothing — a skipped question has no answer, and writing a default
   * would be putting words in someone's mouth.
   */
  const skip = useCallback(async () => {
    if (!userId) return
    const nextProgress = advance(progress, step)
    setProgress(nextProgress)
    // `writeOnboarding` swallows its own errors, so this cannot throw — but the
    // navigation stays after it for the same reason as in `commit`: skipping
    // must never depend on anything that can fail.
    await writeOnboarding(userId, { progress: nextProgress, draft })
    const after = nextStep(step)
    if (after) goTo(after)
  }, [draft, goTo, progress, step, userId])

  /**
   * The last step: write `onboarded` and leave.
   *
   * Everything is re-sent here, not just `onboarded`, because this is the
   * backstop for every per-step save that failed on a bad connection. It is
   * also the **only** writer of `onboarded` in the whole app — the column has
   * existed since the first schema and the dashboard funnel has always counted
   * it, and nothing had ever set it.
   *
   * Local progress is cleared once the server has it, so a later launch reads
   * `profiles.onboarded` and does not try to resume a flow that is over.
   */
  const finish = useCallback(async () => {
    if (!userId) return
    setSaving(true)
    const result = await apiClient.updateProfile(userId, { ...draft, onboarded: true })
    setSaving(false)

    if (!result.success) {
      Logger.warn('auth', 'Could not complete onboarding', { error: result.error })
      return false
    }

    await clearOnboarding(userId)
    return true
  }, [draft, userId])

  return { draft, progress, loaded, saving, update, commit, skip, finish, goTo }
}
