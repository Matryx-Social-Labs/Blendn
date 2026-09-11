import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'

import { apiClient } from './apiClient'
import { Logger } from './logger'
import {
  EMPTY_PROGRESS,
  ONBOARDING_ROUTES,
  advance,
  nextStep,
  previousStep,
  stepPayload,
  type OnboardingDraft,
  type OnboardingProgress,
  type OnboardingStep,
} from './onboarding'
import { clearOnboarding, readOnboarding, writeOnboarding } from './onboardingStorage'
import { useAuth } from './useAuth'

/**
 * Make the server's interest graph match what was picked.
 *
 * The server has no "replace": POST is additive (`skipDuplicates`) and DELETE
 * removes. So "match" is a diff — read what is held, add what is missing,
 * remove what was un-ticked. The first version only ever POSTed, which meant
 * going back to the picker and deselecting something left it on the server for
 * ever, and nothing anywhere called DELETE.
 *
 * Returns false on any failure so the caller can warn; never throws, because
 * both callers sit under the "a failed server save does not block anyone" rule.
 */
export async function syncInterests(userId: string, wanted: string[]): Promise<boolean> {
  const held = await apiClient.getProfileInterests(userId)
  if (!held.success || !held.data) return false
  const heldIds = new Set(held.data.interests.map((i) => i.id))
  const wantedIds = new Set(wanted)
  const add = [...wantedIds].filter((id) => !heldIds.has(id))
  const remove = [...heldIds].filter((id) => !wantedIds.has(id))

  let ok = true
  if (add.length) ok = (await apiClient.addProfileInterests(userId, add)).success && ok
  if (remove.length) ok = (await apiClient.removeProfileInterests(userId, remove)).success && ok
  return ok
}

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

  /*
   * Three ways to move, and they are not interchangeable.
   *
   * Everything used to be `router.replace`, which swaps the screen and keeps no
   * history. Two things fell out of that and both were reported: every
   * transition animated as *forward*, so going back looked like going deeper;
   * and with no history there was nothing for an edge-swipe to pop, so the
   * gesture every iPhone user reaches for did nothing.
   */

  /** Forward a step. `push` is what creates the entry that makes back work. */
  const advanceTo = useCallback((target: OnboardingStep) => {
    router.push(ONBOARDING_ROUTES[target] as never)
  }, [])

  /**
   * Back a step.
   *
   * Pops when there is something to pop, and falls back to replacing when there
   * is not — and the fallback is the whole point, because "there is not" is
   * common rather than exotic.
   *
   * A history only exists for steps you walked through *this* launch. Resume
   * drops you straight onto step five with `replace`, so the stack is one deep;
   * the first back pops that single entry and every one after it finds nothing
   * and does nothing. Which is exactly the reported symptom: back works once,
   * then stops.
   *
   * Guarding on `previousStep` rather than on `canGoBack` also gets the first
   * screen right for the correct reason — there is no step before `basics`, so
   * there is nothing to go back *to*, whatever the navigation stack happens to
   * contain underneath the flow.
   */
  const goBack = useCallback(() => {
    const previous = previousStep(step)
    if (!previous) return
    if (router.canGoBack()) {
      router.back()
      return
    }
    // No history — resumed onto this step, or already popped what there was.
    // `replace` keeps the stack from growing backwards.
    router.replace(ONBOARDING_ROUTES[previous] as never)
  }, [step])

  /**
   * Jump to an arbitrary step, with no history.
   *
   * Resume on launch, and "edit my details" from the review screen. `replace`
   * is right here precisely because it leaves no back stack — a back gesture
   * should not walk into screens this person never visited.
   */
  const jumpTo = useCallback((target: OnboardingStep) => {
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
        /*
         * The structured graph, before the profile write.
         *
         * Onboarding never wrote `user_interests` at all — it sent the free-text
         * names and nothing else — so a person who finished it could not post on
         * the pre-event board, which gates on `interestCount >= 2`, and matched
         * weakly because ranking's dominant term is the graph.
         *
         * Ordered first for the reason `app/about-you.tsx` gives: this call is
         * idempotent and re-runnable from edit-profile, so if the profile write
         * below fails nothing is permanently lost.
         *
         * Only on the step that owns the picker. `interestIds` is not a profile
         * field — `updateProfileSchema` has no such key and strips it — so the
         * per-step profile PUT below can never carry it, and `finish()` has to
         * sync it explicitly to be the backstop this file promises.
         */
        if (step === 'details' && merged.interestIds) {
          const synced = await syncInterests(userId, merged.interestIds)
          if (!synced) {
            Logger.warn('auth', 'Onboarding could not save the interest graph', { step })
          }
        }

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
      if (after) advanceTo(after)
    },
    [advanceTo, draft, progress, step, userId]
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
    if (after) advanceTo(after)
  }, [advanceTo, draft, progress, step, userId])

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

    /*
     * The graph is NOT in the profile PUT — `updateProfileSchema` strips
     * `interestIds` — so re-sending the draft below does not re-send it. This
     * call is what makes the "everything is re-sent here" claim above true for
     * the one field whose absence is silent. The first version of this file
     * claimed the backstop and did not have it.
     *
     * `undefined` means the picker was never visited; syncing to `[]` would
     * wipe a graph set elsewhere (edit-profile, `about-you`).
     */
    if (draft.interestIds) {
      try {
        const synced = await syncInterests(userId, draft.interestIds)
        if (!synced) Logger.warn('auth', 'Finishing onboarding could not save the interest graph')
      } catch (error) {
        Logger.warn('auth', 'Finishing onboarding threw while saving the interest graph', { error })
      }
    }

    const result = await apiClient.updateProfile(userId, { ...draft, onboarded: true })
    setSaving(false)

    if (!result.success) {
      Logger.warn('auth', 'Could not complete onboarding', { error: result.error })
      return false
    }

    await clearOnboarding(userId)
    return true
  }, [draft, userId])

  return { draft, progress, loaded, saving, update, commit, skip, finish, goBack, jumpTo }
}
