import { router } from 'expo-router'
import { useRef, useState } from 'react'
import { apiClient } from './apiClient'
import { askIntentRoute, revealOffer, submitCheckIn, type CheckInOutcome } from './checkIn'
import { isExpectedRefusal } from './checkInRefusal'
import { H } from './haptics'
import { getCurrentLocation as getLocationFix, type CheckInLocation, type ShowTray } from './locationFix'
import { Logger } from './logger'
import { useAuth } from './useAuth'

/**
 * The check-in, as a hook, so every door runs it unchanged: the event
 * screen's "Blend in" and the Blend'n room's hold.
 *
 * `lib/checkIn.ts` holds what is the same wherever the button is: the request
 * and how its answer is read. This is the layer above it — the position, the
 * trays for each answer, the pour, the reveal offer and "Why do you go out?" —
 * so both doors say exactly the same thing. The trays and the pour are still
 * the caller's to draw (`showTray` / `closeTray`, `<MomentPour>`); only what
 * they say, and when, lives here.
 *
 * No rules tray before it and no "Checked in" tray after (the owner's ask,
 * docs/redesign/SCREENS.md Flow 4): the press or the hold is the consent, and
 * a fresh check-in pours straight into the room.
 */

export type CheckInFlowResult = 'checkedIn' | 'refused' | 'failed'

/** A check-in that left the user inside: a fresh one, or one they already had. */
export type CheckedInOutcome =
  | Extract<CheckInOutcome, { kind: 'checkedIn' }>
  | Extract<CheckInOutcome, { kind: 'refused' }>

export type UseCheckInFlowOptions = {
  eventId: string
  showTray: ShowTray
  closeTray: () => void
  /**
   * The user is checked in — the outcome is the fresh check-in, or the refusal
   * that says they already were. The caller's optimistic state goes here.
   */
  onCheckedIn?: (outcome: CheckedInOutcome) => void
  /** "Open Maps" on a refusal a map can fix. Without it the button only closes. */
  onOpenMaps?: () => void
  /**
   * Into the room when the pour hands off, for a screen that is not the room:
   * the event screen opens its chat. The Blend'n overlay passes none, because
   * it turns into the Room under the pour by itself.
   */
  onOpenChat?: () => void | Promise<void>
  /** The fix the check-in was sent from, before it is sent. */
  onLocated?: (location: CheckInLocation) => void
}

export function useCheckInFlow({
  eventId,
  showTray,
  closeTray,
  onCheckedIn,
  onOpenMaps,
  onOpenChat,
  onLocated,
}: UseCheckInFlowOptions) {
  const { user } = useAuth()
  const [checkingIn, setCheckingIn] = useState(false)
  /**
   * Counts fresh check-ins, for `<MomentPour key={pours} onDone={pourDone} />`
   * once it is above 0. It bumps when the server says yes, and the pour plays
   * the success haptic itself, so the check-in plays none (§10). "You were
   * already in" doesn't count: that isn't news.
   */
  const [pours, setPours] = useState(0)
  /** Settles the running check-in's wait for its pour to hand off. */
  const pourHandedOff = useRef<(() => void) | null>(null)
  const pourDone = () => {
    pourHandedOff.current?.()
    pourHandedOff.current = null
  }

  // "Try Again" on a weak fix runs the check-in again; a fix alone went nowhere (step 5 review, H4).
  const getCurrentLocation = () => getLocationFix({ showTray, closeTray, onRetry: () => void start() })

  /** Run the check-in: straight to the position and the request, no tray first. */
  const start = async (): Promise<CheckInFlowResult> => {
    setCheckingIn(true)

    try {
      Logger.journey('checkin', 'detail:start', { eventId })
      if (!user) {
        Logger.journey('auth', 'detail:blocked:notSignedIn')
        showTray('Sign in required', 'Please sign in to check in to events.')
        setCheckingIn(false)
        return 'failed'
      }

      // Get current location
      const location = await getCurrentLocation()
      if (!location) {
        Logger.warn('events', 'checkin:location:unavailable')
        setCheckingIn(false)
        return 'failed'
      }

      onLocated?.(location)

      const outcome = await submitCheckIn(eventId, location)

      if (outcome.kind === 'timeout') {
        Logger.warn('events', 'checkin:timeout')
        showTray('Still checking you in', 'This is taking longer than expected. Please try again.', [
          { label: 'Cancel', onPress: closeTray },
          {
            label: 'Retry',
            variant: 'primary',
            onPress: () => {
              closeTray()
              start()
            }
          }
        ])
        return 'failed'
      } else if (outcome.kind === 'refused') {
        // The door saying no (too far, not open yet) is the flow working, not
        // a failure: info, so Sentry only hears about requests that broke.
        if (isExpectedRefusal(outcome.errorCode)) {
          Logger.info('events', 'checkin:refused', { code: outcome.errorCode })
        } else {
          Logger.error('events', 'checkin:api:error', { title: outcome.refusal.title })
        }
        const { refusal } = outcome
        if (outcome.alreadyCheckedIn) {
          Logger.journey('checkin', 'detail:alreadyCheckedIn')
          onCheckedIn?.(outcome)
        } else {
          H.error({ blocking: true })
        }

        showTray(
          refusal.title,
          refusal.message,
          refusal.offerDirections
            ? [
                { label: 'Done', onPress: closeTray },
                {
                  label: 'Open Maps',
                  variant: 'primary',
                  onPress: () => {
                    closeTray()
                    onOpenMaps?.()
                  },
                },
              ]
            : undefined
        )
        // Already in is the answer the user wanted, whatever the server calls it.
        return outcome.alreadyCheckedIn ? 'checkedIn' : 'refused'
      } else {
        Logger.journey('checkin', 'detail:success', { eventId })
        // Update check-in status directly - no need for another API call. Now,
        // not after the pour, so the button turns as it starts.
        onCheckedIn?.(outcome)
        // The pour is the one ceremony (DESIGN-BRIEF §9.3 #9). A tray or a
        // pushed screen would cover it, so the next step waits for its hand-off.
        await new Promise<void>((handOff) => {
          pourHandedOff.current = handOff
          setPours((n) => n + 1)
        })

        // What follows a check-in is decided in `lib/checkIn.ts`, the same for
        // every door; only the trays are this screen's.
        const { askIntent } = outcome
        // Into the room, with "Why do you go out?" on top of it, so saving lands them there.
        const enterRoom = async () => {
          await onOpenChat?.()
          if (askIntent) router.push(askIntentRoute(eventId))
        }

        if (outcome.revealSuggestion) {
          const offer = await revealOffer({
            id: user.id,
            firstName: user.name?.trim().split(/\s+/)[0] ?? null,
            image: user.image,
          })
          showTray(offer.title, offer.message, [
            {
              label: offer.cancel,
              onPress: () => {
                closeTray()
                void enterRoom()
              },
            },
            {
              label: offer.confirm,
              variant: 'primary',
              onPress: () => {
                closeTray()
                void enterRoom()
                apiClient
                  .setMatchPreferences(eventId, { revealed: true })
                  .catch((e) => Logger.error('match', 'reveal from prompt failed', { error: e }))
              },
            },
          ])
        } else {
          await enterRoom()
        }

        return 'checkedIn'
      }
    } catch (error) {
      Logger.error('events', 'checkin:exception', { error: error as any })
      H.error({ blocking: true })
      showTray('Check-in failed', 'Something went wrong. Please try again.')
      return 'failed'
    } finally {
      setCheckingIn(false)
    }
  }

  return { checkingIn, pours, pourDone, start, getCurrentLocation }
}
