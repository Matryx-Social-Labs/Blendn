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

      const body = stepPayload(step, merged)
      if (Object.keys(body).length > 0) {
        const result = await apiClient.updateProfile(userId, body as never)
        if (!result.success) {
          // Logged, not surfaced. The draft is safe locally and the final step
          // re-sends everything, so the only cost of this failure is that the
          // dashboard sees the profile a few minutes later than it might have.
          Logger.warn('auth', 'Onboarding step did not save to the server', {
            step,
            error: result.error,
          })
        }
      }
      setSaving(false)

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
    const result = await apiClient.updateProfile(userId, {
      ...draft,
      onboarded: true,
    } as never)
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
