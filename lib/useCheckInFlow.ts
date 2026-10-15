import { router } from 'expo-router'
import { useRef, useState } from 'react'
import { apiClient } from './apiClient'
import { afterTrayDismissed } from '../components/ActionTray'
import { askIntentRoute, revealOffer, submitCheckIn, untilIntentAnswered, type CheckInOutcome } from './checkIn'
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
 * docs/redesign/SCREENS.md Flow 4): the press or the hold is the consent. A
 * fresh check-in goes in Flow 4's order (Tonight #12–#14, motion #9): the
 * pour, then the reveal offer and "Why do you go out?" if the server asks,
 * then the room. Nothing navigates while any of it is still on screen.
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
   * Into the room, last, once the pour and the questions are done: the event
   * screen pushes its chat; the Blend'n overlay settles once its Room is there.
   */
  onEnterRoom?: () => void | Promise<void>
  /** The fix the check-in was sent from, before it is sent. */
  onLocated?: (location: CheckInLocation) => void
}

export function useCheckInFlow({
  eventId,
  showTray,
  closeTray,
  onCheckedIn,
  onOpenMaps,
  onEnterRoom,
  onLocated,
}: UseCheckInFlowOptions) {
  const { user } = useAuth()
  /** The flow is running: from the press until the room is entered or the door said no. */
  const [checkingIn, setCheckingIn] = useState(false)
  /**
   * The server said yes and the room isn't on screen yet: the pass reads
   * "You're in" (Flow 4 delta R2-D1 "success"), never a re-armed hold.
   * `asks`: a question (the reveal offer, the intent) comes before the room.
   */
  const [arrival, setArrival] = useState<{ asks: boolean } | null>(null)
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
  /** The reveal offer's answer, while it is open. */
  const revealAnswer = useRef<((yes: boolean) => void) | null>(null)
  /** The tray's own close (its backdrop): the caller's `ActionTray onClose`, so an open offer counts as "no". */
  const dismissTray = () => {
    revealAnswer.current?.(false)
    revealAnswer.current = null
    closeTray()
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
        const { askIntent, revealSuggestion } = outcome
        setArrival({ asks: askIntent || revealSuggestion })
        // Update check-in status directly - no need for another API call. Now,
        // not after the pour, so the button turns as it starts.
        onCheckedIn?.(outcome)
        // The pour is the one ceremony (motion #9); it hands off at 700 ms, or
        // later if the caller holds it for its room.
        await new Promise<void>((handOff) => {
          pourHandedOff.current = handOff
          setPours((n) => n + 1)
        })

        // What follows a check-in is decided in `lib/checkIn.ts`, the same for
        // every door; only the trays are this screen's.
        let trayShown = false
        if (revealSuggestion) {
          const offer = await revealOffer({
            id: user.id,
            firstName: user.name?.trim().split(/\s+/)[0] ?? null,
            image: user.image,
          })
          trayShown = true
          const yes = await new Promise<boolean>((answer) => {
            revealAnswer.current = answer
            const reply = (value: boolean) => () => {
              revealAnswer.current = null
              closeTray()
              answer(value)
            }
            showTray(offer.title, offer.message, [
              { label: offer.cancel, onPress: reply(false) },
              { label: offer.confirm, variant: 'primary', onPress: reply(true) },
            ])
          })
          if (yes) {
            apiClient
              .setMatchPreferences(eventId, { revealed: true })
              .catch((e) => Logger.error('match', 'reveal from prompt failed', { error: e }))
          }
        }
        if (askIntent) {
          // iOS drops a push made while a tray is still leaving.
          if (trayShown) await afterTrayDismissed()
          const answered = untilIntentAnswered()
          router.push(askIntentRoute(eventId))
          await answered
        }
        await onEnterRoom?.()
        return 'checkedIn'
      }
    } catch (error) {
      Logger.error('events', 'checkin:exception', { error: error as any })
      H.error({ blocking: true })
      showTray('Check-in failed', 'Something went wrong. Please try again.')
      return 'failed'
    } finally {
      setArrival(null)
      setCheckingIn(false)
    }
  }

  return { checkingIn, youreIn: arrival !== null, asks: arrival?.asks ?? false, pours, pourDone, dismissTray, start, getCurrentLocation }
}
